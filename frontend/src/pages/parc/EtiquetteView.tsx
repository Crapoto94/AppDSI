import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Printer, Upload, Edit3, Check, X, Tag, ListOrdered } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

const C = {
  blue: '#2563eb', slate: '#64748b', green: '#059669', red: '#dc2626',
  bg: '#f1f5f9', card: '#fff', border: '#e2e8f0', text: '#0f172a',
};

// LS_LOGO / LS_TEXTS ne sont qu'un cache de repli (serveur injoignable) : la source de
// vérité est le serveur — logo dans le dépôt GED (/api/storage/…) et textes dans
// app_settings (cf. /api/parc/etiquette/logo et /api/parc/etiquette/texts), donc les
// mêmes étiquettes sortent de tous les postes.
export const LS_LOGO  = 'dsi_etiq_logo';
export const LS_TEXTS = 'dsi_etiq_texts';

const LOGO_API = '/api/parc/etiquette/logo';
const TEXTS_API = '/api/parc/etiquette/texts';

// Rend une URL de logo absolue (origine incluse) pour qu'elle se charge depuis la
// fenêtre d'impression (about:blank) ; conserve les data: URL telles quelles.
function absoluteLogoUrl(src: string | null): string | null {
  if (!src) return null;
  if (/^(data:|https?:)/i.test(src)) return src;
  return `${window.location.origin}${src.startsWith('/') ? '' : '/'}${src}`;
}

interface Texts {
  orgName: string;
  serviceName: string;
}

const DEFAULT_TEXTS: Texts = {
  orgName:     "Propriété de la mairie d'Ivry-sur-Seine",
  serviceName: "DSI - 01 49 60 29 88 - hot-line@ivry94.fr",
};

const TEXT_LABELS: Record<keyof Texts, string> = {
  orgName:     'Ligne 1 (organisme)',
  serviceName: 'Ligne 2 (service / contact)',
};

// ─── Génère un SVG QR code (scalable, sans marges) ──────────────────────────
async function makeQrSvg(value: string): Promise<string> {
  if (!value.trim()) return '';
  try {
    let svg = await QRCode.toString(value.trim().toUpperCase(), {
      type: 'svg', margin: 1, errorCorrectionLevel: 'M',
    });
    // rendre le SVG fluide dans son conteneur
    svg = svg.replace(/<svg /, '<svg style="width:100%;height:100%;display:block;" ');
    return svg;
  } catch { return ''; }
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const readLocalTexts = (): Texts => {
  try {
    const saved = localStorage.getItem(LS_TEXTS);
    if (saved) return { ...DEFAULT_TEXTS, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return { ...DEFAULT_TEXTS };
};

/**
 * Réglages d'étiquette (logo + textes) lus sur le SERVEUR, partagés par tous les postes.
 * Le localStorage ne sert que de repli si le serveur est injoignable.
 * `serverTextsEmpty` : le serveur n'a encore aucun texte enregistré (permet de reprendre ceux d'un poste).
 */
export async function loadEtiquetteSettings(token?: string | null): Promise<{ logoUrl: string | null; texts: Texts; serverTextsEmpty: boolean }> {
  const headers = { Authorization: `Bearer ${token || localStorage.getItem('token') || ''}` };
  let logoUrl: string | null = localStorage.getItem(LS_LOGO);
  let texts = readLocalTexts();
  let serverTextsEmpty = false;
  try {
    const r = await axios.get(LOGO_API, { headers });
    logoUrl = r.data?.url || null;
    if (logoUrl) localStorage.setItem(LS_LOGO, logoUrl); else localStorage.removeItem(LS_LOGO);
  } catch { /* repli : cache local */ }
  try {
    const r = await axios.get(TEXTS_API, { headers });
    const d = r.data || {};
    serverTextsEmpty = d.orgName === undefined && d.serviceName === undefined;
    if (!serverTextsEmpty) {
      texts = { orgName: d.orgName ?? DEFAULT_TEXTS.orgName, serviceName: d.serviceName ?? DEFAULT_TEXTS.serviceName };
      localStorage.setItem(LS_TEXTS, JSON.stringify(texts));
    }
  } catch { /* repli : cache local */ }
  return { logoUrl, texts, serverTextsEmpty };
}

// Étiquette complète (code-barres + QR + logo + textes) pour un nom de poste
async function buildOneLabel(machineName: string, logoSrc: string | null, texts: Texts): Promise<string> {
  const qrSvg = await makeQrSvg(machineName);
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svgEl, machineName.toUpperCase(), {
      format: 'CODE128', lineColor: '#000', width: 2, height: 48,
      displayValue: false, margin: 0, background: 'transparent',
    });
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svgEl.style.cssText = 'width:100%;height:auto;display:block;';
  } catch { /* valeur incompatible */ }
  return buildLabelHtml(machineName, logoSrc, texts, svgEl.outerHTML, qrSvg, esc);
}

// Réduit la police du nom jusqu'à ce qu'il tienne sur une ligne (toutes les étiquettes de la page)
const FIT_NAME_SCRIPT = `<script>(function(){var els=document.querySelectorAll('.lbl-name');for(var i=0;i<els.length;i++){var e=els[i],s=14;while(e.scrollWidth>e.offsetWidth+1&&s>7){s-=0.5;e.style.fontSize=s+'pt';}}})();<\/script>`;
const PAGE_CSS = '@page{size:100mm 40mm;margin:0mm;}*,*::before,*::after{box-sizing:border-box;}html,body{margin:0;padding:0;background:#fff;}.pg{width:100mm;height:40mm;overflow:hidden;break-after:page;page-break-after:always;}.pg:last-child{break-after:auto;page-break-after:auto;}';

// ─── Impression d'une étiquette depuis n'importe quel contexte ──────────────
export async function printLabelWindow(machineName: string): Promise<void> {
  const { logoUrl, texts } = await loadEtiquetteSettings();
  const labelHtml = await buildOneLabel(machineName, absoluteLogoUrl(logoUrl), texts);

  const printWin = window.open('', '_blank');
  if (!printWin) { alert("Autorisez les popups pour ce site afin d'imprimer l'étiquette."); return; }

  printWin.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Étiquette ${esc(machineName)}</title>
<style>${PAGE_CSS}html,body{overflow:hidden;}</style>
</head><body><div class="pg">${labelHtml}</div>${FIT_NAME_SCRIPT}</body></html>`);
  printWin.document.close();

  const tryPrint = () => {
    printWin.focus(); printWin.print();
    setTimeout(() => { try { printWin.close(); } catch { /* ignore */ } }, 800);
  };
  const imgs = Array.from(printWin.document.images);
  if (!imgs.length) { tryPrint(); return; }
  let pending = imgs.length;
  const done = () => { if (--pending === 0) tryPrint(); };
  imgs.forEach(img => { if (img.complete) done(); else { img.onload = done; img.onerror = done; } });
  setTimeout(() => { if (pending > 0) tryPrint(); }, 2000);
}

// ─── Impression d'une SÉRIE d'étiquettes (ex. PO20205 → PO25260) ────────────
export const MAX_SERIE = 10000;

/** « PO20205 » → { prefix: 'PO', n: 20205, width: 5 } (les zéros de tête sont conservés). */
function splitSerial(v: string): { prefix: string; n: number; width: number } | null {
  const m = v.trim().toUpperCase().match(/^(\D*)(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], n: parseInt(m[2], 10), width: m[2].startsWith('0') ? m[2].length : 0 };
}

/** Liste des noms d'une série, ou un message d'erreur. */
export function buildSerie(from: string, to: string): { names: string[] } | { error: string } {
  const a = splitSerial(from), b = splitSerial(to);
  if (!a || !b) return { error: 'Saisissez deux noms se terminant par un nombre (ex. PO20205 et PO25260).' };
  if (a.prefix !== b.prefix) return { error: `Le préfixe doit être identique (${a.prefix || 'aucun'} ≠ ${b.prefix || 'aucun'}).` };
  if (b.n < a.n) return { error: 'La fin de série doit être supérieure ou égale au début.' };
  const count = b.n - a.n + 1;
  if (count > MAX_SERIE) return { error: `Série trop longue (${count} étiquettes, ${MAX_SERIE} maximum).` };
  const width = Math.max(a.width, b.width);
  const names: string[] = [];
  for (let n = a.n; n <= b.n; n++) names.push(`${a.prefix}${width ? String(n).padStart(width, '0') : n}`);
  return { names };
}

// Imprime un document HTML complet dans un iframe masqué ; se termine à la fermeture de la boîte d'impression.
function printHtmlInFrame(html: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);
    const win = frame.contentWindow!;
    let finished = false;
    const end = () => { if (finished) return; finished = true; setTimeout(() => { try { frame.remove(); } catch { /* ignore */ } resolve(); }, 300); };

    win.document.open();
    win.document.write(html);
    win.document.close();
    win.addEventListener('afterprint', end);

    const go = () => {
      const t0 = Date.now();
      win.focus();
      win.print();
      // Chromium : print() bloque jusqu'à la fermeture de la boîte d'impression
      if (Date.now() - t0 > 400) end();
    };
    const imgs = Array.from(win.document.images);
    let pending = imgs.filter(i => !i.complete).length;
    if (!pending) { setTimeout(go, 150); return; }
    const done = () => { if (--pending === 0) setTimeout(go, 150); };
    imgs.forEach(img => { if (!img.complete) { img.onload = done; img.onerror = done; } });
    setTimeout(() => { if (pending > 0) { pending = -1000; go(); } }, 4000);
    setTimeout(end, 20 * 60 * 1000); // garde-fou
  });
}

/** Document HTML d'un lot : une page 100 × 40 mm par étiquette. */
export async function buildLotHtml(lot: string[], logoSrc: string | null, texts: Texts): Promise<string> {
  const pages: string[] = [];
  for (const name of lot) pages.push(`<div class="pg">${await buildOneLabel(name, logoSrc, texts)}</div>`);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Étiquettes ${esc(lot[0])} → ${esc(lot[lot.length - 1])}</title><style>${PAGE_CSS}</style></head><body>${pages.join('')}${FIT_NAME_SCRIPT}</body></html>`;
}

export interface SerieProgress { lot: number; lots: number; first: string; last: number | string; done: boolean }

/**
 * Imprime les étiquettes une par une : chaque étiquette est une page 100 × 40 mm, l'imprimante à étiquettes les sort donc
 * à la suite. Par lots (une boîte d'impression par lot) pour ne pas figer le navigateur sur plusieurs milliers de pages.
 */
export async function printSerie(
  names: string[], lotSize: number, token: string | null | undefined,
  onProgress: (p: SerieProgress) => void, shouldStop: () => boolean,
): Promise<void> {
  const { logoUrl, texts } = await loadEtiquetteSettings(token);
  const logoSrc = absoluteLogoUrl(logoUrl);
  const lots = Math.ceil(names.length / lotSize);
  for (let i = 0; i < lots; i++) {
    if (shouldStop()) break;
    const lot = names.slice(i * lotSize, (i + 1) * lotSize);
    onProgress({ lot: i + 1, lots, first: lot[0], last: lot[lot.length - 1], done: false });
    await printHtmlInFrame(await buildLotHtml(lot, logoSrc, texts));
  }
  onProgress({ lot: lots, lots, first: names[0], last: names[names.length - 1], done: true });
}

// ─── HTML de l'étiquette (string) — partagé avec la fenêtre d'impression ────
function buildLabelHtml(
  machineName: string,
  logoSrc: string | null,
  texts: Texts,
  barcodeSvg: string,
  qrSvg: string,
  esc: (s: string) => string,
): string {
  return `<div style="width:100mm;height:40mm;padding:2mm;box-sizing:border-box;display:flex;flex-direction:column;gap:1.5mm;font-family:Arial,Helvetica,sans-serif;background:#fff;color:#000;overflow:hidden;">
  <div style="flex:1;display:flex;gap:2mm;overflow:hidden;min-height:0;">
    <div style="width:20mm;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-right:0.4mm solid #bbb;padding-right:2mm;">
      ${logoSrc ? `<img src="${logoSrc}" alt="logo" style="max-width:100%;max-height:100%;object-fit:contain;display:block;"/>` : '<div style="font-size:6pt;color:#aaa;text-align:center;line-height:1.4;">Logo<br/>DSI</div>'}
    </div>
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1mm;overflow:hidden;">
      <div class="lbl-name" style="font-size:14pt;font-weight:900;letter-spacing:.1em;white-space:nowrap;overflow:hidden;text-align:center;color:#000;line-height:1;width:100%;">${esc(machineName)}</div>
      ${barcodeSvg}
    </div>
    <div style="width:20mm;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-left:0.4mm solid #bbb;padding-left:2mm;">
      ${qrSvg || '<div style="font-size:5pt;color:#aaa;text-align:center;">QR</div>'}
    </div>
  </div>
  <div style="border-top:0.4mm solid #999;padding-top:1.5mm;flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:1mm;text-align:center;">
    <div style="font-size:9.5pt;font-weight:900;color:#000;line-height:1.2;">${esc(texts.orgName)}</div>
    ${texts.serviceName ? `<div style="font-size:9pt;font-weight:700;color:#000;line-height:1.2;">${esc(texts.serviceName)}</div>` : ''}
  </div>
</div>`;
}

// ─── Nom auto-dimensionné ────────────────────────────────────────────────────
// Réduit progressivement la taille de police jusqu'à ce que le texte tienne
// sur une ligne dans son conteneur (de 14pt jusqu'à 7pt minimum).
const AutoSizeName: React.FC<{ name: string }> = ({ name }) => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let size = 14;
    el.style.fontSize = `${size}pt`;
    while (el.scrollWidth > el.offsetWidth + 1 && size > 7) {
      size -= 0.5;
      el.style.fontSize = `${size}pt`;
    }
  }, [name]);

  return (
    <div ref={ref} style={{
      fontSize: '14pt', fontWeight: 900, letterSpacing: '.1em',
      whiteSpace: 'nowrap', overflow: 'hidden',
      textAlign: 'center', color: '#000', lineHeight: 1, width: '100%',
    }}>
      {name || '—'}
    </div>
  );
};

// ─── Contenu de l'étiquette (React) ─────────────────────────────────────────
const LabelContent: React.FC<{
  machineName: string;
  logoSrc: string | null;
  texts: Texts;
  barcodeRef: React.RefObject<SVGSVGElement | null>;
  qrSvg: string;
}> = ({ machineName, logoSrc, texts, barcodeRef, qrSvg }) => (
  <div style={{
    width: '100mm', height: '40mm', padding: '2mm 2mm 2mm 2mm',
    boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '1.5mm',
    fontFamily: 'Arial, Helvetica, sans-serif', background: '#fff', color: '#000', overflow: 'hidden',
  }}>

    {/* ── Ligne principale ── */}
    <div style={{ flex: 1, display: 'flex', gap: '2mm', overflow: 'hidden', minHeight: 0 }}>

      {/* Logo */}
      <div style={{
        width: '20mm', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRight: '0.4mm solid #bbb', paddingRight: '2mm',
      }}>
        {logoSrc
          ? <img src={logoSrc} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
          : <div style={{ fontSize: '6pt', color: '#aaa', textAlign: 'center', lineHeight: 1.4 }}>Logo<br />DSI</div>
        }
      </div>

      {/* Nom + Code-barres */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '1mm', overflow: 'hidden',
      }}>
        <AutoSizeName name={machineName} />
        <svg ref={barcodeRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
      </div>

      {/* Flashcode QR */}
      <div style={{
        width: '20mm', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderLeft: '0.4mm solid #bbb', paddingLeft: '2mm',
      }}>
        {qrSvg
          ? <div dangerouslySetInnerHTML={{ __html: qrSvg }} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }} />
          : <div style={{ fontSize: '5pt', color: '#aaa', textAlign: 'center' }}>QR</div>
        }
      </div>
    </div>

    {/* ── Bande inférieure ── */}
    <div style={{
      borderTop: '0.4mm solid #999', paddingTop: '1.5mm',
      flexShrink: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: '1mm', textAlign: 'center',
    }}>
      <div style={{ fontSize: '9.5pt', fontWeight: 900, color: '#000', lineHeight: 1.2 }}>
        {texts.orgName}
      </div>
      {texts.serviceName && (
        <div style={{ fontSize: '9pt', fontWeight: 700, color: '#000', lineHeight: 1.2 }}>
          {texts.serviceName}
        </div>
      )}
    </div>
  </div>
);

// ─── EtiquetteView ───────────────────────────────────────────────────────────
const EtiquetteView: React.FC = () => {
  const { token } = useAuth();
  const [machineName, setMachineName] = useState('PO25201');
  const [logoSrc, setLogoSrc]   = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [texts, setTexts]       = useState<Texts>(DEFAULT_TEXTS);
  const [editingTexts, setEditingTexts] = useState(false);
  const [draft, setDraft]       = useState<Texts>(DEFAULT_TEXTS);
  const [qrSvg, setQrSvg]       = useState('');

  const barcodeRef   = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Impression d'une série (ex. PO20205 → PO25260)
  const [serieFrom, setSerieFrom] = useState('');
  const [serieTo, setSerieTo]     = useState('');
  const [lotSize, setLotSize]     = useState(250);
  const [serieRun, setSerieRun]   = useState<SerieProgress | null>(null);
  const stopRef = useRef(false);

  // Chargement initial
  useEffect(() => {
    // Affiche immédiatement le cache local pendant que le serveur répond.
    const cached = localStorage.getItem(LS_LOGO);
    if (cached) setLogoSrc(cached);
    const savedTexts = localStorage.getItem(LS_TEXTS);
    if (savedTexts) {
      try { setTexts({ ...DEFAULT_TEXTS, ...JSON.parse(savedTexts) }); } catch { /* ignore */ }
    }

    // Source de vérité : le serveur (logo dans le dépôt GED, textes dans app_settings).
    if (!token) return;
    loadEtiquetteSettings(token).then(s => {
      setLogoSrc(s.logoUrl);
      setTexts(s.texts);
      // Reprise des textes personnalisés saisis auparavant sur ce poste : on les envoie au serveur une fois
      if (s.serverTextsEmpty && localStorage.getItem(LS_TEXTS)) {
        axios.put(TEXTS_API, s.texts, { headers: { Authorization: `Bearer ${token}` } }).catch(() => { /* réessai au prochain chargement */ });
      }
    });
  }, [token]);

  // Barcode
  const renderBarcode = (ref: React.RefObject<SVGSVGElement | null>, value: string) => {
    if (!ref.current || !value.trim()) return;
    try {
      JsBarcode(ref.current, value.trim().toUpperCase(), {
        format: 'CODE128', lineColor: '#000', width: 2, height: 48,
        displayValue: false, margin: 0, background: 'transparent',
      });
      ref.current.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      ref.current.style.width = '100%';
      ref.current.style.height = 'auto';
    } catch { /* valeur incompatible */ }
  };

  useEffect(() => { renderBarcode(barcodeRef, machineName); }, [machineName]);

  // QR code
  useEffect(() => {
    makeQrSvg(machineName).then(setQrSvg);
  }, [machineName]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await axios.post(LOGO_API, form, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      const url: string | null = r.data?.url || null;
      setLogoSrc(url);
      if (url) localStorage.setItem(LS_LOGO, url); else localStorage.removeItem(LS_LOGO);
    } catch (err) {
      const msg = axios.isAxiosError(err) ? (err.response?.data?.error || err.message) : 'Erreur';
      alert(`Échec de l'enregistrement du logo : ${msg}`);
    } finally {
      setLogoBusy(false);
    }
  };

  const handleClearLogo = async () => {
    setLogoBusy(true);
    try {
      await axios.delete(LOGO_API, { headers: { Authorization: `Bearer ${token}` } });
      setLogoSrc(null);
      localStorage.removeItem(LS_LOGO);
    } catch (err) {
      const msg = axios.isAxiosError(err) ? (err.response?.data?.error || err.message) : 'Erreur';
      alert(`Échec de la suppression du logo : ${msg}`);
    } finally {
      setLogoBusy(false);
    }
  };

  const handleValidateTexts = async () => {
    try {
      const r = await axios.put(TEXTS_API, draft, { headers: { Authorization: `Bearer ${token}` } });
      const saved: Texts = { orgName: r.data?.orgName ?? draft.orgName, serviceName: r.data?.serviceName ?? draft.serviceName };
      setTexts(saved);
      localStorage.setItem(LS_TEXTS, JSON.stringify(saved));
      setEditingTexts(false);
    } catch (err) {
      const msg = axios.isAxiosError(err) ? (err.response?.data?.error || err.message) : 'Erreur';
      alert(`Échec de l'enregistrement des textes : ${msg}`);
    }
  };

  const handlePrint = () => {
    renderBarcode(barcodeRef, machineName);
    void printLabelWindow(machineName);
  };

  // Série : nombre d'étiquettes / erreur de saisie
  const serie = serieFrom.trim() && serieTo.trim() ? buildSerie(serieFrom, serieTo) : null;
  const serieCount = serie && 'names' in serie ? serie.names.length : 0;
  const serieLots = serieCount ? Math.ceil(serieCount / lotSize) : 0;
  const serieRunning = !!serieRun && !serieRun.done;

  const handlePrintSerie = async () => {
    if (!serie || !('names' in serie)) return;
    if (serieCount > 500 && !window.confirm(`Imprimer ${serieCount} étiquettes (${serieLots} lot${serieLots > 1 ? 's' : ''}, une boîte d'impression par lot) ?`)) return;
    stopRef.current = false;
    setSerieRun({ lot: 0, lots: serieLots, first: serie.names[0], last: serie.names[serie.names.length - 1], done: false });
    try {
      await printSerie(serie.names, lotSize, token, setSerieRun, () => stopRef.current);
    } catch (err) {
      alert(`Échec de l'impression de la série : ${err instanceof Error ? err.message : 'erreur'}`);
      setSerieRun(null);
    }
  };

  return (
    <div>
      {/* ── Panneau de configuration ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* Nom du poste */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', minWidth: 210 }}>
          <div style={{ fontWeight: 700, fontSize: '.78rem', color: C.slate, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '.05em' }}>Nom du poste</div>
          <input
            value={machineName}
            onChange={e => setMachineName(e.target.value.toUpperCase())}
            placeholder="PO25201"
            style={{ width: '100%', padding: '8px 12px', border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: '1.05rem', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '.1em', boxSizing: 'border-box', outline: 'none' }}
          />
        </div>

        {/* Logo */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: '.78rem', color: C.slate, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '.05em' }}>Logo (bille)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {logoSrc && <img src={logoSrc} alt="logo" style={{ height: 36, objectFit: 'contain', border: `1px solid ${C.border}`, borderRadius: 6, padding: 3, background: '#fafafa' }} />}
            <button onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: C.blue, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '.83rem', fontWeight: 600 }}>
              <Upload size={13} /> {logoSrc ? 'Changer' : 'Uploader'}
            </button>
            {logoSrc && (
              <button onClick={handleClearLogo} style={{ padding: '7px 8px', background: '#fef2f2', color: C.red, border: `1px solid #fecaca`, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Supprimer le logo">
                <X size={13} />
              </button>
            )}
          </div>
          {logoSrc && <div style={{ marginTop: 6, fontSize: '.7rem', color: C.green, display: 'flex', alignItems: 'center', gap: 4 }}><span>●</span> Logo sauvegardé</div>}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
        </div>

        {/* Textes */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', flex: 1, minWidth: 320 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: '.78rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '.05em' }}>Textes de l'étiquette</div>
            {!editingTexts ? (
              <button onClick={() => { setDraft(texts); setEditingTexts(true); }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, cursor: 'pointer', fontSize: '.78rem', fontWeight: 600, color: C.slate }}>
                <Edit3 size={12} /> Modifier
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleValidateTexts} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: C.green, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: '.78rem', fontWeight: 600 }}>
                  <Check size={12} /> Valider
                </button>
                <button onClick={() => setEditingTexts(false)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, cursor: 'pointer', fontSize: '.78rem', color: C.slate }}>
                  <X size={12} /> Annuler
                </button>
              </div>
            )}
          </div>
          {editingTexts ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(Object.keys(DEFAULT_TEXTS) as (keyof Texts)[]).map(k => (
                <div key={k}>
                  <div style={{ fontSize: '.72rem', color: C.slate, marginBottom: 3 }}>{TEXT_LABELS[k]}</div>
                  <input value={draft[k]} onChange={e => setDraft(p => ({ ...p, [k]: e.target.value }))} style={{ width: '100%', padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '.84rem', boxSizing: 'border-box', outline: 'none' }} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.84rem', color: C.text }}>
              {(Object.keys(DEFAULT_TEXTS) as (keyof Texts)[]).map(k => (
                <div key={k}>
                  <span style={{ color: C.slate, fontSize: '.72rem', marginRight: 4 }}>{TEXT_LABELS[k]} :</span>
                  {texts[k] || <em style={{ color: '#cbd5e1' }}>—</em>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Imprimer */}
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 22px', background: C.blue, color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: '.95rem', fontWeight: 700, boxShadow: '0 2px 10px rgba(37,99,235,.25)' }}>
            <Printer size={17} /> Imprimer
          </button>
        </div>
      </div>

      {/* ── Série d'étiquettes ───────────────────────────────────────────────── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: '.78rem', color: C.slate, marginBottom: 9, textTransform: 'uppercase', letterSpacing: '.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ListOrdered size={14} /> Imprimer une série d'étiquettes
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {([['De', serieFrom, setSerieFrom, 'PO20205'], ['À', serieTo, setSerieTo, 'PO25260']] as const).map(([label, val, set, ph]) => (
            <div key={label}>
              <div style={{ fontSize: '.72rem', color: C.slate, marginBottom: 3 }}>{label}</div>
              <input value={val} onChange={e => set(e.target.value.toUpperCase())} placeholder={ph} disabled={serieRunning}
                style={{ width: 150, padding: '8px 12px', border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: '1rem', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '.08em', boxSizing: 'border-box', outline: 'none' }} />
            </div>
          ))}
          <div>
            <div style={{ fontSize: '.72rem', color: C.slate, marginBottom: 3 }}>Étiquettes par lot</div>
            <select value={lotSize} onChange={e => setLotSize(Number(e.target.value))} disabled={serieRunning}
              style={{ padding: '9px 10px', border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: '.9rem', background: '#fff' }}>
              {[50, 100, 250, 500].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          {!serieRunning ? (
            <button onClick={handlePrintSerie} disabled={!serieCount}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: serieCount ? C.blue : '#94a3b8', color: '#fff', border: 'none', borderRadius: 10, cursor: serieCount ? 'pointer' : 'not-allowed', fontSize: '.9rem', fontWeight: 700 }}>
              <Printer size={16} /> Imprimer la série
            </button>
          ) : (
            <button onClick={() => { stopRef.current = true; }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: '#fef2f2', color: C.red, border: '1px solid #fecaca', borderRadius: 10, cursor: 'pointer', fontSize: '.9rem', fontWeight: 700 }}>
              <X size={16} /> Arrêter après ce lot
            </button>
          )}
        </div>
        <div style={{ marginTop: 9, fontSize: '.8rem', color: C.slate, lineHeight: 1.6 }}>
          {serie && 'error' in serie && <span style={{ color: C.red }}>{serie.error}</span>}
          {serieCount > 0 && !serieRun && <span><b>{serieCount.toLocaleString('fr-FR')}</b> étiquette{serieCount > 1 ? 's' : ''} ({serie && 'names' in serie ? `${serie.names[0]} → ${serie.names[serie.names.length - 1]}` : ''}) en <b>{serieLots}</b> lot{serieLots > 1 ? 's' : ''}.</span>}
          {serieRun && !serieRun.done && <span style={{ color: C.blue, fontWeight: 600 }}>Lot {serieRun.lot} / {serieRun.lots} en cours ({serieRun.first} → {serieRun.last}) : choisissez l'imprimante à étiquettes dans la boîte d'impression.</span>}
          {serieRun && serieRun.done && <span style={{ color: C.green, fontWeight: 600 }}>{stopRef.current ? 'Impression arrêtée.' : 'Série terminée.'}</span>}
          {!serie && !serieRun && <span>Chaque étiquette est une page 100 × 40 mm : l'imprimante à étiquettes les sort une par une. Les séries longues sont découpées en lots (une boîte d'impression par lot).</span>}
        </div>
      </div>

      {/* ── Aperçu ──────────────────────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Tag size={15} color={C.slate} />
          <span style={{ fontSize: '.78rem', fontWeight: 700, color: C.slate, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Aperçu — 100 × 40 mm (marges 5 mm incluses)
          </span>
        </div>
        <div style={{ background: '#cbd5e1', padding: 20, borderRadius: 12, display: 'inline-block' }}>
          <div id="etiq-label" style={{ boxShadow: '0 2px 12px rgba(0,0,0,.18)', borderRadius: 2 }}>
            <LabelContent machineName={machineName} logoSrc={logoSrc} texts={texts} barcodeRef={barcodeRef} qrSvg={qrSvg} />
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: '.74rem', color: C.slate, lineHeight: 1.6 }}>
          Dans la boîte de dialogue d'impression du ZD421 :
          <br />• Format de page : <b>100 × 40 mm</b> &nbsp;·&nbsp; Marges : <b>aucune (0 mm)</b> &nbsp;·&nbsp; Mise à l'échelle : <b>100 %</b>
        </div>
      </div>
    </div>
  );
};

export default EtiquetteView;
