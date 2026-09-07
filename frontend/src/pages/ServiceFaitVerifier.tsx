import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle, AlertTriangle, XCircle, UserRoundCog, Repeat, FileText, Paperclip, History, Loader } from 'lucide-react';

const STATUT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  'en_attente': { label: 'En attente', color: '#92400e', bg: '#fef3c7' },
  'en_cours': { label: 'En cours', color: '#1e40af', bg: '#dbeafe' },
  'valide': { label: 'Validé', color: '#166534', bg: '#dcfce7' },
  'valide_avec_reserves': { label: 'Validé avec réserves', color: '#92400e', bg: '#fef3c7' },
  'non_valide': { label: 'Non validé', color: '#991b1b', bg: '#fee2e2' },
  'ne_me_concerne_pas': { label: 'Ne me concerne pas', color: '#1e40af', bg: '#dbeafe' },
  'transfere': { label: 'Transféré', color: '#6b21a8', bg: '#f3e8ff' }
};

const DECISIONS = [
  { id: 'valide', icon: CheckCircle, title: 'Je valide le service fait', color: '#16a34a', bg: '#dcfce7', desc: 'Le service a été réalisé conformément à la facture.' },
  { id: 'valide_avec_reserves', icon: AlertTriangle, title: 'Je valide avec réserves', color: '#d97706', bg: '#fef3c7', desc: 'Valide, mais des réserves doivent être notées.' },
  { id: 'non_valide', icon: XCircle, title: 'Je ne valide pas le service fait', color: '#dc2626', bg: '#fee2e2', desc: 'Le service n\'a pas été réalisé, un motif est requis.' },
  { id: 'ne_me_concerne_pas', icon: UserRoundCog, title: 'Ne me concerne pas', color: '#2563eb', bg: '#dbeafe', desc: 'Cette demande ne relève pas de ma compétence, elle retourne au demandeur.' },
  { id: 'transfere', icon: Repeat, title: 'Je transfère', color: '#9333ea', bg: '#f3e8ff', desc: 'Un autre agent est plus compétent pour déterminer le service fait.' }
];

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

export default function ServiceFaitVerifier() {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [decision, setDecision] = useState('');
  const [comment, setComment] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [pjFiles, setPjFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!token) return;
    axios.get(`/api/finance/service-fait/public/${token}`)
      .then(r => {
        if (r.data.closed) {
          setData(r.data);
        } else {
          setData(r.data);
        }
      })
      .catch(e => setError(e.response?.data?.message || 'Ce lien est invalide ou a expiré.'))
      .finally(() => setLoading(false));
  }, [token]);

  const wf = data?.workflow;
  const statusMeta = wf ? (STATUT_LABELS[wf.status] || STATUT_LABELS.en_attente) : null;
  const isClosed = wf && ['valide', 'valide_avec_reserves', 'non_valide', 'ne_me_concerne_pas'].includes(wf.status);
  const canAct = wf && ['en_attente', 'en_cours', 'transfere'].includes(wf.status);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canAct || !decision) return;
    setSending(true);
    setError('');
    try {
      const body: any = { decision };
      if (['valide_avec_reserves', 'non_valide'].includes(decision)) {
        body.comment = comment.trim();
      }
      if (decision === 'transfere') {
        if (!transferTo) { setError('Veuillez sélectionner un agent pour le transfert.'); setSending(false); return; }
        body.transfer_to_username = transferTo;
        if (comment.trim()) body.comment = comment.trim();
      }
      if (pjFiles.length > 0) {
        const formData = new FormData();
        pjFiles.forEach(f => formData.append('files', f));
        await axios.post(`/api/finance/service-fait/${wf.id}/pieces-jointes`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      await axios.post(`/api/finance/service-fait/public/${token}/decision`, body);
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de l\'envoi de la décision.');
    } finally {
      setSending(false);
    }
  }

  const renderDecisionError = () => {
    if (['valide_avec_reserves', 'non_valide'].includes(decision) && !comment.trim()) {
      return 'Un commentaire est requis pour cette décision.';
    }
    if (decision === 'transfere' && !transferTo) {
      return 'Veuillez sélectionner un agent pour le transfert.';
    }
    return null;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'ui-sans-serif, system-ui, sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <FileText size={28} color="#6366f1" />
          <div>
            <div style={{ fontSize: 13, color: '#6366f1', fontWeight: 700, letterSpacing: '0.05em' }}>DSI · Direction des Systèmes d'Information</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Validation du service fait</div>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Loader size={18} className="spinner" /> Chargement...
          </div>
        )}

        {error && !loading && (
          <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 12, padding: '20px 24px', color: '#b91c1c', fontSize: 14 }}>
            {error}
          </div>
        )}

        {sent ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#166534', margin: '0 0 8px' }}>Décision enregistrée</h2>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
              Votre décision a bien été transmise au demandeur. Merci pour votre réponse.
            </p>
          </div>
        ) : wf ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            {/* Statut */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#18181b', margin: 0 }}>Validation du service fait</h1>
              {statusMeta && (
                <span style={{ background: statusMeta.bg, color: statusMeta.color, padding: '4px 12px', borderRadius: 999, fontWeight: 600, fontSize: 13 }}>
                  {statusMeta.label}
                </span>
              )}
            </div>

            {/* Invoice card */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Facture concernée</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><div style={{ fontSize: 11, color: '#94a3b8' }}>N° facture</div><div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>{wf.invoice_number || wf.invoice_ref}</div></div>
                <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Fournisseur</div><div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>{wf.invoice_supplier || '-'}</div></div>
                <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Montant TTC</div><div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>{formatAmount(wf.invoice_amount)}</div></div>
                <div><div style={{ fontSize: 11, color: '#94a3b8' }}>Demandeur</div><div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>{wf.requested_by}</div></div>
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

            {/* Pieces jointes */}
            {data?.pieces_jointes && data.pieces_jointes.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Paperclip size={14} /> Pièces jointes
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.pieces_jointes.map((pj: any) => (
                    <a key={pj.id} href={fileUrl(pj.file_path)} target="_blank" rel="noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, color: '#1e40af', fontSize: 13, textDecoration: 'none' }}>
                      <FileText size={14} /> {pj.original_name}
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
                        {pj.uploaded_at ? new Date(pj.uploaded_at).toLocaleDateString('fr-FR') : ''}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Historique */}
            {data?.historique && data.historique.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <button onClick={() => setShowHistory(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#6366f1', fontWeight: 600, padding: 0 }}>
                  <History size={15} /> {showHistory ? 'Masquer' : 'Voir'} l'historique
                </button>
                {showHistory && (
                  <div style={{ marginTop: 10, borderLeft: '2px solid #e2e8f0', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {data.historique.map((h: any) => (
                      <div key={h.id}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: '#6366f1', marginLeft: -21 }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{ACTION_LABELS[h.action] || h.action}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, marginLeft: 0 }}>
                          par {h.actor_name || h.actor_username}
                          {h.created_at ? ` · ${new Date(h.created_at).toLocaleString('fr-FR')}` : ''}
                        </div>
                        {h.comment && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, background: '#f8fafc', padding: '6px 10px', borderRadius: 6 }}>{h.comment}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            {isClosed ? (
              <div style={{ background: '#f1f5f9', borderRadius: 12, padding: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{wf.status === 'valide' ? '✅' : wf.status === 'valide_avec_reserves' ? '⚠️' : '✋'}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>
                  Ce workflow de validation est déjà clôturé.
                </div>
                {wf.decision_comment && (
                  <div style={{ marginTop: 12, fontSize: 13, color: '#64748b', background: '#fff', padding: '10px 14px', borderRadius: 8, display: 'inline-block', maxWidth: '100%', wordBreak: 'break-word' }}>
                    {wf.decision_comment}
                  </div>
                )}
              </div>
            ) : canAct ? (
              <form onSubmit={handleSubmit}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Votre décision</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {DECISIONS.map(d => (
                    <label key={d.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                        border: decision === d.id ? `2px solid ${d.color}` : '1.5px solid #e2e8f0',
                        borderRadius: 10, cursor: 'pointer', background: decision === d.id ? d.bg : '#fff',
                        transition: 'all 0.15s'
                      }}>
                      <input type="radio" name="decision" value={d.id} checked={decision === d.id}
                        onChange={() => { setDecision(d.id); setComment(''); setTransferTo(''); }}
                        style={{ accentColor: d.color }} />
                      <d.icon size={20} color={d.color} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>{d.title}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{d.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {decision && (
                  <div style={{ marginTop: 16 }}>
                    {['valide_avec_reserves', 'non_valide'].includes(decision) && (
                      <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                          {decision === 'valide_avec_reserves' ? 'Vos réserves' : 'Motif'}
                        </label>
                        <textarea value={comment} onChange={e => setComment(e.target.value)}
                          placeholder={decision === 'valide_avec_reserves' ? 'Décrivez vos réserves...' : 'Motif du refus...'}
                          rows={3} required
                          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                    )}

                    {decision === 'transfere' && (
                      <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                          Agent à qui transférer
                        </label>
                        <select value={transferTo} onChange={e => setTransferTo(e.target.value)} required
                          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', background: '#fff' }}>
                          <option value="">-- Sélectionner un agent DSI --</option>
                          {data?.agents?.map((a: any) => (
                            <option key={a.username} value={a.username}>{a.nom || a.username}</option>
                          ))}
                        </select>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', margin: '12px 0 6px' }}>
                          Commentaire du transfert (optionnel)
                        </label>
                        <textarea value={comment} onChange={e => setComment(e.target.value)}
                          placeholder="Précisez pourquoi vous transférez..."
                          rows={2}
                          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                    )}

                    {/* Ajout de PJ par le vérificateur */}
                    {(decision === 'valide' || decision === 'valide_avec_reserves') && (
                      <div style={{ marginTop: 12 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                          Pièces jointes (optionnel)
                        </label>
                        <input type="file" multiple
                          onChange={e => setPjFiles(Array.from(e.target.files || []))}
                          style={{ fontSize: 13 }} />
                      </div>
                    )}
                  </div>
                )}

                {decision && renderDecisionError() && (
                  <div style={{ marginTop: 12, fontSize: 13, color: '#dc2626' }}>{renderDecisionError()}</div>
                )}

                <button type="submit" disabled={sending || !decision || !!renderDecisionError()}
                  style={{
                    marginTop: 20, width: '100%', padding: '14px',
                    background: sending || !decision || renderDecisionError() ? '#a5b4fc' : '#6366f1',
                    color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700,
                    cursor: sending || !decision || renderDecisionError() ? 'default' : 'pointer', transition: 'background 0.15s'
                  }}>
                  {sending ? 'Envoi...' : 'Soumettre ma décision'}
                </button>

                <p style={{ marginTop: 12, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
                  Ce lien est personnel et lié à votre adresse email ({wf.verifier_email || 'non renseignée'}).
                  Votre décision sera transmise au demandeur.
                </p>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
      <style>{`.spinner{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
