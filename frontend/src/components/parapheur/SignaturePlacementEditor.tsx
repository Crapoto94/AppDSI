import React, { useCallback, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, MapPin, Move, X } from 'lucide-react';
import PdfPageCanvas from './PdfPageCanvas';
import { usePdfDocument, type PageSize, type PdfSource } from './pdf';

export interface Placement {
  page: number;
  x: number; // centre, % largeur
  y: number; // centre, % hauteur depuis le haut
  w: number; // points
  h: number; // points
}

const DEFAULT_W = 150;
const DEFAULT_H = 60;

interface Props {
  open: boolean;
  source: PdfSource | null;
  signataireName: string;
  documentName?: string;
  initial?: Placement;
  /** Positions déjà définies par d'autres signataires sur le même document. */
  others?: { name: string; pos: Placement }[];
  onClose: () => void;
  onValidate: (p: Placement) => void;
}

export default function SignaturePlacementEditor({ open, source, signataireName, documentName, initial, others, onClose, onValidate }: Props) {
  const { doc, loading, error } = usePdfDocument(open ? source : null);
  const [page, setPage] = useState(initial?.page || 1);
  const [pos, setPos] = useState({ x: initial?.x ?? 75, y: initial?.y ?? 85 });
  const [size, setSize] = useState<PageSize | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const boxPx = (() => {
    if (!size) return { w: 120, h: 48 };
    const wScale = size.baseWidth ? size.width / size.baseWidth : 1;
    const hScale = size.baseHeight ? size.height / size.baseHeight : 1;
    return { w: DEFAULT_W * wScale, h: DEFAULT_H * hScale };
  })();

  const moveTo = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    setPos({ x, y });
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    moveTo(e.clientX, e.clientY);
  };
  const onPointerUp = () => { dragging.current = false; };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '95vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Move size={20} color="#2563eb" />
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1e293b' }}>Positionner la signature</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
              {signataireName}{documentName ? ` — ${documentName}` : ''}
            </p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={20} /></button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240, color: '#64748b' }}>
              <Loader2 className="spin" size={26} />
            </div>
          )}
          {error && <div style={{ padding: 16, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>{error}</div>}
          {!loading && !error && doc && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em' }}>Page</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={navBtn(page <= 1)}><ChevronLeft size={16} /></button>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', minWidth: 56, textAlign: 'center' }}>{page} / {doc.numPages}</span>
                  <button onClick={() => setPage(p => Math.min(doc.numPages, p + 1))} disabled={page >= doc.numPages} style={navBtn(page >= doc.numPages)}><ChevronRight size={16} /></button>
                </div>
              </div>

              <div
                ref={containerRef}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                style={{ position: 'relative', border: '2px solid #cbd5e1', borderRadius: 8, overflow: 'hidden', background: '#f1f5f9', userSelect: 'none', touchAction: 'none' }}
              >
                <PdfPageCanvas doc={doc} page={page} onSize={setSize} />
                <div
                  onPointerDown={onPointerDown}
                  style={{
                    position: 'absolute',
                    left: `calc(${pos.x}% - ${boxPx.w / 2}px)`,
                    top: `calc(${pos.y}% - ${boxPx.h / 2}px)`,
                    width: boxPx.w,
                    height: boxPx.h,
                    border: '2px solid #2563eb',
                    background: 'rgba(219,234,254,0.85)',
                    borderRadius: 6,
                    cursor: 'grab',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
                  }}
                >
                  <Move size={13} color="#2563eb" />
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', textAlign: 'center', padding: '0 4px', lineHeight: 1.1, marginTop: 2 }}>{signataireName}</span>
                </div>

                {/* Positions déjà définies par les autres signataires (même page) */}
                {(others || []).filter(o => o.pos && (o.pos.page || 1) === page).map((o, i) => {
                  const ow = size ? (o.pos.w / size.baseWidth) * size.width : 100;
                  const oh = size ? (o.pos.h / size.baseHeight) * size.height : 40;
                  return (
                    <div key={i} style={{
                      position: 'absolute',
                      left: `calc(${o.pos.x}% - ${ow / 2}px)`,
                      top: `calc(${o.pos.y}% - ${oh / 2}px)`,
                      width: ow, height: oh,
                      border: '2px dashed #94a3b8', background: 'rgba(241,245,249,0.75)', borderRadius: 6,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textAlign: 'center', padding: '0 4px', lineHeight: 1.1 }}>{o.name}</span>
                    </div>
                  );
                })}
              </div>
              <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 10 }}>
                Faites glisser le cadre bleu à l'emplacement souhaité.
              </p>
            </>
          )}
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 0', background: '#f1f5f9', border: 'none', borderRadius: 10, fontWeight: 700, color: '#475569', cursor: 'pointer' }}>Annuler</button>
          <button
            onClick={() => onValidate({ page, x: Math.round(pos.x * 100) / 100, y: Math.round(pos.y * 100) / 100, w: DEFAULT_W, h: DEFAULT_H })}
            style={{ flex: 2, padding: '11px 0', background: '#2563eb', border: 'none', borderRadius: 10, fontWeight: 800, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <MapPin size={16} /> Valider la position
          </button>
        </div>
      </div>
    </div>
  );
}

function navBtn(disabled: boolean): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 };
}
