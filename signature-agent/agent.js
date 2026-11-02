#!/usr/bin/env node
/**
 * Agent de signature DSI Hub (Windows) : permet au Parapheur de faire signer une empreinte (SHA-256) par une
 * clé matérielle RGS** (carte à puce / clé USB, ex. Certinomis + SafeNet) branchée sur ce poste.
 *
 * Fonctionnement : le navigateur, sur la page de signature du Hub, appelle cet agent sur http://127.0.0.1:<port>.
 * L'agent liste les certificats du magasin Windows (la clé les y publie via son pilote) et signe l'empreinte avec
 * la clé privée via Windows CNG ; c'est le pilote de la clé (SafeNet) qui demande le code PIN.
 *
 * Sécurité :
 *  - écoute uniquement sur 127.0.0.1 (jamais sur le réseau) ;
 *  - n'accepte que les requêtes dont l'en-tête Origin figure dans la liste autorisée (agent.config.json) ;
 *  - protection contre le « DNS rebinding » (en-tête Host contrôlé) ;
 *  - chaque signature exige une confirmation explicite à l'écran (fenêtre Windows), puis le code PIN ;
 *  - ne signe que des empreintes de 32 octets (SHA-256), jamais de document ; rien n'est écrit sur disque.
 *
 * Aucune dépendance : Node.js (>= 16) et Windows PowerShell 5.1 (présent par défaut sous Windows 10/11).
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const VERSION = '1.1.0';

// Exécutable autonome (Node SEA) : la configuration se trouve à côté de l'exécutable
let BASE_DIR = __dirname;
try { if (require('node:sea').isSea()) BASE_DIR = path.dirname(process.execPath); } catch { /* Node sans module SEA */ }
const DEFAULTS = {
  port: 47821,
  // Origines (schéma + hôte + port) autorisées à utiliser l'agent : adresses du Hub
  origins: ['https://dsihub.ivry.local', 'https://parapheur.ivry94.fr', 'http://localhost:5173'],
};

function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'agent.config.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') console.error('agent.config.json illisible :', e.message); }
  const origins = (process.env.AGENT_ORIGINS ? process.env.AGENT_ORIGINS.split(',') : cfg.origins || DEFAULTS.origins)
    .map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
  return { port: Number(process.env.AGENT_PORT || cfg.port || DEFAULTS.port), origins };
}

const config = loadConfig();

// Journal : fichier (agent lancé sans fenêtre à l'ouverture de session) + console si on en a une
const LOG_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'DSIHubSignatureAgent');
const LOG_FILE = path.join(LOG_DIR, 'agent.log');
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  if (process.stdout.isTTY) console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 1024 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.old'); // 1 Mo maximum
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch { /* journal indisponible : on continue */ }
}
// Mode test (jamais en production) : autorise les requêtes sans Origin (curl) et saute la confirmation à l'écran
const TEST_MODE = process.env.AGENT_TEST === '1';

// ─── PowerShell : listage des certificats et signature (CNG) ──────────────────────────────────────
// Les données arrivent par l'entrée standard (JSON) : aucune valeur n'est jamais interpolée dans la commande.
const PS_SCRIPT = String.raw`
param([string]$Action)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$raw = [Console]::In.ReadToEnd()
$req = $null
if ($raw) { $req = $raw | ConvertFrom-Json }
Add-Type -AssemblyName System.Security

function Get-UserCerts { Get-ChildItem -Path Cert:\CurrentUser\My }

if ($Action -eq 'list') {
  $now = Get-Date
  $out = @()
  foreach ($c in (Get-UserCerts)) {
    if (-not $c.HasPrivateKey) { continue }
    if ($c.NotAfter -lt $now -or $c.NotBefore -gt $now) { continue }
    if ($c.PublicKey.Oid.Value -ne '1.2.840.113549.1.1.1') { continue }  # RSA uniquement
    $nonRep = $false; $digSig = $false
    foreach ($e in $c.Extensions) {
      if ($e -is [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]) {
        $nonRep = [bool]($e.KeyUsages -band [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::NonRepudiation)
        $digSig = [bool]($e.KeyUsages -band [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature)
      }
    }
    $chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
    $chain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
    [void]$chain.Build($c)
    $chainB64 = @()
    foreach ($el in $chain.ChainElements) {
      $cc = $el.Certificate
      if ($cc.Thumbprint -eq $c.Thumbprint) { continue }
      if ($cc.Subject -eq $cc.Issuer) { continue }  # racine : inutile dans la signature
      $chainB64 += [Convert]::ToBase64String($cc.RawData)
    }
    $out += [pscustomobject]@{
      thumbprint = $c.Thumbprint
      subject = $c.Subject
      issuer = $c.Issuer
      friendlyName = $c.FriendlyName
      notBefore = $c.NotBefore.ToUniversalTime().ToString('o')
      notAfter = $c.NotAfter.ToUniversalTime().ToString('o')
      nonRepudiation = $nonRep
      digitalSignature = $digSig
      certificate = [Convert]::ToBase64String($c.RawData)
      chain = $chainB64
    }
  }
  ConvertTo-Json -InputObject @($out) -Depth 5 -Compress
  exit 0
}

if ($Action -eq 'sign') {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('My', [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser)
  $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
  $found = $store.Certificates.Find([System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint, $req.thumbprint, $false)
  $store.Close()
  if ($found.Count -lt 1) { throw 'Certificat introuvable dans le magasin Windows.' }
  $cert = $found[0]
  $tFind = $sw.ElapsedMilliseconds; $tConfirm = 0
  if ($req.confirm) {
    Add-Type -AssemblyName System.Windows.Forms
    $owner = New-Object System.Windows.Forms.Form
    $owner.TopMost = $true; $owner.ShowInTaskbar = $false; $owner.StartPosition = 'CenterScreen'
    $owner.Size = New-Object System.Drawing.Size(0, 0); $owner.Opacity = 0; $owner.Show()
    $msg = "Signer le document :" + [Environment]::NewLine + $req.label + [Environment]::NewLine + [Environment]::NewLine +
           "Certificat : " + $cert.Subject + [Environment]::NewLine + "Demandé par : " + $req.origin + [Environment]::NewLine + [Environment]::NewLine +
           "Après confirmation, votre code PIN sera demandé."
    $answer = [System.Windows.Forms.MessageBox]::Show($owner, $msg, 'Agent de signature DSI Hub', [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Question, [System.Windows.Forms.MessageBoxDefaultButton]::Button2)
    $owner.Close()
    $tConfirm = $sw.ElapsedMilliseconds - $tFind
    if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) {
      ConvertTo-Json -InputObject @{ cancelled = $true } -Compress
      exit 0
    }
  }
  $t0 = $sw.ElapsedMilliseconds
  $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
  if (-not $rsa) { throw 'Clé privée inaccessible (clé débranchée ou PIN refusé).' }
  $tKey = $sw.ElapsedMilliseconds - $t0
  $hash = [Convert]::FromBase64String($req.hash)
  $t1 = $sw.ElapsedMilliseconds
  $sig = $rsa.SignHash($hash, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $tSign = $sw.ElapsedMilliseconds - $t1
  ConvertTo-Json -InputObject @{ signature = [Convert]::ToBase64String($sig); timings = @{ findMs = $tFind; confirmMs = $tConfirm; keyMs = $tKey; signMs = $tSign } } -Compress
  exit 0
}
throw 'Action inconnue.'
`;

let psFile = null;
function ensureScript() {
  if (psFile && fs.existsSync(psFile)) return psFile;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsihub-agent-'));
  psFile = path.join(dir, 'agent.ps1');
  // UTF-8 avec BOM : requis par Windows PowerShell 5.1 pour lire correctement les accents
  fs.writeFileSync(psFile, '﻿' + PS_SCRIPT, 'utf8');
  return psFile;
}

function runPs(action, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('Cet agent fonctionne uniquement sous Windows.'));
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ensureScript(), '-Action', action], { windowsHide: true });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Délai dépassé (aucune réponse de la clé ou du code PIN).')); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error((err.trim().split('\n')[0] || `PowerShell a échoué (code ${code})`).slice(0, 300)));
      try { resolve(out.trim() ? JSON.parse(out) : null); } catch { reject(new Error('Réponse PowerShell illisible.')); }
    });
    child.stdin.end(JSON.stringify(payload || {}));
  });
}

// Une seule signature à la fois (une fenêtre de confirmation / un code PIN à la fois)
let busy = false;

// ─── Serveur HTTP ────────────────────────────────────────────────────────────────────────────
function send(res, status, body, cors) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors });
  res.end(json);
}

function readBody(req, max = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > max) { reject(new Error('Requête trop volumineuse.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('JSON invalide.')); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = String(req.headers.origin || '').replace(/\/+$/, '');
  const host = String(req.headers.host || '');
  const hostOk = host === `127.0.0.1:${config.port}` || host === `localhost:${config.port}`;
  const originOk = config.origins.includes(origin) || (TEST_MODE && !origin);
  const cors = originOk && origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true',  // navigateurs Chromium : accès d'un site à un service local
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  } : {};

  if (!hostOk) return send(res, 400, { error: 'Hôte non autorisé.' }, {});
  if (req.method === 'OPTIONS') {
    if (!originOk) { res.writeHead(403); return res.end(); }
    res.writeHead(204, cors); return res.end();
  }
  // Sonde « l'agent tourne-t-il ? » sans Origin (installateur, supervision locale) : n'expose que la version
  if (!origin && req.method === 'GET' && req.url === '/status') return send(res, 200, { agent: 'dsihub-signature-agent', version: VERSION, platform: process.platform }, {});
  if (!originOk) return send(res, 403, { error: "Origine non autorisée : ajoutez-la dans agent.config.json (« origins »)." }, {});

  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (req.method === 'GET' && url.pathname === '/status') {
      return send(res, 200, { agent: 'dsihub-signature-agent', version: VERSION, platform: process.platform }, cors);
    }

    if (req.method === 'GET' && url.pathname === '/certificates') {
      const list = await runPs('list', {}, 30000);
      // Les certificats de signature (non-répudiation) d'abord
      list.sort((a, b) => Number(b.nonRepudiation) - Number(a.nonRepudiation) || String(a.subject).localeCompare(String(b.subject)));
      return send(res, 200, { certificates: list }, cors);
    }

    if (req.method === 'POST' && url.pathname === '/sign') {
      const b = await readBody(req);
      const hash = Buffer.from(String(b.hash || ''), 'base64');
      if (hash.length !== 32) return send(res, 400, { error: 'Empreinte SHA-256 de 32 octets attendue.' }, cors);
      if (!/^[0-9A-Fa-f]{40}$/.test(String(b.thumbprint || ''))) return send(res, 400, { error: 'Certificat invalide.' }, cors);
      if (busy) return send(res, 409, { error: 'Une signature est déjà en cours sur ce poste.' }, cors);
      busy = true;
      try {
        const label = String(b.label || 'document').replace(/[\r\n]+/g, ' ').slice(0, 120);
        log(`demande de signature « ${label} » (origine ${origin || 'test'})`);
        const started = Date.now();
        const r = await runPs('sign', { thumbprint: b.thumbprint, hash: hash.toString('base64'), label, origin: origin || 'test', confirm: !TEST_MODE }, 5 * 60 * 1000);
        if (r && r.cancelled) return send(res, 200, { cancelled: true }, cors);
        const timings = { ...(r.timings || {}), totalMs: Date.now() - started };
        log(`signature effectuée (${JSON.stringify(timings)})`);
        return send(res, 200, { signature: r.signature, timings }, cors);
      } finally { busy = false; }
    }

    return send(res, 404, { error: 'Route inconnue.' }, cors);
  } catch (e) {
    log('Erreur :', e.message);
    return send(res, 500, { error: e.message }, cors);
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') log(`Le port ${config.port} est déjà utilisé : l'agent est probablement déjà lancé.`);
  else log(e.message);
  process.exit(1);
});

server.listen(config.port, '127.0.0.1', () => {
  log(`Agent de signature DSI Hub ${VERSION} — http://127.0.0.1:${config.port}`);
  log(`Origines autorisées : ${config.origins.join(', ')}${TEST_MODE ? '  [MODE TEST]' : ''}`);
});
