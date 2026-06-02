import React, { useState, useRef, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import type { DxfDocument, DxfCalque } from './types';

type Step = 'upload' | 'calibrate' | 'preview';

interface Props {
  onClose: () => void;
  onImported: (doc: DxfDocument) => void;
}

interface CalibrationPoint {
  dxfX: number;
  dxfY: number;
  lat: number;
  lng: number;
}

const DxfImportDialog: React.FC<Props> = ({ onClose, onImported }) => {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [calques, setCalques] = useState<DxfCalque[]>([]);
  const [rawLayers, setRawLayers] = useState<any>(null);
  const [pointsCalage, setPointsCalage] = useState<CalibrationPoint[]>([]);
  const [selectedCalques, setSelectedCalques] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DxfDocument | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Étape 1 — Upload
  const handleUpload = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/maps/dxf/parse', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erreur parsing');
      }
      const data = await res.json();
      setCalques(data.calques);
      setRawLayers(data.raw);
      setSelectedCalques(new Set(data.calques.map((c: DxfCalque) => c.nom)));
      setStep('calibrate');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }, [file]);

  // Étape 2 — Calibration
  const addCalibrationPoint = useCallback((lat: number, lng: number) => {
    const dxfX = parseFloat(prompt('Coordonnée DXF X :') || '0');
    const dxfY = parseFloat(prompt('Coordonnée DXF Y :') || '0');
    if (isNaN(dxfX) || isNaN(dxfY)) return;
    setPointsCalage(prev => [...prev, { dxfX, dxfY, lat, lng }]);
  }, []);

  const removeCalibrationPoint = useCallback((index: number) => {
    setPointsCalage(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Étape 3 — Importer
  const handleImport = useCallback(async () => {
    if (!file || !rawLayers || pointsCalage.length < 2) return;
    setImporting(true);
    setError('');
    try {
      // Filtrer les calques sélectionnés
      const filteredLayers: any = {};
      for (const [calque, entites] of Object.entries(rawLayers)) {
        if (selectedCalques.has(calque)) {
          filteredLayers[calque] = entites;
        }
      }

      const token = localStorage.getItem('token');
      const res = await fetch('/api/maps/dxf/georef', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nom_fichier: file.name,
          rawLayers: filteredLayers,
          pointsCalage,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erreur import');
      }
      const doc = await res.json();
      setPreviewDoc(doc);
      setStep('preview');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  }, [file, rawLayers, selectedCalques, pointsCalage]);

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 14, maxWidth: 560, width: '90%', maxHeight: '85vh', overflow: 'auto', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Import DXF</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>

        {/* Indicateur d'étape */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['upload', 'calibrate', 'preview'].map((s, i) => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: step === s ? '#2563eb' : '#e2e8f0', opacity: i <= ['upload', 'calibrate', 'preview'].indexOf(step) ? 1 : 0.3 }} />
          ))}
        </div>

        {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {/* ── Étape 1 : Upload ── */}
        {step === 'upload' && (
          <>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
              Sélectionnez un fichier DXF contenant le plan des fourreaux et chambres de la ville.
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
              <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={handleUpload} disabled={!file || uploading}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: !file ? '#94a3b8' : '#2563eb', color: '#fff', cursor: file ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>
                {uploading ? 'Parsing…' : 'Analyser le fichier'}
              </button>
            </div>
          </>
        )}

        {/* ── Étape 2 : Calibration ── */}
        {step === 'calibrate' && (
          <>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
              Calques détectés ({calques.length}) :
            </p>
            <div style={{ maxHeight: 150, overflowY: 'auto', marginBottom: 12 }}>
              {calques.map(c => (
                <label key={c.nom} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedCalques.has(c.nom)}
                    onChange={e => {
                      const next = new Set(selectedCalques);
                      e.target.checked ? next.add(c.nom) : next.delete(c.nom);
                      setSelectedCalques(next);
                    }} />
                  <span style={{ fontWeight: 600 }}>{c.nom}</span>
                  <span style={{ color: '#94a3b8', fontSize: 11 }}>({c.nb_entites} entités — {c.types.join(', ')})</span>
                </label>
              ))}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>Points de calage ({pointsCalage.length}/2 minimum)</div>
            {pointsCalage.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', background: '#f8fafc', borderRadius: 8, marginBottom: 4, fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: '#2563eb', width: 20 }}>#{i + 1}</span>
                <span>DXF ({p.dxfX.toFixed(2)}, {p.dxfY.toFixed(2)})</span>
                <span style={{ color: '#94a3b8' }}>→</span>
                <span>GPS ({p.lat.toFixed(6)}, {p.lng.toFixed(6)})</span>
                <button onClick={() => removeCalibrationPoint(i)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            ))}
            <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginTop: 4 }}>
              Astuce : ouvrez la carte en arrière-plan, cliquez sur un point connu (ex: un carrefour) pour ajouter un point de calage.
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => { setStep('upload'); setRawLayers(null); }}
                style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>Retour</button>
              <button onClick={handleImport} disabled={pointsCalage.length < 2 || importing}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: pointsCalage.length < 2 ? '#94a3b8' : '#2563eb', color: '#fff', cursor: pointsCalage.length < 2 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
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
              <div style={{ fontSize: 12, color: '#15803d' }}>{previewDoc.nom_fichier} — {previewDoc.calques.length} calques</div>
            </div>
            {previewDoc.calques.map((c: DxfCalque) => (
              <div key={c.nom} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{c.nom}</span>
                <span style={{ color: '#64748b' }}>{c.nb_entites} entités</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={onClose}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Fermer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DxfImportDialog;
