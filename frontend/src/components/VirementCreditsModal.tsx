import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Send, X, Download, Mail } from 'lucide-react';
import AgentPickerRH, { type AgentRef } from './parapheur/AgentPickerRH';

export interface VirementRec {
  id: number;
  created_by_name: string | null;
  created_at: string;
  direction: string | null;
  service: string | null;
  contact: string | null;
  date_demande: string | null;
  section: string;
  sens: string;
  compense: boolean;
  montant: string | number;
  motivation: string | null;
  parapheur_id: number | null;
  para_reference: string | null;
  para_status: string | null;
  sent_at: string | null;
  sent_by: string | null;
  sent_to: string | null;
  sent_cc: string | null;
  etat: 'brouillon' | 'en_signature' | 'signee' | 'refusee' | 'annulee' | 'envoyee';
}

export const ETATS: Record<VirementRec['etat'], { label: string; color: string }> = {
  brouillon: { label: 'Brouillon', color: '#64748b' },
  en_signature: { label: 'En signature', color: '#d97706' },
  signee: { label: 'Signée', color: '#16a34a' },
  refusee: { label: 'Signature refusée', color: '#dc2626' },
  annulee: { label: 'Parapheur annulé', color: '#dc2626' },
  envoyee: { label: 'Envoyée au budget', color: '#2563eb' },
};

// Cadres « Avis » du PDF : position du centre de la signature (en % de la page)
const AVIS_BLOCKS = [
  { label: 'Avis du responsable de service', page: 1, x: 73.6, y: 56.5 },
  { label: 'Avis de la direction', page: 1, x: 73.6, y: 63.4 },
  { label: 'Avis de la direction des services financiers', page: 1, x: 73.6, y: 70.3 },
  { label: 'Avis de la direction générale', page: 1, x: 73.6, y: 77.2 },
  { label: "Avis de l'élu (e) de secteur", page: 1, x: 73.6, y: 84.1 },
  { label: "Avis de l'élue aux finances", page: 1, x: 73.6, y: 91.0 },
];

const s: Record<string, React.CSSProperties> = {
  input: { width: '100%', padding: '0.5rem 0.7rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.9rem', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: 4 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 1.1rem', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer', justifyContent: 'center' },
  box: { border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' },
};

const fmtMoney = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtDT = (d: string) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

interface Props {
  id: number;
  direction: string;
  onClose: () => void;
  onChanged: () => void;
}

const VirementCreditsModal: React.FC<Props> = ({ id, direction, onClose, onChanged }) => {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [rec, setRec] = useState<VirementRec | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfSigned, setPdfSigned] = useState(false);
  const [directors, setDirectors] = useState<{ entity_code: string; entity_label: string; director_name: string; director_email: string }[]>([]);
  const [settings, setSettings] = useState<{ to: string; cc: string }>({ to: 'budget@ivry94.fr', cc: '' });
  const [signer, setSigner] = useState<AgentRef[]>([]);
  const [signerTouched, setSignerTouched] = useState(false);
  const [avisIdx, setAvisIdx] = useState(1);
  const [paraMessage, setParaMessage] = useState('');
  const [mailMessage, setMailMessage] = useState('');
  const [busy, setBusy] = useState<'' | 'para' | 'mail'>('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const reload = useCallback(async () => {
    const r = await fetch('/api/budget/virement-credits', { headers });
    if (r.ok) {
      const list: VirementRec[] = await r.json();
      setRec(list.find(x => x.id === id) || null);
    }
    const p = await fetch(`/api/budget/virement-credits/${id}/pdf`, { headers });
    if (p.ok) {
      setPdfSigned(p.headers.get('X-Pdf-Signed') === '1');
      const blob = await p.blob();
      setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    reload().catch(() => {});
    fetch('/api/finance/service-fait/directors', { headers }).then(r => (r.ok ? r.json() : [])).then(setDirectors).catch(() => {});
    fetch('/api/budget/virement-credits/settings', { headers }).then(r => (r.ok ? r.json() : null)).then(v => v && setSettings(v)).catch(() => {});
    return () => { setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Signataire par défaut : directeur de la direction
  const defaultDirector = directors.find(d => {
    const k = (direction || rec?.direction || '').trim().toLowerCase();
    return k && d.director_email && (String(d.entity_code).toLowerCase() === k || String(d.entity_label).toLowerCase() === k);
  }) || null;
  useEffect(() => {
    if (defaultDirector && !signerTouched && signer.length === 0) {
      setSigner([{ displayName: defaultDirector.director_name, email: defaultDirector.director_email }]);
    }
  }, [defaultDirector, signerTouched, signer.length]);

  // Petit message par défaut, gentil
  useEffect(() => {
    if (rec && !mailMessage) {
      setMailMessage(
        `Bonjour,\n\nVeuillez trouver ci-joint une demande de modification budgétaire (virement de crédits de ${fmtMoney(Number(rec.montant))}) `
        + `pour le service ${rec.service || rec.direction || ''}.\n\nMerci beaucoup pour votre aide, et très belle journée !\n\nCordialement,\n${rec.contact || rec.created_by_name || ''}`
      );
    }
  }, [rec, mailMessage]);

  const call = async (path: string, body: unknown) => {
    const r = await fetch(`/api/budget/virement-credits/${id}/${path}`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || 'Erreur');
    return data;
  };

  const sendToParapheur = async () => {
    if (!signer.length) return;
    setBusy('para'); setError(''); setInfo('');
    try {
      const a = AVIS_BLOCKS[avisIdx];
      await call('parapheur', {
        signataire: { nom: signer[0].displayName, email: signer[0].email, service: signer[0].service },
        position: { page: a.page, x: a.x, y: a.y },
        message: paraMessage,
      });
      setInfo('Envoyée au parapheur.');
      await reload(); onChanged();
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };

  const sendToBudget = async () => {
    if (!rec) return;
    if (!pdfSigned && !window.confirm("Le document n'est pas encore signé. L'envoyer quand même à " + settings.to + ' ?')) return;
    setBusy('mail'); setError(''); setInfo('');
    try {
      const r = await call('send-budget', { message: mailMessage });
      setInfo(`Mail envoyé à ${r.to.join(', ')}${r.cc.length ? ' (copie : ' + r.cc.join(', ') + ')' : ''}.`);
      await reload(); onChanged();
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };

  const etat = rec ? ETATS[rec.etat] : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 'min(1200px, 100%)', height: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0' }}>
          <strong>Demande de virement de crédits #{id}</strong>
          {etat && <span style={{ background: etat.color, color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600 }}>{etat.label}</span>}
          <span style={{ flex: 1 }} />
          {pdfUrl && (
            <a href={pdfUrl} download="demande-modification-budgetaire.pdf" style={{ ...s.btn, background: '#64748b', textDecoration: 'none' }}>
              <Download size={15} /> Télécharger
            </a>
          )}
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }} title="Fermer"><X size={20} /></button>
        </div>
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {pdfUrl ? <iframe title="Prévisualisation" src={pdfUrl} style={{ flex: 1, border: 'none' }} /> : <div style={{ flex: 1, padding: '1rem' }}>Chargement…</div>}
          <div style={{ width: 360, padding: '1rem', borderLeft: '1px solid #e2e8f0', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {rec && (
              <>
                {/* Parapheur */}
                <div style={s.box}>
                  <strong style={{ fontSize: '0.9rem' }}>1. Signature (parapheur)</strong>
                  {rec.parapheur_id ? (
                    <div style={{ fontSize: '0.85rem' }}>
                      Envoyée au parapheur ({rec.para_reference || `#${rec.parapheur_id}`}) — {rec.para_status === 'termine' ? 'signée' : rec.para_status === 'refuse' ? 'refusée' : rec.para_status === 'annule' ? 'annulée' : 'en attente de signature'}.
                      <div><a href={`/parapheur/${rec.parapheur_id}`} target="_blank" rel="noreferrer">Ouvrir dans le parapheur</a></div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label style={s.label}>Qui doit signer ?{defaultDirector && !signerTouched ? ' (directeur par défaut)' : ''}</label>
                        <AgentPickerRH value={signer} token={token}
                          onChange={(v) => { setSignerTouched(true); setSigner(v.slice(-1)); }}
                          placeholder="Rechercher un agent…" />
                        {!signer.length && !defaultDirector && (
                          <div style={{ fontSize: '0.75rem', color: '#d97706', marginTop: 4 }}>Directeur non trouvé pour « {direction || rec.direction || '—'} » : choisissez le signataire.</div>
                        )}
                      </div>
                      <div>
                        <label style={s.label}>Cadre de signature</label>
                        <select style={s.input} value={avisIdx} onChange={e => setAvisIdx(Number(e.target.value))}>
                          {AVIS_BLOCKS.map((a, i) => <option key={a.label} value={i}>{a.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={s.label}>Message au signataire (optionnel)</label>
                        <textarea style={{ ...s.input, minHeight: 56, fontFamily: 'inherit' }} value={paraMessage} onChange={e => setParaMessage(e.target.value)} />
                      </div>
                      <button style={{ ...s.btn, opacity: busy || !signer.length ? 0.5 : 1 }} disabled={!!busy || !signer.length} onClick={sendToParapheur}>
                        <Send size={16} /> {busy === 'para' ? 'Envoi…' : 'Envoyer au parapheur'}
                      </button>
                    </>
                  )}
                </div>

                {/* Mail budget */}
                <div style={s.box}>
                  <strong style={{ fontSize: '0.9rem' }}>2. Envoi à la cellule budget</strong>
                  <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                    À : <strong>{settings.to}</strong>{settings.cc && <> — copie : {settings.cc}</>}
                    <div style={{ color: pdfSigned ? '#16a34a' : '#d97706' }}>{pdfSigned ? 'Le PDF signé sera joint.' : 'Le PDF non signé sera joint.'}</div>
                  </div>
                  {rec.sent_at && (
                    <div style={{ fontSize: '0.8rem', color: '#2563eb' }}>
                      Déjà envoyée le {fmtDT(rec.sent_at)} à {rec.sent_to}{rec.sent_cc ? ` (copie : ${rec.sent_cc})` : ''}.
                    </div>
                  )}
                  <div>
                    <label style={s.label}>Message</label>
                    <textarea style={{ ...s.input, minHeight: 130, fontFamily: 'inherit' }} value={mailMessage} onChange={e => setMailMessage(e.target.value)} />
                  </div>
                  <button style={{ ...s.btn, opacity: busy ? 0.5 : 1 }} disabled={!!busy} onClick={sendToBudget}>
                    <Mail size={16} /> {busy === 'mail' ? 'Envoi…' : rec.sent_at ? 'Renvoyer le mail' : 'Envoyer le mail'}
                  </button>
                </div>
              </>
            )}
            {info && <div style={{ color: '#16a34a', fontSize: '0.85rem' }}>{info}</div>}
            {error && <div style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VirementCreditsModal;
