import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { X, Upload, Loader, Send } from 'lucide-react';

interface MappingColumn {
  name: string;
  display_type: string;
  expression?: string;
}

interface ServiceFaitModalProps {
  row: any;
  columns: MappingColumn[];
  onClose: () => void;
  onCreated: () => void;
}

// Mappe les libellés de colonnes connus vers les champs du workflow.
// Les noms affichés (col.name) sont librement renommables en admin, donc fragiles ;
// on matche donc en priorité sur l'expression (le champ source Sedit/Oracle, stable),
// avec un repli sur le nom affiché pour compatibilité si l'expression est absente.
const LABEL_MAP: Record<string, string> = {
  'N° Facture fournisseur': 'invoice_number',
  'N° Facture interne': 'invoice_number',
  'Libellé': 'invoice_label',
  'Fournisseur': 'invoice_supplier',
  'Tiers': 'invoice_supplier',
  'Montant TTC': 'invoice_amount',
  'Montant': 'invoice_amount',
  'Section': 'invoice_section',
};

const EXPRESSION_MAP: Record<string, string> = {
  'FACTURE_FACTIERS': 'invoice_supplier',
  'FACTURE_LIBELLE': 'invoice_label',
  'FACTURE_MONTANTTC_E': 'invoice_amount',
  'FACTURE_REFERENCE': 'invoice_number',
};

function pick(row: any, columns: MappingColumn[], field: string): any {
  for (const col of columns) {
    if (col.expression && EXPRESSION_MAP[col.expression] === field) {
      return row[col.name];
    }
  }
  for (const col of columns) {
    if (LABEL_MAP[col.name] === field) {
      return row[col.name];
    }
  }
  return undefined;
}

export default function ServiceFaitModal({ row, columns, onClose, onCreated }: ServiceFaitModalProps) {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const [agents, setAgents] = useState<any[]>([]);
  const [verifier, setVerifier] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [telecomBlocked, setTelecomBlocked] = useState(false);

  const invoice_ref = String(row[columns.find(c => c.expression === 'FACTURE_FACTURE')?.name || ''] || '').trim() || String(row['FACTURE_FACTURE'] || '').trim() || '';
  const invoice_number = pick(row, columns, 'invoice_number') || invoice_ref;
  const invoice_label = pick(row, columns, 'invoice_label') || '';
  const invoice_supplier = pick(row, columns, 'invoice_supplier') || '';
  const invoice_amount = pick(row, columns, 'invoice_amount');
  const invoice_section = pick(row, columns, 'invoice_section') || '';

  useEffect(() => {
    axios.get('/api/calendrier-dsi/agents', { headers })
      .then(r => setAgents(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAgents([]));
  }, []);

  const selectedAgent = agents.find(a => a.username === verifier);

  const groupedByService = useMemo(() => {
    const map: Record<string, any[]> = {};
    const ordered = [...agents].sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
    for (const a of ordered) {
      const s = (a.service || '').trim() || 'Autres';
      if (!map[s]) map[s] = [];
      map[s].push(a);
    }
    return Object.keys(map).sort((x, y) => x.localeCompare(y)).reduce((acc: Record<string, any[]>, k) => {
      acc[k] = map[k];
      return acc;
    }, {});
  }, [agents]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifier) { setError('Veuillez choisir un vérificateur.'); return; }
    if (!file) { setError('Veuillez joindre le document de la facture.'); return; }
    if (!invoice_ref) { setError('Référence de facture introuvable.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('invoice_ref', invoice_ref);
      formData.append('invoice_number', invoice_number || '');
      formData.append('invoice_label', invoice_label || '');
      formData.append('invoice_supplier', invoice_supplier || '');
      formData.append('invoice_amount', invoice_amount != null ? String(invoice_amount) : '');
      formData.append('invoice_section', invoice_section || '');
      formData.append('verifier_username', verifier);
      formData.append('file', file);
      await axios.post('/api/finance/service-fait', formData, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' }
      });
      onCreated();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erreur lors de la création du workflow.';
      if (msg.includes('Telecom')) {
        setTelecomBlocked(true);
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#18181b' }}>Validation du service fait</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
        </div>

        {/* Récapitulatif facture */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Facture</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><div style={{ fontSize: 11, color: '#94a3b8' }}>N° facture</div><div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>{invoice_number || '-'}</div></div>
            <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Fournisseur</div><div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>{invoice_supplier || '-'}</div></div>
            <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Montant TTC</div><div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>{invoice_amount != null && !isNaN(parseFloat(invoice_amount)) ? parseFloat(invoice_amount).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €' : '-'}</div></div>
            <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Section</div><div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>{invoice_section || '-'}</div></div>
          </div>
          {invoice_label && <div style={{ marginTop: 8, fontSize: 12, color: '#374151', lineHeight: 1.4 }}>{invoice_label}</div>}
        </div>

        {error && (
          <div style={{ background: telecomBlocked ? '#fef3c7' : '#fee2e2', border: `1px solid ${telecomBlocked ? '#fcd34d' : '#fecaca'}`, borderRadius: 8, padding: '12px 14px', color: telecomBlocked ? '#92400e' : '#b91c1c', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!telecomBlocked && (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Vérificateur <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select value={verifier} onChange={e => setVerifier(e.target.value)} required
                  style={{ flex: 1, padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', background: '#fff' }}>
                  <option value="">-- Choisir un agent DSI --</option>
                  {Object.entries(groupedByService).map(([service, list]) => (
                    <optgroup key={service} label={service}>
                      {list.map(a => (
                        <option key={a.username} value={a.username}>{a.nom || a.username}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {selectedAgent && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#64748b', background: '#eff6ff', padding: '8px 12px', borderRadius: 8 }}>
                  Un email sera envoyé à <strong>{selectedAgent.email || selectedAgent.username}</strong> avec un lien de validation.
                </div>
              )}
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Document de la facture <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
                border: '1.5px dashed #cbd5e1', borderRadius: 10, cursor: 'pointer', background: '#f8fafc'
              }}>
                <Upload size={18} color="#6366f1" />
                <div style={{ fontSize: 13, color: file ? '#1e40af' : '#64748b' }}>
                  {file ? file.name : 'Cliquez pour joindre la facture (PDF, image...)'}
                </div>
                <input type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            <button type="submit" disabled={submitting}
              style={{
                marginTop: 20, width: '100%', padding: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: submitting ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none', borderRadius: 10,
                fontSize: 15, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', transition: 'background 0.15s'
              }}>
              {submitting ? <><Loader size={16} className="sf-spinner" /> Création...</> : <><Send size={16} /> Lancer la validation</>}
            </button>
          </form>
        )}

        <style>{`.sf-spinner{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
}
