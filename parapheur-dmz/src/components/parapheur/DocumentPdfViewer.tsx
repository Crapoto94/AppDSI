import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, FileText, Loader2, Maximize2, ShieldCheck, X, ZoomIn, ZoomOut } from 'lucide-react';
import PdfPageCanvas from './PdfPageCanvas';
import { usePdfDocument } from './pdf';

export interface DocSignatureCertificate {
  subject?: string | null;
  issuer?: string | null;
  serial?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
}

export interface DocSignatureSigner {
  name: string;
  mode: string;
  signed_at?: string | null;
  delegated_by?: string | null;
  note?: string | null;
  certificate?: DocSignatureCertificate | null;
  technique_certificate?: { serial?: string | null; issuer?: string | null; fingerprint?: string | null; signing_time?: string | null } | null;
}

export interface DocSignatureInfo {
  signers: DocSignatureSigner[];
  seal?: { sealed_at?: string | null; serial?: string | null } | null;
}

interface Props {
  open: boolean;
  /** URL complète de l'API (protégée par JWT). */
  url: string;
  authToken?: string | null;
  title?: string;
  /** Détails de signature à afficher dans un bandeau (façon Acrobat). */
  signatureInfo?: DocSignatureInfo | null;
  onClose: () => void;
}

const MODE_LABEL: Record<string, string> = {
  simple: 'Signature simple',
  sms: 'Vérifiée par SMS',
  securise: 'Certificat P12',
};

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile|Opera Mini/i.test(navigator.userAgent)
    || (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 1024);
}

/**
 * Safari (macOS) affiche bien les PDF en iframe mais ignore les paramètres
 * d'ouverture `#zoom=` du lecteur PDFKit : le zoom externe n'y fonctionne pas.
 * On rend donc les pages avec pdf.js (zoom géré par nous) sur Safari.
 */
function isSafariDesktop() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(ua);
}

/**
 * Visionneuse PDF intégrée (modale) avec zoom et bandeau de signature.
 *
 * - Desktop : lecteur PDF natif du navigateur dans une iframe (gère tous les PDF,
 *   y compris les scans), zoom piloté par les paramètres d'ouverture PDF.
 * - Mobile (Android/iOS) : les iframes PDF ne s'affichent pas dans Chrome/Firefox
 *   mobiles → on rend les pages avec pdf.js (canvas), avec défilement et zoom.
 */
export default function DocumentPdfViewer({ open, url, authToken, title, signatureInfo, onClose }: Props) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string>('page-width');
  const [isMobile, setIsMobile] = useState(isMobileDevice);
  const [isSafari, setIsSafari] = useState(isSafariDesktop);

  useEffect(() => {
    const onResize = () => { setIsMobile(isMobileDevice()); setIsSafari(isSafariDesktop()); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;

    const run = async () => {
      if (!open || !url) { setBlob(null); setBlobUrl(null); return; }
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(url, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} });
        if (!r.ok) throw new Error(r.status === 403 ? 'Accès refusé' : `Erreur ${r.status}`);
        const b = await r.blob();
        if (cancelled) return;
        const pdfBlob = new Blob([b], { type: 'application/pdf' });
        created = URL.createObjectURL(pdfBlob);
        setBlob(pdfBlob);
        setBlobUrl(created);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Document introuvable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [open, url, authToken]);

  useEffect(() => { if (open) setZoom('page-width'); }, [open, url]);

  const level = zoom === 'page-width' ? 100 : parseInt(zoom, 10) || 100;
  const setPct = (n: number) => setZoom(String(Math.min(400, Math.max(50, n))));
  const zoomOut = () => setPct(level - 25);
  const zoomIn = () => setPct(level + 25);
  const openInTab = () => { if (blobUrl) window.open(blobUrl, '_blank', 'noopener'); };

  const signers = signatureInfo?.signers || [];

  if (!open) return null;

  const src = blobUrl ? `${blobUrl}#zoom=${zoom === 'page-width' ? 'page-width' : level}&toolbar=1&navpanes=0` : '';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 8 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 960, maxHeight: '95vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={18} color="#ef4444" />
          <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || 'Document'}</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid #e2e8f0', borderRadius: 8, padding: 2 }}>
            <button onClick={zoomOut} disabled={level <= 50} title="Réduire" style={zoomBtn(level <= 50)}><ZoomOut size={15} /></button>
            <span style={{ minWidth: 42, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#475569' }}>{level}%</span>
            <button onClick={zoomIn} disabled={level >= 400} title="Agrandir" style={zoomBtn(level >= 400)}><ZoomIn size={15} /></button>
          </div>
          <button onClick={() => setZoom('page-width')} title="Ajuster à la largeur" style={{ ...zoomTextBtn, background: zoom === 'page-width' ? '#ede9fe' : '#fff', color: zoom === 'page-width' ? '#6d28d9' : '#475569' }}>
            <Maximize2 size={14} />
          </button>
          {!isMobile && (
            <button onClick={openInTab} disabled={!blobUrl} title="Ouvrir dans un onglet" style={zoomTextBtn}>
              <ExternalLink size={14} />
            </button>
          )}
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={20} /></button>
        </div>

        {signers.length > 0 && <SignatureBanner info={{ signers, seal: signatureInfo?.seal || null }} />}

        <div style={{ flex: 1, minHeight: 0, background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
          {loading && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 320, color: '#64748b' }}><Loader2 className="spin" size={30} /></div>}
          {error && <div style={{ margin: 16, padding: 16, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>{error}</div>}
          {!loading && !error && blob && (
            (isMobile || isSafari)
              ? <CanvasPdfViewer source={blob} zoom={level} />
              : blobUrl && <iframe key={`${blobUrl}-${zoom}`} src={src} title={title || 'Document PDF'} style={{ width: '100%', height: '80vh', border: 'none', display: 'block' }} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Rendu pdf.js multi-pages (mobile : les iframes PDF ne s'affichent pas ;
 * Safari macOS : le lecteur natif ignore nos paramètres de zoom).
 */
function CanvasPdfViewer({ source, zoom }: { source: Blob; zoom: number }) {
  const { doc, loading, error } = usePdfDocument(useMemo(() => ({ file: source }), [source]));
  const pages = doc ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : [];

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 280, color: '#64748b' }}><Loader2 className="spin" size={28} /></div>;
  if (error) return <div style={{ margin: 16, padding: 16, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>{error}</div>;
  if (!doc) return null;

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch', padding: 8 }}>
      <div style={{ width: `${zoom}%`, minWidth: '100%' }}>
        {pages.map((p) => (
          <div key={p} style={{ marginBottom: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.2)', background: '#fff' }}>
            <PdfPageCanvas doc={doc} page={p} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Bandeau de signature façon Acrobat (repliable). */
function SignatureBanner({ info }: { info: DocSignatureInfo }) {
  const [open, setOpen] = useState(false);
  const hasCrypto = info.signers.some(s => s.mode === 'securise');
  return (
    <div style={{ borderBottom: '1px solid #e2e8f0', background: hasCrypto ? '#f0fdf4' : '#eff6ff' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
        <ShieldCheck size={16} color={hasCrypto ? '#15803d' : '#1d4ed8'} />
        <span style={{ fontSize: 12, fontWeight: 800, color: hasCrypto ? '#166534' : '#1e40af' }}>
          Document signé électroniquement{info.signers.length > 1 ? ` (${info.signers.length} signatures)` : ''}
        </span>
        <span style={{ fontSize: 11, color: '#64748b', display: 'none' }}>Détails de la signature</span>
        <ChevronDown size={14} style={{ marginLeft: 'auto', color: '#64748b', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{ padding: '0 14px 12px', display: 'grid', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
          {info.signers.map((s, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, color: '#1e293b' }}>{s.name}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: s.mode === 'securise' ? '#15803d' : '#1d4ed8', background: s.mode === 'securise' ? '#f0fdf4' : '#eff6ff', border: '1px solid ' + (s.mode === 'securise' ? '#bbf7d0' : '#bfdbfe'), padding: '1px 7px', borderRadius: 10 }}>
                  {MODE_LABEL[s.mode] || s.mode}
                </span>
              </div>
              {s.mode === 'securise' && s.certificate && (
                <div style={{ color: '#5b21b6', fontSize: 11, marginTop: 2 }}>
                  Certificat P12 — {s.certificate.subject || s.name}{s.certificate.issuer ? ` · émetteur : ${s.certificate.issuer}` : ''}
                </div>
              )}
              <div style={{ color: '#64748b', marginTop: 2 }}>
                {s.signed_at ? `Signé le ${new Date(s.signed_at).toLocaleString('fr-FR')}` : ''}
                {s.delegated_by ? `${s.signed_at ? ' — ' : ''}par délégation de ${s.delegated_by}` : ''}
              </div>
              {s.note && <div style={{ color: '#0f172a', marginTop: 3, fontStyle: 'italic' }}>Mention : « {s.note} »</div>}
              {s.technique_certificate && (
                <div style={{ marginTop: 4, color: '#475569', fontSize: 11 }}>
                  <b>Certificat technique (plateforme) :</b> n° {s.technique_certificate.serial || '—'}
                  {s.technique_certificate.issuer ? ` — émis par ${s.technique_certificate.issuer}` : ''}
                  {s.technique_certificate.signing_time ? ` (${new Date(s.technique_certificate.signing_time).toLocaleString('fr-FR')})` : ''}
                </div>
              )}
              {s.certificate && (
                <div style={{ marginTop: 6, color: '#475569', fontSize: 11, display: 'grid', gap: 2 }}>
                  {s.certificate.subject && <div><b>Titulaire :</b> {s.certificate.subject}</div>}
                  {s.certificate.issuer && <div><b>Émetteur :</b> {s.certificate.issuer}</div>}
                  {s.certificate.serial && <div><b>N° de série :</b> {s.certificate.serial}</div>}
                  {s.certificate.valid_to && <div><b>Valide jusqu'au :</b> {new Date(s.certificate.valid_to).toLocaleDateString('fr-FR')}</div>}
                </div>
              )}
            </div>
          ))}
          {info.seal && (
            <div style={{ fontSize: 11, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 10px' }}>
              <b>Sceau de la plateforme</b> — apposé le {info.seal.sealed_at ? new Date(info.seal.sealed_at).toLocaleString('fr-FR') : '—'}
              {info.seal.serial ? ` (n° ${info.seal.serial})` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const zoomBtn = (disabled: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26,
  border: 'none', background: 'transparent', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
  color: disabled ? '#cbd5e1' : '#475569',
});

const zoomTextBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', border: '1px solid #e2e8f0',
  borderRadius: 8, background: '#fff', color: '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
