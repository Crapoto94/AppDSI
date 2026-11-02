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
const crypto = require('crypto');
const { spawn } = require('child_process');

const VERSION = '1.2.0';

// Exécutable autonome (Node SEA) : la configuration se trouve à côté de l'exécutable
let BASE_DIR = __dirname;
try { if (require('node:sea').isSea()) BASE_DIR = path.dirname(process.execPath); } catch { /* Node sans module SEA */ }
const DEFAULTS = {
  port: 47821,
  // Origines (schéma + hôte + port) autorisées à utiliser l'agent : adresses du Hub
  origins: ['https://dsihub.ivry.local', 'https://parapheur.ivry94.fr', 'http://localhost:5173'],
};

const CONFIG_FILE = path.join(BASE_DIR, 'agent.config.json');
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const RUN_VALUE = 'DSIHubSignatureAgent';

function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') console.error('agent.config.json illisible :', e.message); }
  const origins = (process.env.AGENT_ORIGINS ? process.env.AGENT_ORIGINS.split(',') : cfg.origins || DEFAULTS.origins)
    .map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
  return { port: Number(process.env.AGENT_PORT || cfg.port || DEFAULTS.port), origins };
}

let config = loadConfig();

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

const TRAY_SCRIPT = String.raw`
param([int]$Port, [string]$ParentPid, [string]$SelfTest)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$token = $env:AGENT_LOCAL_TOKEN
$base = "http://127.0.0.1:$Port"
$title = 'Agent de signature DSI Hub'

function Call-Agent([string]$method, [string]$path, $body) {
  $args2 = @{ Uri = ($base + $path); Method = $method; Headers = @{ 'X-Agent-Local' = $token }; TimeoutSec = 40; UseBasicParsing = $true }
  if ($null -ne $body) { $args2.Body = [System.Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Compress)); $args2.ContentType = 'application/json; charset=utf-8' }
  Invoke-RestMethod @args2
}

function New-AgentIcon {
  $bmp = New-Object System.Drawing.Bitmap 32, 32
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(79, 70, 229))), 1, 1, 30, 30)
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 3)
  $g.DrawEllipse($pen, 6, 11, 9, 9)
  $g.DrawLine($pen, 15, 15, 26, 15)
  $g.DrawLine($pen, 22, 15, 22, 20)
  $g.DrawLine($pen, 26, 15, 26, 19)
  $g.Dispose()
  [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}

function Show-Settings {
  if ($script:form -and -not $script:form.IsDisposed) { $script:form.Activate(); return }
  $state = Call-Agent 'GET' '/local/state' $null
  $f = New-Object System.Windows.Forms.Form
  $script:form = $f
  $f.Text = "Paramètres - $title"
  $f.Size = New-Object System.Drawing.Size(720, 640)
  $f.StartPosition = 'CenterScreen'
  $f.FormBorderStyle = 'FixedDialog'
  $f.MaximizeBox = $false
  $f.Font = New-Object System.Drawing.Font('Segoe UI', 9)
  $f.Icon = $script:icon

  $lblState = New-Object System.Windows.Forms.Label
  $lblState.Location = '16,14'; $lblState.Size = '670,38'
  $lblState.Text = ("État : en cours d'exécution - version {0} - port {1}{2}" -f $state.version, $state.port, $(if ($state.testMode) { ' - MODE TEST' } else { '' }))
  $lblState.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
  $f.Controls.Add($lblState)

  $gbStart = New-Object System.Windows.Forms.GroupBox
  $gbStart.Text = 'Démarrage'; $gbStart.Location = '16,56'; $gbStart.Size = '670,52'
  $cbAuto = New-Object System.Windows.Forms.CheckBox
  $cbAuto.Text = "Lancer l'agent automatiquement à l'ouverture de session Windows"
  $cbAuto.Location = '14,22'; $cbAuto.Size = '630,22'
  $cbAuto.Checked = [bool]$state.autostart
  $cbAuto.Enabled = [bool]$state.installed
  if (-not $state.installed) { $cbAuto.Text += ' (version installée uniquement)' }
  $cbAuto.Add_Click({
    try { [void](Call-Agent 'POST' '/local/autostart' @{ enabled = $cbAuto.Checked }) }
    catch { [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, $title, 'OK', 'Warning') | Out-Null; $cbAuto.Checked = -not $cbAuto.Checked }
  })
  $gbStart.Controls.Add($cbAuto)
  $f.Controls.Add($gbStart)

  $gbOrig = New-Object System.Windows.Forms.GroupBox
  $gbOrig.Text = 'Adresses du Hub autorisées à utiliser l''agent'; $gbOrig.Location = '16,116'; $gbOrig.Size = '670,170'
  $tbOrig = New-Object System.Windows.Forms.TextBox
  $tbOrig.Multiline = $true; $tbOrig.Location = '14,24'; $tbOrig.Size = '640,84'; $tbOrig.ScrollBars = 'Vertical'
  $tbOrig.Text = ($state.origins -join [Environment]::NewLine)
  $tbOrig.SelectionStart = 0; $tbOrig.SelectionLength = 0
  $lblNote = New-Object System.Windows.Forms.Label
  $lblNote.Text = "Une adresse par ligne, ex. https://dsihub.ivry.local. Appliqué immédiatement."
  $lblNote.Location = '14,112'; $lblNote.Size = '460,20'; $lblNote.ForeColor = [System.Drawing.Color]::DimGray
  $btnSave = New-Object System.Windows.Forms.Button
  $btnSave.Text = 'Enregistrer'; $btnSave.Location = '554,130'; $btnSave.Size = '100,28'
  $btnSave.Add_Click({
    try {
      $list = @($tbOrig.Text -split '
?
' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
      [void](Call-Agent 'PUT' '/local/config' @{ origins = $list })
      [System.Windows.Forms.MessageBox]::Show('Paramètres enregistrés.', $title, 'OK', 'Information') | Out-Null
    } catch {
      $m = $_.Exception.Message
      try { $m = ($_.ErrorDetails.Message | ConvertFrom-Json).error } catch { }
      [System.Windows.Forms.MessageBox]::Show($m, $title, 'OK', 'Warning') | Out-Null
    }
  })
  $gbOrig.Controls.AddRange(@($tbOrig, $lblNote, $btnSave))
  $f.Controls.Add($gbOrig)

  $gbCerts = New-Object System.Windows.Forms.GroupBox
  $gbCerts.Text = 'Certificats détectés sur ce poste'; $gbCerts.Location = '16,294'; $gbCerts.Size = '670,200'
  $lv = New-Object System.Windows.Forms.ListView
  $lv.View = 'Details'; $lv.FullRowSelect = $true; $lv.GridLines = $true; $lv.Location = '14,24'; $lv.Size = '640,130'
  [void]$lv.Columns.Add('Titulaire', 190); [void]$lv.Columns.Add('Émetteur', 190); [void]$lv.Columns.Add('Valide jusqu''au', 100); [void]$lv.Columns.Add('Usage', 140)
  $btnRefresh = New-Object System.Windows.Forms.Button
  $btnRefresh.Text = 'Actualiser'; $btnRefresh.Location = '554,160'; $btnRefresh.Size = '100,28'
  $fill = {
    $lv.Items.Clear()
    try {
      $r = Call-Agent 'GET' '/local/certificates' $null
      foreach ($c in @($r.certificates)) {
        $cn = if ($c.subject -match '(?:^|,\s*)CN=([^,]+)') { $Matches[1] } else { $c.subject }
        $ic = if ($c.issuer -match '(?:^|,\s*)CN=([^,]+)') { $Matches[1] } else { $c.issuer }
        $it = New-Object System.Windows.Forms.ListViewItem($cn)
        [void]$it.SubItems.Add($ic)
        [void]$it.SubItems.Add(([datetime]$c.notAfter).ToString('dd/MM/yyyy'))
        [void]$it.SubItems.Add($(if ($c.nonRepudiation) { 'Signature' } else { 'Authentification' }))
        [void]$lv.Items.Add($it)
      }
    } catch { [void]$lv.Items.Add('Lecture impossible : ' + $_.Exception.Message) }
  }
  $btnRefresh.Add_Click($fill)
  $gbCerts.Controls.AddRange(@($lv, $btnRefresh))
  $f.Controls.Add($gbCerts)
  & $fill

  $lblInfo = New-Object System.Windows.Forms.Label
  $lblInfo.Location = '16,502'; $lblInfo.Size = '670,52'; $lblInfo.ForeColor = [System.Drawing.Color]::DimGray
  $lblInfo.Text = ("Programme : {0}{3}Configuration : {1}{3}Journal : {2}" -f $state.exe, $state.configFile, $state.logFile, [Environment]::NewLine)
  $f.Controls.Add($lblInfo)

  $btnLog = New-Object System.Windows.Forms.Button
  $btnLog.Text = 'Ouvrir le journal'; $btnLog.Location = '16,566'; $btnLog.Size = '130,28'
  $btnLog.Add_Click({ if (Test-Path $state.logFile) { Start-Process notepad.exe $state.logFile } else { [System.Windows.Forms.MessageBox]::Show('Aucun journal pour le moment.', $title) | Out-Null } })
  $btnDir = New-Object System.Windows.Forms.Button
  $btnDir.Text = 'Ouvrir le dossier'; $btnDir.Location = '154,566'; $btnDir.Size = '130,28'
  $btnDir.Add_Click({ Start-Process explorer.exe $state.baseDir })
  $btnClose = New-Object System.Windows.Forms.Button
  $btnClose.Text = 'Fermer'; $btnClose.Location = '586,566'; $btnClose.Size = '100,28'
  $btnClose.Add_Click({ $f.Close() })
  $f.Controls.AddRange(@($btnLog, $btnDir, $btnClose))
  $f.CancelButton = $btnClose

  if ($SelfTest) {
    $f.Show(); $f.Refresh()
    $bmp = New-Object System.Drawing.Bitmap($f.Width, $f.Height)
    $f.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $f.Width, $f.Height)))
    $bmp.Save($SelfTest, [System.Drawing.Imaging.ImageFormat]::Png)
    $f.Close()
    return
  }
  $f.Show()
  $f.Activate()
}

$script:icon = New-AgentIcon
if ($SelfTest) { Show-Settings; exit 0 }

$ni = New-Object System.Windows.Forms.NotifyIcon
$ni.Icon = $script:icon
$ni.Text = $title
$ni.Visible = $true
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miSettings = $menu.Items.Add('Paramètres…')
$miSettings.Font = New-Object System.Drawing.Font($miSettings.Font, [System.Drawing.FontStyle]::Bold)
$miLog = $menu.Items.Add('Ouvrir le journal')
[void]$menu.Items.Add('-')
$miQuit = $menu.Items.Add("Quitter l'agent")
$ni.ContextMenuStrip = $menu
$miSettings.Add_Click({ try { Show-Settings } catch { [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, $title) | Out-Null } })
$ni.Add_DoubleClick({ try { Show-Settings } catch { } })
$miLog.Add_Click({ try { $st = Call-Agent 'GET' '/local/state' $null; if (Test-Path $st.logFile) { Start-Process notepad.exe $st.logFile } } catch { } })
$miQuit.Add_Click({
  $r = [System.Windows.Forms.MessageBox]::Show("Arrêter l'agent de signature ? La signature avec votre clé ne sera plus possible jusqu'à son redémarrage.", $title, 'YesNo', 'Question')
  if ($r -eq 'Yes') { try { [void](Call-Agent 'POST' '/local/quit' $null) } catch { }; $ni.Visible = $false; [System.Windows.Forms.Application]::Exit() }
})

# L'icône disparaît quand l'agent s'arrête
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({ if (-not (Get-Process -Id ([int]$ParentPid) -ErrorAction SilentlyContinue)) { $ni.Visible = $false; [System.Windows.Forms.Application]::Exit() } })
$timer.Start()
[System.Windows.Forms.Application]::Run()
$ni.Dispose()
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

// ─── Paramètres locaux (icône de la zone de notification) ───────────────────────────────────────
// Routes /local/* : réservées à l'icône de notification, qui reçoit un jeton aléatoire propre à cette exécution
// (variable d'environnement). Un navigateur ne peut pas les appeler : il n'a pas le jeton et envoie un en-tête Origin.
const LOCAL_TOKEN = (TEST_MODE && process.env.AGENT_LOCAL_TOKEN) || crypto.randomBytes(24).toString('hex'); // jeton imposé : tests uniquement
const RE_ORIGIN = /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/;
const isInstalledExe = () => /DSIHubSignatureAgent\.exe$/i.test(process.execPath);

function runReg(args) {
  return new Promise((resolve) => {
    const c = spawn('reg.exe', args, { windowsHide: true });
    c.on('error', () => resolve(1));
    c.on('close', (code) => resolve(code));
  });
}
const isAutostart = async () => process.platform === 'win32' && isInstalledExe() && (await runReg(['query', RUN_KEY, '/v', RUN_VALUE])) === 0;
async function setAutostart(enabled) {
  if (process.platform !== 'win32' || !isInstalledExe()) throw new Error("Le démarrage automatique n'est géré que pour la version installée.");
  const code = enabled
    ? await runReg(['add', RUN_KEY, '/v', RUN_VALUE, '/t', 'REG_SZ', '/d', `"${process.execPath}"`, '/f'])
    : await runReg(['delete', RUN_KEY, '/v', RUN_VALUE, '/f']);
  if (code !== 0 && enabled) throw new Error('Modification du registre impossible.');
}

async function handleLocal(req, url, res) {
  const json = (st, body) => send(res, st, body, {});
  const given = String(req.headers['x-agent-local'] || '');
  const ok = given.length === LOCAL_TOKEN.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(LOCAL_TOKEN));
  if (!ok || req.headers.origin) return json(403, { error: 'Accès refusé.' });

  if (req.method === 'GET' && url.pathname === '/local/state') {
    return json(200, {
      version: VERSION, port: config.port, origins: config.origins, platform: process.platform, testMode: TEST_MODE,
      configFile: CONFIG_FILE, configExists: fs.existsSync(CONFIG_FILE), logFile: LOG_FILE, exe: process.execPath, baseDir: BASE_DIR,
      installed: isInstalledExe(), autostart: await isAutostart(),
    });
  }
  if (req.method === 'GET' && url.pathname === '/local/certificates') return json(200, { certificates: await runPs('list', {}, 30000) });
  if (req.method === 'PUT' && url.pathname === '/local/config') {
    const b = await readBody(req);
    const origins = (Array.isArray(b.origins) ? b.origins : []).map((o) => String(o).trim().replace(/\/+$/, '')).filter(Boolean);
    const bad = origins.find((o) => !RE_ORIGIN.test(o));
    if (bad) return json(400, { error: `Adresse invalide : ${bad} (attendu : https://hote ou https://hote:port).` });
    if (!origins.length) return json(400, { error: 'Indiquez au moins une adresse autorisée.' });
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { cfg = {}; }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...cfg, origins }, null, 2), 'utf8');
    config = { ...config, origins };
    log(`paramètres enregistrés : origines = ${origins.join(', ')}`);
    return json(200, { ok: true, origins });
  }
  if (req.method === 'POST' && url.pathname === '/local/autostart') {
    const b = await readBody(req);
    await setAutostart(!!b.enabled);
    log(`démarrage automatique ${b.enabled ? 'activé' : 'désactivé'}`);
    return json(200, { autostart: await isAutostart() });
  }
  if (req.method === 'POST' && url.pathname === '/local/quit') {
    json(200, { ok: true });
    log("arrêt demandé depuis l'icône de notification");
    setTimeout(() => process.exit(0), 200);
    return;
  }
  return json(404, { error: 'Route inconnue.' });
}

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
  if (req.url.startsWith('/local/')) {
    try { return await handleLocal(req, new URL(req.url, 'http://127.0.0.1'), res); }
    catch (e) { log('Erreur (paramètres locaux) :', e.message); return send(res, 500, { error: e.message }, {}); }
  }
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

function startTray() {
  if (process.platform !== 'win32' || TEST_MODE || process.env.AGENT_NO_TRAY === '1') return;
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsihub-agent-tray-'));
    const file = path.join(dir, 'tray.ps1');
    fs.writeFileSync(file, '\ufeff' + TRAY_SCRIPT, 'utf8');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', file, '-Port', String(config.port), '-ParentPid', String(process.pid)], {
      windowsHide: true, env: { ...process.env, AGENT_LOCAL_TOKEN: LOCAL_TOKEN },
    });
    child.on('error', (e) => log('icône de notification impossible :', e.message));
    child.stderr.on('data', (d) => log('icône de notification :', String(d).trim().split('\n')[0]));
    process.on('exit', () => { try { child.kill(); } catch { /* déjà arrêté */ } });
  } catch (e) { log('icône de notification impossible :', e.message); }
}

server.listen(config.port, '127.0.0.1', () => {
  log(`Agent de signature DSI Hub ${VERSION} — http://127.0.0.1:${config.port}`);
  log(`Origines autorisées : ${config.origins.join(', ')}${TEST_MODE ? '  [MODE TEST]' : ''}`);
  startTray();
});
