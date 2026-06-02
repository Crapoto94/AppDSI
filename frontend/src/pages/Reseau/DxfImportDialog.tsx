import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DxfDocument, DxfCalque } from './types';
import {
  computePlacementTransform, fitScale, transformFeature,
  type DxfBounds, type Transform,
} from './dxfTransform';

type Step = 'upload' | 'place' | 'preview';

interface Props {
  onClose: () => void;
  onImported: (doc: DxfDocument) => void;
}

// Centre d'Ivry-sur-Seine (placement par défaut du plan)
const IVRY_CENTER: [number, number] = [48.8130, 2.3890];
const OVERLAY_CAP = 5000;

const MapClick: React.FC<{ onClick: (lat: number, lng: number) => void }> = ({ onClick }) => {
  useMapEvents({ click(e) { onClick(e.latlng.lat, e.latlng.lng); } });
  return null;
};

const Recenter: React.FC<{ center: [number, number] | null }> = ({ center }) => {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center); }, [center, map]);
  return null;
};

// Bounds DXF à partir des calques sélectionnés
function computeBounds(layers: Record<string, any[]>, selected: Set<string>): DxfBounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (c: any) => {
    if (typeof c[0] === 'number') {
      if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0];
      if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1];
    } else c.forEach(walk);
  };
  for (const [calque, ents] of Object.entries(layers)) {
    if (!selected.has(calque)) continue;
    for (const e of ents) walk(e.geojson.geometry.coordinates);
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

const DxfImportDialog: React.FC<Props> = ({ onClose, onImported }) => {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [calques, setCalques] = useState<DxfCalque[]>([]);
  const [rawLayers, setRawLayers] = useState<Record<string, any[]> | null>(null);
  const [selectedCalques, setSelectedCalques] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DxfDocument | null>(null);

  // Placement manuel
  const [lat0, setLat0] = useState(IVRY_CENTER[0]);
  const [lng0, setLng0] = useState(IVRY_CENTER[1]);
  const [scaleMul, setScaleMul] = useState(1);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [viewCenter, setViewCenter] = useState<[number, number] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const bounds = useMemo(() => rawLayers ? computeBounds(rawLayers, selectedCalques) : null, [rawLayers, selectedCalques]);
  const S0 = useMemo(() => bounds ? fitScale(bounds, 1000) : 1, [bounds]);
  const S = S0 * scaleMul;

  const finalTransform = useMemo<Transform | null>(() => {
    if (!bounds) return null;
    return computePlacementTransform(bounds, lat0, lng0, S, rotationDeg);
  }, [bounds, lat0, lng0, S, rotationDeg]);

  // Largeur réelle approximative du plan (m)
  const spanMeters = bounds ? Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * S : 0;

  // ── Étape 1 — Upload + parsing (+ rappel d'un placement existant) ──
  const handleUpload = useCallback(async () => {
    if (!file) return;
    setUploading(true); setError(''); setInfo('');
    try {
      const token = localStorage.getItem('token');
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/maps/dxf/parse', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Erreur parsing');
      const data = await res.json();
      setCalques(data.calques);
      setRawLayers(data.raw);
      setSelectedCalques(new Set(data.calques.map((c: DxfCalque) => c.nom)));

      // Rappel d'un placement enregistré pour ce fichier
      let restored = false;
      try {
        const cal = await fetch(`/api/maps/dxf/calibration?nom_fichier=${encodeURIComponent(file.name)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cal.ok) {
          const cd = await cal.json();
          const p = cd.found && cd.ajustement;
          if (p && typeof p.lat0 === 'number') {
            setLat0(p.lat0); setLng0(p.lng0);
            setScaleMul(p.scaleMul ?? 1); setRotationDeg(p.rotationDeg ?? 0);
            setViewCenter([p.lat0, p.lng0]);
            setInfo('Placement précédent restauré. Vous pouvez l’ajuster ou réimporter directement.');
            restored = true;
          }
        }
      } catch { /* optionnel */ }
      if (!restored) setViewCenter(IVRY_CENTER);

      setStep('place');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }, [file]);

  // Aperçu live : entités transformées (texte exclu pour alléger)
  const overlay = useMemo(() => {
    if (!finalTransform || !rawLayers) return null;
    const feats: any[] = [];
    for (const [calque, ents] of Object.entries(rawLayers)) {
      if (!selectedCalques.has(calque)) continue;
      for (const e of ents) {
        if (e.geojson?.properties?.type === 'text') continue;
        feats.push(transformFeature(e.geojson, finalTransform));
        if (feats.length >= OVERLAY_CAP) break;
      }
      if (feats.length >= OVERLAY_CAP) break;
    }
    return { type: 'FeatureCollection', features: feats } as any;
  }, [finalTransform, rawLayers, selectedCalques]);
  const overlayKey = finalTransform ? Object.values(finalTransform).map(v => v.toFixed(9)).join(',') : 'none';

  // Déplacement fin (mètres)
  const k = Math.cos((lat0 * Math.PI) / 180) || 1;
  const nudge = (north: number, east: number) => {
    setLat0(v => v + north / 111320);
    setLng0(v => v + east / (111320 * k));
  };

  const resetPlacement = () => {
    setLat0(IVRY_CENTER[0]); setLng0(IVRY_CENTER[1]);
    setScaleMul(1); setRotationDeg(0); setViewCenter([...IVRY_CENTER]);
  };

  // ── Import ──
  const handleImport = useCallback(async () => {
    if (!file || !rawLayers || !finalTransform) return;
    setImporting(true); setError('');
    try {
      const filtered: Record<string, any[]> = {};
      for (const [calque, ents] of Object.entries(rawLayers))
        if (selectedCalques.has(calque)) filtered[calque] = ents;

      const token = localStorage.getItem('token');
      const res = await fetch('/api/maps/dxf/georef', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nom_fichier: file.name,
          rawLayers: filtered,
          transform: finalTransform,
          ajustement: { lat0, lng0, scaleMul, rotationDeg },
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Erreur import');
      const doc = await res.json();
      setPreviewDoc(doc);
      setStep('preview');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  }, [file, rawLayers, selectedCalques, finalTransform, lat0, lng0, scaleMul, rotationDeg]);

  const wide = step === 'place';

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 14, maxWidth: wide ? 1040 : 560, width: '94%', maxHeight: '92vh', overflow: 'auto', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Import DXF — placement sur le plan d’Ivry</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['upload', 'place', 'preview'].map((s, i) => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: step === s ? '#2563eb' : '#e2e8f0', opacity: i <= ['upload', 'place', 'preview'].indexOf(step) ? 1 : 0.3 }} />
          ))}
        </div>

        {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}
        {info && <div style={{ background: '#eff6ff', color: '#1d4ed8', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{info}</div>}

        {/* ── Étape 1 : Upload ── */}
        {step === 'upload' && (
          <>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
              Sélectionnez un fichier DXF. Il sera superposé au plan d’Ivry ; vous l’ajusterez ensuite (déplacement, rotation, échelle).
            </p>
            <div onClick={() => fileRef.current?.click()}
              style={{ border: '2px dashed #cbd5e1', borderRadius: 12, padding: 32, textAlign: 'center', cursor: 'pointer', background: '#f8fafc' }}>
              {file ? (
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{file.name} ({(file.size / 1024).toFixed(0)} Ko)</div>
              ) : (
                <div style={{ color: '#94a3b8' }}>Cliquez pour sélectionner un fichier DXF</div>
              )}
              <input ref={fileRef} type="file" accept=".dxf" style={{ display: 'none' }}
                onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={onClose} style={btnGhost}>Annuler</button>
              <button onClick={handleUpload} disabled={!file || uploading}
                style={{ ...btnPrimary, background: !file ? '#94a3b8' : '#2563eb', cursor: file ? 'pointer' : 'not-allowed' }}>
                {uploading ? 'Analyse…' : 'Analyser le fichier'}
              </button>
            </div>
          </>
        )}

        {/* ── Étape 2 : Placement ── */}
        {step === 'place' && rawLayers && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 12 }}>
              {/* Carte */}
              <div style={{ height: 440, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                <MapContainer center={IVRY_CENTER} zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
                  <MapClick onClick={(lat, lng) => { setLat0(lat); setLng0(lng); }} />
                  <Recenter center={viewCenter} />
                  {overlay && (
                    <GeoJSON key={overlayKey} data={overlay}
                      style={{ color: '#9333ea', weight: 1, opacity: 0.85 } as any}
                      pointToLayer={(_f, latlng) => L.circleMarker(latlng, { radius: 2, color: '#9333ea' })} />
                  )}
                </MapContainer>
              </div>

              {/* Contrôles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Cliquez sur la carte pour positionner le centre du plan, puis affinez ci-dessous.
                </div>

                {/* Déplacement */}
                <div>
                  <div style={ctrlLbl}>Déplacement</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, maxWidth: 180 }}>
                    <span />
                    <button style={nudgeBtn} onClick={() => nudge(5, 0)}>↑</button>
                    <span />
                    <button style={nudgeBtn} onClick={() => nudge(0, -5)}>←</button>
                    <button style={nudgeBtn} onClick={() => nudge(0, 5)}>→</button>
                    <span />
                    <span />
                    <button style={nudgeBtn} onClick={() => nudge(-5, 0)}>↓</button>
                    <span />
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>pas de 5 m · clic carte = position grossière</div>
                </div>

                {/* Rotation */}
                <div>
                  <div style={ctrlLbl}>Rotation : <b style={{ color: '#7c3aed' }}>{rotationDeg.toFixed(1)}°</b></div>
                  <input type="range" min={-180} max={180} step={0.5} value={rotationDeg}
                    onChange={e => setRotationDeg(parseFloat(e.target.value))} style={{ width: '100%' }} />
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <button style={miniBtn} onClick={() => setRotationDeg(v => v - 1)}>−1°</button>
                    <button style={miniBtn} onClick={() => setRotationDeg(v => v + 1)}>+1°</button>
                    <button style={miniBtn} onClick={() => setRotationDeg(0)}>0°</button>
                  </div>
                </div>

                {/* Échelle */}
                <div>
                  <div style={ctrlLbl}>Échelle : <b style={{ color: '#7c3aed' }}>×{scaleMul.toFixed(2)}</b></div>
                  <input type="range" min={0.1} max={5} step={0.01} value={Math.min(5, scaleMul)}
                    onChange={e => setScaleMul(parseFloat(e.target.value))} style={{ width: '100%' }} />
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
                    <button style={miniBtn} onClick={() => setScaleMul(v => v / 2)}>÷2</button>
                    <button style={miniBtn} onClick={() => setScaleMul(v => v * 2)}>×2</button>
                    <input type="number" step={0.01} value={Number(scaleMul.toFixed(4))}
                      onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setScaleMul(v); }}
                      style={{ width: 70, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }} />
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                    Emprise du plan ≈ {spanMeters >= 1000 ? `${(spanMeters / 1000).toFixed(2)} km` : `${Math.round(spanMeters)} m`}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={{ ...btnGhost, flex: 1, padding: '6px 8px', fontSize: 12 }} onClick={() => setViewCenter([lat0, lng0])}>Recentrer la vue</button>
                  <button style={{ ...btnGhost, flex: 1, padding: '6px 8px', fontSize: 12 }} onClick={resetPlacement}>Réinitialiser</button>
                </div>

                {/* Calques */}
                <details>
                  <summary style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Calques ({selectedCalques.size}/{calques.length})
                  </summary>
                  <div style={{ maxHeight: 120, overflowY: 'auto', marginTop: 6 }}>
                    {calques.map(c => (
                      <label key={c.nom} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '2px 0', cursor: 'pointer' }}>
                        <input type="checkbox" checked={selectedCalques.has(c.nom)}
                          onChange={e => {
                            const next = new Set(selectedCalques);
                            if (e.target.checked) next.add(c.nom); else next.delete(c.nom);
                            setSelectedCalques(next);
                          }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom}</span>
                        <span style={{ color: '#94a3b8', fontSize: 10 }}>{c.nb_entites}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setStep('upload')} style={btnGhost}>Retour</button>
              <button onClick={handleImport} disabled={!finalTransform || importing}
                style={{ ...btnPrimary, background: !finalTransform ? '#94a3b8' : '#2563eb', cursor: !finalTransform ? 'not-allowed' : 'pointer' }}>
                {importing ? 'Importation…' : 'Importer'}
              </button>
            </div>
          </>
        )}

        {/* ── Étape 3 : Importé ── */}
        {step === 'preview' && previewDoc && (
          <>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#166534', marginBottom: 4 }}>✓ Importé avec succès</div>
              <div style={{ fontSize: 12, color: '#15803d' }}>{previewDoc.nom_fichier} — {previewDoc.calques.length} calques. Le placement est conservé pour ce fichier.</div>
            </div>
            {(previewDoc.calques as unknown as DxfCalque[]).map((c) => (
              <div key={c.nom} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{c.nom}</span>
                <span style={{ color: '#64748b' }}>{c.nb_entites} entités</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => onImported(previewDoc)} style={btnPrimary}>Fermer</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const ctrlLbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 };
const btnPrimary: React.CSSProperties = { padding: '8px 16px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const btnGhost: React.CSSProperties = { padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 13 };
const nudgeBtn: React.CSSProperties = { padding: '6px 0', border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#475569' };
const miniBtn: React.CSSProperties = { padding: '3px 8px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#475569' };

export default DxfImportDialog;
