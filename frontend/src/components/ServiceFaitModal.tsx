import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { X, Loader, Send, CheckCircle2, FileText, Paperclip, Upload } from 'lucide-react';

interface MappingColumn {
  name: string;
  display_type: string;
  expression?: string;
}

interface ServiceFaitModalProps {
  row: any;
  columns: MappingColumn[];
  mode?: 'circuit' | 'self';
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

export default function ServiceFaitModal({ row, columns, mode = 'circuit', onClose, onCreated }: ServiceFaitModalProps) {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const isSelf = mode === 'self';
  const [agents, setAgents] = useState<any[]>([]);
  const [verifier, setVerifier] = useState('');
  const [comment, setComment] = useState('');
  const [pjFiles, setPjFiles] = useState<File[]>([]);
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
    if (isSelf) return;
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
    if (!invoice_ref) { setError('Référence de facture introuvable.'); return; }
    if (isSelf) {
      if (!comment.trim()) { setError('Veuillez saisir un commentaire.'); return; }
      if (pjFiles.length === 0) { setError('Veuillez joindre au moins une pièce justificative.'); return; }
    } else {
      if (!verifier) { setError('Veuillez choisir un vérificateur.'); return; }
    }
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        invoice_ref,
        invoice_number: invoice_number || '',
        invoice_label: invoice_label || '',
        invoice_supplier: invoice_supplier || '',
        invoice_amount: invoice_amount != null ? String(invoice_amount) : '',
        invoice_section: invoice_section || '',
      };
      if (isSelf) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => fd.append(k, v == null ? '' : String(v)));
        fd.append('comment', comment || '');
        pjFiles.forEach(f => fd.append('files', f));
        await axios.post('/api/finance/service-fait/self', fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      } else {
        await axios.post('/api/finance/service-fait', { ...payload, verifier_username: verifier }, { headers });
      }
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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#18181b' }}>{isSelf ? 'Service fait — déclaration directe' : 'Validation du service fait'}</h2>
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
            {isSelf && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 14px', color: '#1e40af', fontSize: 13, marginBottom: 16 }}>
                Aucun circuit de validation : vous déclarez vous-même que le service fait est réalisé. Renseignez un commentaire.
              </div>
            )}

            {!isSelf && (
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
            )}

            {isSelf && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Commentaire <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} required
                  placeholder="Précisez le service fait (prestation réalisée, date, référence...)"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />
              </div>
            )}

            {isSelf && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Pièce(s) justificative(s) <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', border: '1.5px dashed #cbd5e1', borderRadius: 8, background: '#f8fafc', color: '#475569', fontSize: 13, cursor: 'pointer' }}>
                  <Upload size={16} /> Choisir un ou plusieurs fichiers
                  <input type="file" multiple style={{ display: 'none' }}
                    onChange={e => setPjFiles(Array.from(e.target.files || []))} />
                </label>
                {pjFiles.length > 0 && (
                  <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {pjFiles.map((f, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
                        <Paperclip size={12} /> {f.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12.5, color: '#475569' }}>
              <FileText size={15} color="#7c3aed" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {isSelf
                  ? 'Votre pièce justificative sera scellée avec votre déclaration (signature PAdES, AC interne) puis envoyée dans Sedit comme pièce jointe de la facture.'
                  : 'Les pièces jointes de cette facture dans Sedit (facture PDF et justificatifs) seront automatiquement mises à disposition du vérificateur — aucun document à joindre ici.'}
              </span>
            </div>

            <button type="submit" disabled={submitting}
              style={{
                marginTop: 20, width: '100%', padding: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: submitting ? '#a5b4fc' : (isSelf ? '#16a34a' : '#6366f1'), color: '#fff', border: 'none', borderRadius: 10,
                fontSize: 15, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', transition: 'background 0.15s'
              }}>
              {submitting ? <><Loader size={16} className="sf-spinner" /> Enregistrement...</> : (isSelf ? <><CheckCircle2 size={16} /> Valider le service fait</> : <><Send size={16} /> Lancer la validation</>)}
            </button>
          </form>
        )}

        <style>{`.sf-spinner{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
}
