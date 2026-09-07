import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Paperclip, History, ArrowLeft, Loader, ShieldCheck } from 'lucide-react';

const STATUT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  'en_attente': { label: 'En attente', color: '#92400e', bg: '#fef3c7' },
  'en_cours': { label: 'En cours', color: '#1e40af', bg: '#dbeafe' },
  'valide': { label: 'Validé', color: '#166534', bg: '#dcfce7' },
  'valide_avec_reserves': { label: 'Validé avec réserves', color: '#92400e', bg: '#fef3c7' },
  'non_valide': { label: 'Non validé', color: '#991b1b', bg: '#fee2e2' },
  'ne_me_concerne_pas': { label: 'Ne me concerne pas', color: '#1e40af', bg: '#dbeafe' },
  'transfere': { label: 'Transféré', color: '#6b21a8', bg: '#f3e8ff' }
};

const ACTION_LABELS: Record<string, string> = {
  'demande_validation': 'Demande de validation',
  'validation': 'Validation du service fait',
  'validation_reserves': 'Validation avec réserves',
  'non_validation': 'Non-validation',
  'ne_me_concerne_pas': 'Retour (ne me concerne pas)',
  'transfert': 'Transfert'
};

function formatAmount(v: any) {
  const n = parseFloat(v);
  if (isNaN(n)) return '-';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fileUrl(dbPath: string) {
  if (!dbPath) return '';
  const clean = dbPath.replace(/^\/?storage\//, '');
  return `/api/storage/${clean}`;
}

export default function ServiceFaitProcessus() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    axios.get(`/api/finance/service-fait/${id}`, { headers })
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.message || 'Workflow introuvable.'))
      .finally(() => setLoading(false));
  }, [id]);

  const wf = data;
  const statusMeta = wf ? (STATUT_LABELS[wf.status] || STATUT_LABELS.en_attente) : null;

  return (
    <div style={{ padding: 24, fontFamily: 'ui-sans-serif, system-ui, sans-serif', maxWidth: 840, margin: '0 auto' }}>
      <button onClick={() => navigate(-1)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 13, marginBottom: 16, padding: 0 }}>
        <ArrowLeft size={15} /> Retour
      </button>

      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Chargement...
        </div>
      )}

      {error && !loading && (
        <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 12, padding: '20px 24px', color: '#b91c1c', fontSize: 14 }}>
          {error}
        </div>
      )}

      {wf && !error && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldCheck size={24} color="#6366f1" />
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#18181b', margin: 0 }}>
                Processus de validation — Service fait
              </h1>
            </div>
            {statusMeta && (
              <span style={{ background: statusMeta.bg, color: statusMeta.color, padding: '4px 12px', borderRadius: 999, fontWeight: 600, fontSize: 13 }}>
                {statusMeta.label}
              </span>
            )}
          </div>

          {/* Invoice card */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Facture concernée</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><div style={{ fontSize: 11, color: '#94a3b8' }}>N° facture</div><div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>{wf.invoice_number || wf.invoice_ref}</div></div>
              <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Fournisseur</div><div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>{wf.invoice_supplier || '-'}</div></div>
              <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Montant TTC</div><div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>{formatAmount(wf.invoice_amount)}</div></div>
              <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Section</div><div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>{wf.invoice_section || '-'}</div></div>
            </div>
            {wf.invoice_label && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Libellé</div>
                <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>{wf.invoice_label}</div>
              </div>
            )}
            {wf.file_path && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                <a href={fileUrl(wf.file_path)} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#2563eb', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
                  <FileText size={14} /> Voir la facture
                </a>
              </div>
            )}
          </div>

          {/* Process info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Demandé par</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b', marginTop: 2 }}>{wf.requested_by}</div>
              {wf.requested_at && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{new Date(wf.requested_at).toLocaleString('fr-FR')}</div>}
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Vérificateur actuel</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b', marginTop: 2 }}>{wf.verifier_name || wf.verifier_username || '-'}</div>
              {wf.decision_at && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Décision le {new Date(wf.decision_at).toLocaleString('fr-FR')}</div>}
            </div>
          </div>

          {wf.transfer_to_username && (
            <div style={{ background: '#f3e8ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: 12, marginBottom: 20, fontSize: 13, color: '#6b21a8' }}>
              <strong>Transféré vers :</strong> {wf.transfer_to_name || wf.transfer_to_username} ({wf.transfer_to_email || 'email non renseigné'})
            </div>
          )}

          {wf.decision_comment && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 12, marginBottom: 20, fontSize: 13, color: '#92400e' }}>
              <strong>Commentaire de décision :</strong> {wf.decision_comment}
            </div>
          )}

          {/* Pieces jointes */}
          {data?.pieces_jointes && data.pieces_jointes.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Paperclip size={14} /> Pièces jointes
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.pieces_jointes.map((pj: any) => (
                  <a key={pj.id} href={fileUrl(pj.file_path)} target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, color: '#1e40af', fontSize: 13, textDecoration: 'none' }}>
                    <FileText size={14} /> {pj.original_name}
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
                      par {pj.uploaded_by} · {pj.uploaded_at ? new Date(pj.uploaded_at).toLocaleDateString('fr-FR') : ''}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Historique */}
          {data?.historique && data.historique.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <History size={14} /> Historique du processus
              </div>
              <div style={{ borderLeft: '2px solid #e2e8f0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {data.historique.map((h: any) => (
                  <div key={h.id} style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: -27, top: 4, width: 10, height: 10, borderRadius: 999, background: '#6366f1', border: '2px solid #fff', boxShadow: '0 0 0 1px #6366f1' }} />
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{ACTION_LABELS[h.action] || h.action}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                      par {h.actor_name || h.actor_username} · {h.created_at ? new Date(h.created_at).toLocaleString('fr-FR') : ''}
                    </div>
                    {h.comment && <div style={{ fontSize: 13, color: '#64748b', marginTop: 6, background: '#f8fafc', padding: '8px 12px', borderRadius: 8 }}>{h.comment}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
