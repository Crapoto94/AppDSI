import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2, XCircle, Loader, FileText, ShieldCheck } from 'lucide-react';

/**
 * Page publique de VISA du directeur (lien envoyé par email après la validation du
 * valideur principal, quand le mode « avec visa » a été choisi au lancement).
 * Le visa positif déclenche la certification du service fait dans Sedit, avec un PV
 * scellé embarquant les deux valideurs.
 */
const ServiceFaitVisa: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wf, setWf] = useState<any>(null);
  const [closed, setClosed] = useState(false);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | 'valide' | 'non_valide'>(null);

  useEffect(() => {
    if (!token) return;
    axios.get(`/api/finance/service-fait/public/director/${token}`)
      .then(r => {
        setWf(r.data.workflow);
        setClosed(!!r.data.closed);
      })
      .catch(e => setError(e.response?.data?.message || 'Lien invalide ou expiré'))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async (decision: 'valide' | 'non_valide') => {
    if (decision === 'non_valide' && !comment.trim()) { setError('Un motif est requis pour refuser.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await axios.post(`/api/finance/service-fait/public/director/${token}/decision`, { decision, comment });
      setDone(decision);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur lors de la soumission.');
    } finally {
      setSubmitting(false);
    }
  };

  const fmtAmount = (v: any) => (v != null && !isNaN(parseFloat(v))) ? parseFloat(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €' : '-';

  if (loading) {
    return <div style={page}><div style={card}><Loader className="spin" size={32} /><p style={{ color: '#64748b' }}>Chargement…</p></div></div>;
  }
  if (error && !wf) {
    return <div style={page}><div style={card}><XCircle size={40} color="#dc2626" /><h2 style={h2}>Lien invalide</h2><p style={{ color: '#64748b' }}>{error}</p></div></div>;
  }
  if (done) {
    return (
      <div style={page}><div style={card}>
        {done === 'valide' ? <CheckCircle2 size={48} color="#16a34a" /> : <XCircle size={48} color="#dc2626" />}
        <h2 style={h2}>{done === 'valide' ? 'Visa apposé' : 'Service fait refusé'}</h2>
        <p style={{ color: '#64748b' }}>
          {done === 'valide'
            ? 'Le service fait est visé et certifié dans Sedit (procès-verbal scellé avec les deux valideurs).'
            : 'Votre refus a été enregistré et le demandeur a été informé.'}
        </p>
      </div></div>
    );
  }

  return (
    <div style={page}>
      <div style={{ ...card, maxWidth: 680, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <ShieldCheck size={22} color="#6366f1" />
          <h2 style={{ ...h2, margin: 0 }}>Visa du directeur — service fait</h2>
        </div>
        <p style={{ color: '#64748b', marginTop: 0, fontSize: 13 }}>
          {wf?.director_name || wf?.director_username} — {wf?.entity_label || wf?.entity_code}
        </p>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, margin: '14px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', marginBottom: 8 }}>Facture</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><div style={lbl}>N° facture</div><div style={val}>{wf?.invoice_number || wf?.invoice_ref || '-'}</div></div>
            <div><div style={lbl}>Fournisseur</div><div style={val}>{wf?.invoice_supplier || '-'}</div></div>
            <div><div style={lbl}>Montant TTC</div><div style={val}>{fmtAmount(wf?.invoice_amount)}</div></div>
            <div><div style={lbl}>Valideur principal</div><div style={val}>{wf?.verifier_name || wf?.verifier_username || '-'}</div></div>
          </div>
          {wf?.invoice_label && <div style={{ marginTop: 8, fontSize: 12, color: '#374151' }}>{wf.invoice_label}</div>}
          {wf?.decision_comment && <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}><strong>Commentaire du valideur :</strong> {wf.decision_comment}</div>}
        </div>

        {closed && (
          <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>
            Ce visa a déjà été traité.
          </div>
        )}
        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {!closed && (
          <>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Commentaire (obligatoire en cas de refus)</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => submit('valide')} disabled={submitting}
                style={{ flex: 2, padding: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: submitting ? '#a7f3d0' : '#16a34a', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: submitting ? 'default' : 'pointer' }}>
                {submitting ? <Loader className="spin" size={16} /> : <CheckCircle2 size={16} />} Viser le service fait
              </button>
              <button onClick={() => submit('non_valide')} disabled={submitting}
                style={{ flex: 1, padding: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#fff', color: '#b91c1c', border: '1.5px solid #fecaca', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: submitting ? 'default' : 'pointer' }}>
                <XCircle size={16} /> Refuser
              </button>
            </div>
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#475569' }}>
          <FileText size={15} color="#7c3aed" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>En visant, vous confirmez le service fait. Le procès-verbal scellé (AC interne) embarquant les deux valideurs sera envoyé dans Sedit comme pièce jointe de la facture.</span>
        </div>
      </div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

const page: React.CSSProperties = { minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Montserrat', sans-serif" };
const card: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: 32, maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 20px 50px -12px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0' };
const h2: React.CSSProperties = { fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '12px 0 8px' };
const lbl: React.CSSProperties = { fontSize: 11, color: '#94a3b8' };
const val: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#18181b' };

export default ServiceFaitVisa;
