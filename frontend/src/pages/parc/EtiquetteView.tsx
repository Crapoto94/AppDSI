import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Printer, Upload, Edit3, Check, X, Tag } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

const C = {
  blue: '#2563eb', slate: '#64748b', green: '#059669', red: '#dc2626',
  bg: '#f1f5f9', card: '#fff', border: '#e2e8f0', text: '#0f172a',
};

export const LS_LOGO  = 'dsi_etiq_logo';
export const LS_TEXTS = 'dsi_etiq_texts';

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

// ─── Impression depuis n'importe quel contexte ──────────────────────────────
export async function printLabelWindow(machineName: string): Promise<void> {
  const logoSrc = localStorage.getItem(LS_LOGO);
  let texts: Texts = { ...DEFAULT_TEXTS };
  try {
    const saved = localStorage.getItem(LS_TEXTS);
    if (saved) texts = { ...DEFAULT_TEXTS, ...JSON.parse(saved) };
  } catch { /* ignore */ }

  const qrSvg  = await makeQrSvg(machineName);

  // Barcode SVG sur élément détaché
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svgEl, machineName.toUpperCase(), {
      format: 'CODE128', lineColor: '#000', width: 2, height: 48,
      displayValue: false, margin: 0, background: 'transparent',
    });
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svgEl.style.cssText = 'width:100%;height:auto;display:block;';
  } catch { /* valeur incompatible */ }

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const labelHtml = buildLabelHtml(machineName, logoSrc, texts, svgEl.outerHTML, qrSvg, esc);

  const printWin = window.open('', '_blank');
  if (!printWin) { alert("Autorisez les popups pour ce site afin d'imprimer l'étiquette."); return; }

  printWin.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Étiquette ${esc(machineName)}</title>
<style>@page{size:100mm 40mm;margin:0mm;}*,*::before,*::after{box-sizing:border-box;}html,body{margin:0;padding:0;background:#fff;overflow:hidden;}</style>
</head><body>${labelHtml}<script>(function(){var e=document.getElementById('lbl-name');if(!e)return;var s=14;while(e.scrollWidth>e.offsetWidth+1&&s>7){s-=0.5;e.style.fontSize=s+'pt';}})();<\/script></body></html>`);
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
      <div id="lbl-name" style="font-size:14pt;font-weight:900;letter-spacing:.1em;white-space:nowrap;overflow:hidden;text-align:center;color:#000;line-height:1;width:100%;">${esc(machineName)}</div>
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
  const [machineName, setMachineName] = useState('PO25201');
  const [logoSrc, setLogoSrc]   = useState<string | null>(null);
  const [texts, setTexts]       = useState<Texts>(DEFAULT_TEXTS);
  const [editingTexts, setEditingTexts] = useState(false);
  const [draft, setDraft]       = useState<Texts>(DEFAULT_TEXTS);
  const [qrSvg, setQrSvg]       = useState('');

  const barcodeRef   = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chargement initial
  useEffect(() => {
    const savedLogo = localStorage.getItem(LS_LOGO);
    if (savedLogo) setLogoSrc(savedLogo);
    const savedTexts = localStorage.getItem(LS_TEXTS);
    if (savedTexts) {
      try { setTexts({ ...DEFAULT_TEXTS, ...JSON.parse(savedTexts) }); } catch { /* ignore */ }
    }
  }, []);

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

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const data = ev.target?.result as string;
      setLogoSrc(data);
      localStorage.setItem(LS_LOGO, data);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleClearLogo = () => { setLogoSrc(null); localStorage.removeItem(LS_LOGO); };

  const handleValidateTexts = () => {
    setTexts(draft);
    localStorage.setItem(LS_TEXTS, JSON.stringify(draft));
    setEditingTexts(false);
  };

  const handlePrint = () => {
    renderBarcode(barcodeRef, machineName);
    void printLabelWindow(machineName);
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
