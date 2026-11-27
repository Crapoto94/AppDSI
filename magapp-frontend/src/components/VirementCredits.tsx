import React, { useCallback, useEffect, useMemo, useState } from 'react';
import logoDsiHub from '../assets/DSI.png';
import { HelpButton, HelpModal } from './HelpButton';
import { X, FileText, Trash2, Search, AlertTriangle, Send, Mail, Eye, Download, ArrowLeftRight, Copy } from 'lucide-react';
import { appAlert, appConfirm } from './AppDialogs';
import VirementTraitement from './VirementTraitement';
import { API, authHeaders, jsonHeaders, ETATS, fmt, fmtMoney, fmtDate, s, type Rec, type PayloadLine } from './virementShared';

// BETA « Virement de crédits » : demande de modification budgétaire pour les agents ayant un compte SEDIT Finances.
// - lignes proposées = celles que l'agent peut modifier dans SEDIT (filtrées côté serveur) ;
// - signatures : responsable de service puis directeur, déduits de l'agent connecté (/admin/ville → encadrants), au changement
//   uniquement les responsables / directeurs des services et directions autorisés à l'agent.

interface BudgetLine {
  Code: string; Budget?: string; 'Libellé': string; Sens: string; Section: string;
  'Article par nature': string; 'Chapitre par nature': string; 'Référence Fonctionnelle': string;
  "Opération d'équipement": string; 'Service Gestionnaire': string; EQUIPEMENT: string;
  'Budget voté': number; Disponible: number; 'Mt. prévision': number;
}
interface Picked { line: BudgetLine; montant: string }
interface Encadrant {
  matricule: string; nom: string; prenom: string; email: string; role: 'directeur' | 'responsable_service';
  service_code: string; service_label: string; direction_code: string; direction_label: string;
}
interface SignatairesData {
  me: { service_code: string; service_label: string; direction_code: string; direction_label: string; prenom: string; nom: string } | null;
  responsables: Encadrant[]; directeurs: Encadrant[];
  defaults: { responsable: Encadrant | null; directeur: Encadrant | null };
}
// Enveloppes d'investissement proposées pour les services de la DSI (règle historique de la DSI, services BF*)
const ENVELOPPES = ['ENV16', 'ENV28', 'ENV29'];
const clean = (v: string) => (!v || v === '-' ? '' : v);
const shortOp = (v: string) => clean(v).replace(/^([A-Za-z]+)0+(\d)/, '$1$2');
const toNum = (v: string) => { const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const nameOf = (e: Encadrant) => `${e.prenom || ''} ${e.nom || ''}`.trim();
const listNameOf = (e: Encadrant) => `${e.nom || ''} ${e.prenom || ''}`.trim();
const imputation = (l: BudgetLine) =>
  [l['Chapitre par nature'], l['Référence Fonctionnelle'], l['Article par nature'], shortOp(l["Opération d'équipement"]), l['Service Gestionnaire']]
    .map(x => x || '·').join(' / ');

const uniq = (v: string[]) => [...new Set(v.filter(Boolean))].sort((x, y) => x.localeCompare(y, 'fr', { numeric: true }));

// Filtres des lignes proposées (utiles quand le périmètre compte beaucoup de lignes ou plusieurs services)
const FILTRES = [
  { key: 'chapitre', label: 'Chapitre', field: 'Chapitre par nature' },
  { key: 'nature', label: 'Nature', field: 'Article par nature' },
  { key: 'fonction', label: 'Fonction', field: 'Référence Fonctionnelle' },
  { key: 'service', label: 'Code service', field: 'Service Gestionnaire' },
] as const;
type Filtres = Record<(typeof FILTRES)[number]['key'], string>;
const SANS_FILTRE: Filtres = { chapitre: '', nature: '', fonction: '', service: '' };

const Picker: React.FC<{
  title: string; sign: '+' | '-'; picked: Picked[]; setPicked: (p: Picked[]) => void; color: string;
  scoped: BudgetLine[]; taken: Set<string>; totalMin: number; totalMaj: number;
}> = ({ title, sign, picked, setPicked, color, scoped, taken, totalMin, totalMaj }) => {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const tokens = q.toLowerCase().split(/[\s/,;]+/).filter(Boolean);
    return scoped
      .filter(l => {
        if (taken.has(l.Code) || (sign === '-' && !(l.Disponible > 50))) return false;
        if (!tokens.length) return true;
        const hay = `${l.Code} ${l['Libellé']} ${imputation(l)} ${l["Opération d'équipement"]} ${shortOp(l["Opération d'équipement"])}`.toLowerCase();
        return tokens.every(t => hay.includes(t));
      })
      .slice(0, 200);
  }, [q, scoped, taken, sign]);
  const delta = sign === '+' ? 1 : -1;
  return (
    <div style={{ ...s.card, borderTop: `4px solid ${color}` }}>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color }}>{title}</h3>
      <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
        <input style={{ ...s.input, paddingLeft: 32 }} placeholder="Chercher une imputation (chapitre, nature, service, libellé…)"
          value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} />
        {open && results.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: 42, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, maxHeight: 300, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
            {results.map(l => (
              <div key={l.Code} onMouseDown={e => { e.preventDefault(); setPicked([...picked, { line: l, montant: '' }]); setQ(''); }}
                style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')} onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                <strong>{imputation(l)}</strong> <span style={{ color: '#64748b' }}>— {l['Libellé']}</span>
                <span style={{ float: 'right', color: l.Disponible < 0 ? '#dc2626' : '#475569' }}>Dispo {fmt(l.Disponible)} €</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {picked.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Aucune imputation sélectionnée.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={s.th}>Imputation</th><th style={{ ...s.th, ...s.right }}>Dispo avant</th>
                <th style={{ ...s.th, width: 150 }}>Montant {sign}</th><th style={{ ...s.th, ...s.right }}>Dispo après</th><th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {picked.map((p, i) => {
                const apres = p.line.Disponible + delta * toNum(p.montant);
                return (
                  <tr key={p.line.Code}>
                    <td style={s.td}><strong>{imputation(p.line)}</strong><div style={{ color: '#64748b', fontSize: '0.75rem' }}>{p.line.Code} — {p.line['Libellé']}</div></td>
                    <td style={{ ...s.td, ...s.right, color: p.line.Disponible < 0 ? '#dc2626' : undefined }}>{fmt(p.line.Disponible)}</td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input style={{ ...s.input, textAlign: 'right' }} inputMode="decimal" value={p.montant}
                          onChange={e => {
                            let v = e.target.value;
                            // Minoration plafonnée au disponible de la ligne
                            if (sign === '-' && toNum(v) > Math.max(0, p.line.Disponible)) v = String(Math.max(0, p.line.Disponible));
                            setPicked(picked.map((x, j) => (j === i ? { ...x, montant: v } : x)));
                          }} />
                        <button type="button" style={{ padding: '0 0.6rem', border: `1px solid ${color}`, color, background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem' }}
                          title={sign === '-' ? 'Minorer tout le disponible' : 'Majorer du montant libéré par les minorations'}
                          onClick={() => {
                            let v: number;
                            if (sign === '-') v = Math.max(0, p.line.Disponible);
                            else { v = Math.max(0, totalMin - (totalMaj - toNum(p.montant))); if (v === 0 && p.line.Disponible < 0) v = -p.line.Disponible; }
                            v = Math.round(v * 100) / 100;
                            setPicked(picked.map((x, j) => (j === i ? { ...x, montant: v ? String(v) : '' } : x)));
                          }}>Tout</button>
                      </div>
                    </td>
                    <td style={{ ...s.td, ...s.right, fontWeight: 700, color: apres < 0 ? '#dc2626' : '#16a34a' }}>{fmt(apres)}</td>
                    <td style={s.td}><button title="Retirer" onClick={() => setPicked(picked.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={16} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

type Source = 'mine' | 'service' | 'direction' | 'traitement';

// ───────────────────────── Détail : aperçu PDF, signatures, transmission, traitement ─────────────────────────
// source : liste d'où vient la demande (mes demandes, service, direction, espace de traitement)
const Detail: React.FC<{ id: number; sig: SignatairesData | null; source: Source; espaceOuvert: boolean; onClose: () => void; onChanged: () => void }> = ({ id, sig, source, espaceOuvert, onClose, onChanged }) => {
  const finances = source === 'traitement';
  const [rec, setRec] = useState<Rec | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [resp, setResp] = useState<string | null>(null); // e-mail, '' = aucun, null = pas encore choisi (défaut)
  const [dir, setDir] = useState<string | null>(null);
  const [paraMessage, setParaMessage] = useState('');
  const [mailMessage, setMailMessage] = useState('');
  const [busy, setBusy] = useState<'' | 'para' | 'mail' | 'espace' | 'traitement'>('');
  const [statut, setStatut] = useState<'fait' | 'en_cours' | 'refuse'>('fait');
  const [commentaire, setCommentaire] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Aperçu PDF : tant que la demande n'est pas au parapheur, les cadres « Avis » 1 et 2 indiquent où les signatures seront apposées
  const loadPdf = useCallback(async (respName: string, dirName: string) => {
    const qs = new URLSearchParams({ hints: '1' });
    if (respName) qs.set('resp', respName);
    if (dirName) qs.set('dir', dirName);
    const p = await fetch(`${API}/${id}/pdf?${qs}`, { headers: authHeaders() });
    if (p.ok) {
      const blob = await p.blob();
      setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
    }
  }, [id]);
  const reload = useCallback(async () => {
    const url = source === 'traitement' ? `${API}/traitement` : source === 'mine' ? API : `${API}?scope=${source}`;
    const r = await fetch(url, { headers: authHeaders() });
    if (r.ok) { const list: Rec[] = await r.json(); setRec(list.find(x => x.id === id) || null); }
  }, [id, source]);
  useEffect(() => {
    reload().catch(() => {});
    return () => { setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; }); };
  }, [reload]);
  useEffect(() => {
    if (rec && !mailMessage) {
      setMailMessage(`Bonjour,\n\nVeuillez trouver ci-joint une demande de modification budgétaire (virement de crédits de ${fmtMoney(Number(rec.montant))}) pour le service ${rec.service || rec.direction || ''}.\n\nMerci beaucoup pour votre aide, et très belle journée !\n\nCordialement,\n${rec.contact || rec.created_by_name || ''}`);
    }
  }, [rec, mailMessage]);

  const respEmail = resp ?? sig?.defaults.responsable?.email ?? '';
  const dirEmail = dir ?? sig?.defaults.directeur?.email ?? '';
  const pick = (list: Encadrant[], email: string) => list.find(e => e.email.toLowerCase() === email.toLowerCase()) || null;
  const respName = sig ? (pick(sig.responsables, respEmail) ? nameOf(pick(sig.responsables, respEmail)!) : '') : '';
  const dirName = sig ? (pick(sig.directeurs, dirEmail) ? nameOf(pick(sig.directeurs, dirEmail)!) : '') : '';
  const paraId = rec?.parapheur_id ?? null;
  const recLoaded = !!rec;
  useEffect(() => {
    if (!recLoaded) return;
    const t = setTimeout(() => { loadPdf(paraId ? '' : respName, paraId ? '' : dirName).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [recLoaded, paraId, sig, respName, dirName, loadPdf]);

  const call = async (path: string, body: unknown) => {
    const r = await fetch(`${API}/${id}/${path}`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || 'Erreur');
    return data;
  };
  const sendToParapheur = async () => {
    setBusy('para'); setError(''); setInfo('');
    try {
      const r = sig ? pick(sig.responsables, respEmail) : null;
      const d = sig ? pick(sig.directeurs, dirEmail) : null;
      await call('parapheur', { responsable: r && { email: r.email }, directeur: d && { email: d.email }, message: paraMessage });
      setInfo('Envoyée pour signature.');
      await reload(); onChanged();
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };
  const transmettre = async () => {
    if (!(await appConfirm('Transmettre cette demande à la direction des finances dans l’application, sans envoyer de mail ?', { confirmLabel: 'Transmettre' }))) return;
    setBusy('espace'); setError(''); setInfo('');
    try {
      await call('transmettre', {});
      setInfo('Transmise à la direction des finances. Vous recevrez un mail à chaque changement d’état.');
      await reload(); onChanged();
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };
  const acquitter = async () => {
    setBusy('traitement'); setError(''); setInfo('');
    try {
      const r = await call('traitement', { statut, commentaire });
      if (r.mail) setInfo(`Enregistré. Mail envoyé à ${r.mail}.`);
      else setError(`Enregistré, mais le demandeur n'a pas été prévenu par mail : ${r.mailError || 'envoi impossible'}.`);
      setCommentaire('');
      await reload(); onChanged();
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };
  const sendToBudget = async () => {
    if (!rec) return;
    setBusy('mail'); setError(''); setInfo('');
    try {
      const r = await call('send-budget', { message: mailMessage });
      setInfo(`Mail envoyé à ${r.to.join(', ')}.`);
      await reload(); onChanged();
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };

  const etat = rec ? ETATS[rec.etat] : null;
  const selector = (label: string, list: Encadrant[], value: string, set: (v: string) => void, def: Encadrant | null, labelOf: (e: Encadrant) => string) => (
    <div>
      <label style={s.label}>{label}</label>
      <select style={s.input} value={value} onChange={e => set(e.target.value)}>
        <option value="">— Aucun —</option>
        {list.map(e => (
          <option key={e.matricule + e.email} value={e.email}>{listNameOf(e)} — {labelOf(e)}{def && def.email === e.email ? ' (par défaut)' : ''}</option>
        ))}
      </select>
      {!list.length && <div style={{ fontSize: '0.75rem', color: '#d97706', marginTop: 4 }}>Aucun encadrant avec adresse e-mail pour votre périmètre budgétaire.</div>}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 'min(1200px, 100%)', height: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <strong>Demande de virement de crédits #{id}</strong>
          {etat && <span style={{ background: etat.color, color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600 }}>{etat.label}</span>}
          <span style={{ flex: 1 }} />
          {pdfUrl && <a href={pdfUrl} download="demande-modification-budgetaire.pdf" style={{ ...s.btn, background: '#64748b', textDecoration: 'none' }}><Download size={15} /> Télécharger</a>}
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }} title="Fermer"><X size={20} /></button>
        </div>
        <div style={{ flex: 1, display: 'flex', minHeight: 0, flexWrap: 'wrap' }}>
          {pdfUrl ? <iframe title="Prévisualisation" src={pdfUrl} style={{ flex: '1 1 420px', minHeight: 300, border: 'none' }} /> : <div style={{ flex: 1, padding: '1rem' }}>Chargement…</div>}
          <div style={{ width: 360, maxWidth: '100%', padding: '1rem', borderLeft: '1px solid #e2e8f0', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {rec && !!rec.treatment_status && (
              <div style={{ ...s.card, borderColor: ETATS[rec.etat].color, fontSize: '0.85rem' }}>
                <strong>Direction des finances : {ETATS[rec.etat].label}</strong>
                <div style={{ color: '#64748b' }}>le {fmtDate(rec.treated_at)}{finances && rec.treated_by ? ` par ${rec.treated_by}` : ''}</div>
                {rec.treatment_comment && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{rec.treatment_comment}</div>}
              </div>
            )}
            {rec && finances && (
              <div style={{ ...s.card, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                <strong style={{ fontSize: '0.9rem' }}>Traitement de la demande</strong>
                <div style={{ fontSize: '0.82rem', color: '#475569' }}>{rec.created_by_name} — {rec.service}<br />{fmtMoney(Number(rec.montant))}</div>
                <div>
                  <label style={s.label}>État</label>
                  <select style={s.input} value={statut} onChange={e => setStatut(e.target.value as typeof statut)}>
                    <option value="fait">Fait</option>
                    <option value="en_cours">En cours (ex. nécessite une décision modificative)</option>
                    <option value="refuse">Refusé</option>
                  </select>
                </div>
                <div>
                  <label style={s.label}>{statut === 'refuse' ? 'Raison du refus (obligatoire)' : 'Commentaire au demandeur'}</label>
                  <textarea style={{ ...s.input, minHeight: 90, fontFamily: 'inherit', borderColor: statut === 'refuse' && !commentaire.trim() ? '#dc2626' : '#cbd5e1' }} value={commentaire} onChange={e => setCommentaire(e.target.value)} />
                </div>
                <button style={{ ...s.btn, opacity: busy || (statut === 'refuse' && !commentaire.trim()) ? 0.5 : 1 }} disabled={!!busy || (statut === 'refuse' && !commentaire.trim())} onClick={acquitter}>
                  <Mail size={16} /> {busy === 'traitement' ? 'Enregistrement…' : 'Enregistrer et prévenir le demandeur'}
                </button>
              </div>
            )}
            {rec && !finances && source !== 'mine' && rec.mine === false && (
              <div style={{ ...s.card, fontSize: '0.85rem' }}>
                Demande de <strong>{rec.created_by_name}</strong> ({rec.service}) : consultation seule.
                {rec.motivation && <div style={{ marginTop: 6, color: '#475569', whiteSpace: 'pre-wrap' }}>{rec.motivation}</div>}
              </div>
            )}
            {rec && !finances && rec.mine !== false && (
              <>
                <div style={{ ...s.card, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  <strong style={{ fontSize: '0.9rem' }}>1. Signatures (parapheur)</strong>
                  {rec.parapheur_id ? (
                    <div style={{ fontSize: '0.85rem' }}>
                      Envoyée au parapheur ({rec.para_reference || `#${rec.parapheur_id}`}) — {rec.para_status === 'termine' ? 'signée' : rec.para_status === 'refuse' ? 'refusée' : rec.para_status === 'annule' ? 'annulée' : 'en attente de signature'}.
                    </div>
                  ) : !(rec.motivation || '').trim() ? (
                    <div style={{ fontSize: '0.85rem', color: '#dc2626' }}>Motivation absente : dupliquez la demande et renseignez-la avant de la faire signer.</div>
                  ) : !sig ? <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Chargement des signataires…</div> : (
                    <>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '6px 8px' }}>Le PDF comporte aussi les cadres des finances, de la direction générale et des élus : ils sont complétés ensuite par le service budget.</div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Signature successive : responsable de service puis directeur. Proposés : ceux de votre chaîne hiérarchique, ou des services/directions de votre périmètre SEDIT. Listes classées par nom.</div>
                      {selector('Responsable de service', sig.responsables, respEmail, setResp, sig.defaults.responsable, e => e.service_label || e.service_code)}
                      {selector('Directeur', sig.directeurs, dirEmail, setDir, sig.defaults.directeur, e => e.direction_label || e.direction_code)}
                      <div>
                        <label style={s.label}>Message aux signataires (optionnel)</label>
                        <textarea style={{ ...s.input, minHeight: 56, fontFamily: 'inherit' }} value={paraMessage} onChange={e => setParaMessage(e.target.value)} />
                      </div>
                      <button style={{ ...s.btn, opacity: busy || (!respEmail && !dirEmail) ? 0.5 : 1 }} disabled={!!busy || (!respEmail && !dirEmail)} onClick={sendToParapheur}>
                        <Send size={16} /> {busy === 'para' ? 'Envoi…' : 'Envoyer pour signature'}
                      </button>
                    </>
                  )}
                </div>
                <div style={{ ...s.card, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  <strong style={{ fontSize: '0.9rem' }}>2. Transmission à la direction des finances</strong>
                  {rec.sent_at && <div style={{ fontSize: '0.8rem', color: '#2563eb' }}>Transmise le {fmtDate(rec.sent_at)} à {rec.sent_to}.</div>}
                  {rec.para_status !== 'termine' ? (
                    <div style={{ fontSize: '0.82rem', color: '#d97706' }}>La demande ne peut être transmise qu’une fois toutes les signatures faites.</div>
                  ) : (
                    <>
                      {espaceOuvert && !rec.sent_at && (
                        <>
                          <button style={{ ...s.btn, background: '#7c3aed', opacity: busy ? 0.5 : 1 }} disabled={!!busy} onClick={transmettre}>
                            <Send size={16} /> {busy === 'espace' ? 'Transmission…' : 'Transmettre dans l’application'}
                          </button>
                          <div style={{ fontSize: '0.78rem', color: '#64748b', textAlign: 'center' }}>ou par mail au service budget :</div>
                        </>
                      )}
                      <div>
                        <label style={s.label}>Message</label>
                        <textarea style={{ ...s.input, minHeight: 130, fontFamily: 'inherit' }} value={mailMessage} onChange={e => setMailMessage(e.target.value)} />
                      </div>
                      <button style={{ ...s.btn, opacity: busy ? 0.5 : 1 }} disabled={!!busy} onClick={sendToBudget}>
                        <Mail size={16} /> {busy === 'mail' ? 'Envoi…' : rec.sent_at ? 'Renvoyer par mail' : 'Envoyer le mail'}
                      </button>
                    </>
                  )}
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

// ───────────────────────── Composant principal ─────────────────────────
export default function VirementCredits({ onClose, beta = false, userName = '', initialOpenId = null }: { onClose: () => void; beta?: boolean; userName?: string; initialOpenId?: number | null }) {
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveError, setLiveError] = useState('');
  const [sig, setSig] = useState<SignatairesData | null>(null);
  const [section, setSection] = useState<'I' | 'F'>('I');
  const [sens, setSens] = useState<'D' | 'R'>('D');
  const [compense, setCompense] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [activite, setActivite] = useState('');
  const [motivation, setMotivation] = useState('');
  const [minorer, setMinorer] = useState<Picked[]>([]);
  const [majorer, setMajorer] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'new' | 'history' | 'traitement'>('new');
  const [scope, setScope] = useState<'mine' | 'service' | 'direction'>('mine');
  const [droits, setDroits] = useState<{ canCreate: boolean; traitant: boolean; canManage: boolean }>({ canCreate: true, traitant: false, canManage: false });
  const [espaceOuvert, setEspaceOuvert] = useState(false);
  const [accessVersion, setAccessVersion] = useState(0);
  const [version, setVersion] = useState(0);
  const [filtres, setFiltres] = useState<Filtres>(SANS_FILTRE);
  const [pendingDup, setPendingDup] = useState<Rec | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(initialOpenId);
  const [rows, setRows] = useState<Rec[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Collectivité (Ville / CCAS) puis budget, limités aux droits de modification de l'agent (budgets clos écartés côté serveur)
  const [droitsBudgets, setDroitsBudgets] = useState<{ collectivite: string; budget: string }[]>([]);
  const [collectivite, setCollectivite] = useState('');
  const [budget, setBudget] = useState('');
  const collLabel = (c: string) => (c === 'CCAS' ? 'CCAS' : 'Ville');
  const budgetLabel = (b: string) => (/^PRINCIPAL$/i.test(b) ? 'Budget principal' : b);
  const collectivites = useMemo(() => ['VILLE', 'CCAS'].filter(c => droitsBudgets.some(d => d.collectivite === c)), [droitsBudgets]);
  const budgetsOf = useCallback((c: string) => [...new Set(droitsBudgets.filter(d => d.collectivite === c).map(d => d.budget))]
    .sort((x, y) => (/^PRINCIPAL$/i.test(x) ? -1 : /^PRINCIPAL$/i.test(y) ? 1 : x.localeCompare(y))), [droitsBudgets]);
  const budgets = budgetsOf(collectivite);

  useEffect(() => {
    fetch(`${API}/access`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : null)).then(a => {
      if (!a) return;
      const canCreate = a.canCreate !== false;
      setDroits({ canCreate, traitant: !!a.traitement?.traitant, canManage: !!a.traitement?.canManage });
      setDroitsBudgets((a.services || []).map((x: { collectivite?: string; budget: string }) => ({ collectivite: x.collectivite || 'VILLE', budget: x.budget })));
      if (!canCreate) { setMode(a.traitement?.canManage ? 'traitement' : 'history'); setLoading(false); }
    }).catch(() => {});
  }, [accessVersion]);
  // La transmission dans l'application n'est proposée que si au moins un agent des finances est désigné
  useEffect(() => {
    fetch(`${API}/espace`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : null)).then(v => setEspaceOuvert(!!v?.ouvert)).catch(() => {});
  }, [accessVersion]);
  useEffect(() => {
    if (!collectivite && collectivites.length) {
      setCollectivite(collectivites[0]);
      setBudget(budgetsOf(collectivites[0])[0] || '');
    }
  }, [collectivites, collectivite, budgetsOf]);

  const [linesKey, setLinesKey] = useState('');
  useEffect(() => {
    if (!collectivite || !budget) return;
    let stale = false;
    setLoading(true); setLiveError('');
    fetch(`${API}/lines?collectivite=${collectivite}&budget=${encodeURIComponent(budget)}`, { headers: authHeaders() })
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'SEDIT indisponible'); return r.json(); })
      .then(l => { if (!stale) { setLines(l); setLinesKey(`${collectivite}|${budget}`); } })
      .catch((e: Error) => { if (!stale) { setLines([]); setLiveError(e.message); } })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [collectivite, budget]);
  useEffect(() => {
    fetch(`${API}/signataires`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : null)).then(setSig).catch(() => {});
  }, []);

  const loadRows = useCallback(() => {
    setRowsLoading(true);
    fetch(scope === 'mine' ? API : `${API}?scope=${scope}`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(setRows).catch(() => setRows([])).finally(() => setRowsLoading(false));
  }, [scope]);
  useEffect(() => { if (mode === 'history') loadRows(); }, [mode, loadRows]);

  const direction = sig?.me?.direction_label || '';
  const service = sig?.me?.service_label || '';
  const contact = sig?.me ? `${sig.me.prenom || ''} ${sig.me.nom || ''}`.trim() : userName;

  const resetSelection = () => { setMinorer([]); setMajorer([]); setFiltres(SANS_FILTRE); setCurrentId(null); };
  const changeCollectivite = (c: string) => { if (c !== collectivite) { resetSelection(); setCollectivite(c); setBudget(budgetsOf(c)[0] || ''); } };
  const changeBudget = (b: string) => { if (b !== budget) { resetSelection(); setBudget(b); } };
  const changeScope = (sec: 'I' | 'F', sn: 'D' | 'R') => { if (sec !== section || sn !== sens) { setMinorer([]); setMajorer([]); setFiltres(SANS_FILTRE); } setSection(sec); setSens(sn); };

  // Le serveur ne renvoie que les lignes autorisées à l'agent. Règle DSI conservée : enveloppes ENV16/28/29 en investissement pour les services BF*.
  const scoped = useMemo(
    () => lines.filter(l => l.Section === section && l.Sens === sens && (!!l['Référence Fonctionnelle'] || !/^PRINCIPAL$/i.test(l.Budget || ''))
      && (section === 'F' || !/^BF/i.test(l['Service Gestionnaire'] || '') || ENVELOPPES.includes(shortOp(l["Opération d'équipement"])))),
    [lines, section, sens]);
  const match = (l: BudgetLine, except?: string) => FILTRES.every(f => f.key === except || !filtres[f.key] || l[f.field] === filtres[f.key]);
  const filtered = scoped.filter(l => match(l));
  const filtreActif = Object.values(filtres).some(Boolean);
  const taken = useMemo(() => new Set([...majorer, ...minorer].map(p => p.line.Code)), [majorer, minorer]);
  const totalMaj = majorer.reduce((a, p) => a + toNum(p.montant), 0);
  const totalMin = minorer.reduce((a, p) => a + toNum(p.montant), 0);
  const ecart = Math.round((totalMaj - totalMin) * 100) / 100;
  const desequilibre = compense && ecart !== 0;
  const hasLines = majorer.length + minorer.length > 0;
  const hasNegative = minorer.some(p => p.line.Disponible - toNum(p.montant) < 0);
  // Virement entre chapitres : les lignes touchées ne relèvent pas toutes du même chapitre
  const interChapitre = new Set([...majorer, ...minorer].map(p => p.line['Chapitre par nature'])).size > 1;
  const noLine = !loading && !liveError && scoped.length === 0;

  // Dupliquer : reprend une demande existante (refusée, annulée, envoyée…) dans un nouveau brouillon, sur son budget d'origine
  const applyDuplicate = useCallback((r: Rec, from: BudgetLine[]) => {
    const pl = r.payload;
    if (!pl) return;
    const find = (arr: PayloadLine[]) => arr.map(l => ({ line: from.find(x => x.Code === l.code), montant: String(l.montant) }))
      .filter((x): x is Picked => !!x.line);
    const maj = find(pl.majorer || []), min = find(pl.minorer || []);
    setSection(pl.section === 'F' ? 'F' : 'I'); setSens(pl.sens === 'R' ? 'R' : 'D');
    setCompense(pl.compense !== false); setActivite(pl.activite || ''); setMotivation(pl.motivation || '');
    setDate(new Date().toISOString().slice(0, 10));
    setMajorer(maj); setMinorer(min); setCurrentId(null); setFiltres(SANS_FILTRE); setError('');
    const lost = (pl.majorer || []).length + (pl.minorer || []).length - maj.length - min.length;
    if (lost > 0) setError(`${lost} ligne(s) de la demande d'origine ne sont plus disponibles dans votre périmètre et n'ont pas été reprises.`);
  }, []);
  const duplicate = (r: Rec) => {
    const c = r.payload?.collectivite || collectivite;
    const b = budgetsOf(c).find(x => x === r.payload?.budget) || (c === collectivite ? budget : budgetsOf(c)[0]) || budget;
    setMode('new');
    if (c !== collectivite || b !== budget) { resetSelection(); setCollectivite(c); setBudget(b); }
    setPendingDup(r);
  };
  useEffect(() => {
    if (pendingDup && !loading && linesKey === `${collectivite}|${budget}`) { applyDuplicate(pendingDup, lines); setPendingDup(null); }
  }, [pendingDup, loading, linesKey, collectivite, budget, lines, applyDuplicate]);

  const toPayloadLine = (p: Picked, delta: 1 | -1) => ({
    chapitre: p.line['Chapitre par nature'], fonction: p.line['Référence Fonctionnelle'], nature: p.line['Article par nature'],
    equipement: clean(p.line.EQUIPEMENT), operation: shortOp(p.line["Opération d'équipement"]), activite: p.line['Service Gestionnaire'],
    code: p.line.Code, montant: toNum(p.montant), avant: p.line.Disponible, apres: p.line.Disponible + delta * toNum(p.montant),
  });

  const generate = async () => {
    setError(''); setBusy(true);
    try {
      const res = await fetch(API, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({
          id: currentId, direction, service, contact, date, section, sens, compense, activite, motivation, budget, collectivite,
          majorer: majorer.map(p => toPayloadLine(p, 1)), minorer: minorer.map(p => toPayloadLine(p, -1)),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) { setCurrentId(null); throw new Error(data.message + ' — modifiez à nouveau pour créer une nouvelle demande.'); }
      if (!res.ok) throw new Error(data.message || "Erreur d'enregistrement");
      setCurrentId(data.id); setOpenId(data.id);
    } catch (e: any) { setError(e.message || "Erreur d'enregistrement"); } finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    if (!(await appConfirm('Supprimer ce brouillon ?', { title: 'Supprimer', confirmLabel: 'Supprimer', danger: true }))) return;
    const r = await fetch(`${API}/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (r.ok) loadRows(); else appAlert((await r.json().catch(() => ({}))).message || 'Suppression impossible');
  };

  const sansMotivation = !motivation.trim();
  const source: Source = mode === 'traitement' ? 'traitement' : mode === 'history' ? scope : 'mine';
  const refresh = () => { if (mode === 'history') loadRows(); setVersion(v => v + 1); };

  const tabBtn = (m: 'new' | 'history' | 'traitement', label: string) => (
    <button onClick={() => setMode(m)} style={{ padding: '0.5rem 1.1rem', border: 'none', borderBottom: mode === m ? '3px solid #2563eb' : '3px solid transparent', background: 'none', fontWeight: 600, cursor: 'pointer', color: mode === m ? '#2563eb' : '#64748b' }}>{label}</button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ background: '#f8fafc', width: 'min(1280px, 100%)', height: '94vh', borderRadius: 20, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ width: 40, height: 40, background: '#dbeafe', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ArrowLeftRight size={22} color="#2563eb" /></div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#1e293b' }}>Virement de crédits</h2>
          {beta && <span style={{ background: '#f59e0b', color: '#1e293b', fontSize: '0.6rem', fontWeight: 800, padding: '2px 6px', borderRadius: 6, letterSpacing: '0.05em' }}>BETA</span>}
          <span style={{ flex: 1 }} />
          <img src={logoDsiHub} alt="DSI" style={{ height: 46, marginRight: 8 }} />
          <HelpButton onClick={() => setShowHelp(true)} title="Aide" />
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={20} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0' }}>
            {droits.canCreate && tabBtn('new', 'Nouvelle demande')}
            {droits.canCreate && tabBtn('history', 'Suivi des demandes')}
            {(droits.traitant || droits.canManage) && tabBtn('traitement', 'Traitement (finances)')}
          </div>

          {mode === 'traitement' && (
            <VirementTraitement traitant={droits.traitant} canManage={droits.canManage} version={version} onOpen={setOpenId} onAccessChanged={() => setAccessVersion(v => v + 1)} />
          )}

          {mode === 'history' && (
            <div style={{ ...s.card, overflowX: 'auto' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {([['mine', 'Mes demandes'], ['service', 'Mon service'], ['direction', 'Ma direction']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => { setRows([]); setScope(k); }}
                    style={{ border: '1px solid #cbd5e1', borderRadius: 16, padding: '4px 12px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', background: scope === k ? '#2563eb' : '#fff', color: scope === k ? '#fff' : '#475569' }}>{label}</button>
                ))}
              </div>
              {rowsLoading ? 'Chargement…' : rows.length === 0 ? <div style={{ color: '#94a3b8' }}>Aucune demande pour le moment.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={s.th}>N°</th><th style={s.th}>Date</th>{scope !== 'mine' && <th style={s.th}>Demandeur</th>}<th style={s.th}>Service</th><th style={s.th}>Section</th><th style={s.th}>Type</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Montant</th><th style={s.th}>Motivation</th><th style={s.th}>État</th><th style={s.th}></th>
                  </tr></thead>
                  <tbody>
                    {rows.map(r => {
                      const e = ETATS[r.etat];
                      return (
                        <tr key={r.id}>
                          <td style={s.td}>{r.id}</td><td style={s.td}>{fmtDate(r.date_demande || r.created_at)}</td>{scope !== 'mine' && <td style={s.td}>{r.created_by_name}</td>}<td style={s.td}>{r.service}</td>
                          <td style={s.td}>{r.section === 'I' ? 'Invest.' : 'Fonct.'} / {r.sens === 'D' ? 'Dép.' : 'Rec.'}</td>
                          <td style={s.td}>{r.compense ? 'Compensée' : 'Non compensée'}</td>
                          <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(Number(r.montant))}</td>
                          <td style={{ ...s.td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.motivation || ''}>{r.motivation}</td>
                          <td style={s.td}><span style={{ background: e.color, color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{e.label}</span>
                            {r.treatment_comment && <div style={{ color: '#64748b', fontSize: '0.72rem', maxWidth: 200 }}>{r.treatment_comment}</div>}</td>
                          <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                            {r.mine !== false && <button title="Dupliquer dans une nouvelle demande" onClick={() => duplicate(r)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#475569' }}><Copy size={16} /></button>}
                            <button title="Ouvrir" onClick={() => setOpenId(r.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#2563eb' }}><Eye size={17} /></button>
                            {r.mine !== false && !r.parapheur_id && !r.sent_at && <button title="Supprimer" onClick={() => remove(r.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={16} /></button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {mode === 'new' && (
            <>
              <div style={s.card}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.9rem' }}>
                  <div><label style={s.label}>Code collectivité</label>
                    <select style={s.input} value={collectivite} onChange={e => changeCollectivite(e.target.value)}>
                      {collectivites.map(c => <option key={c} value={c}>{collLabel(c)}</option>)}
                    </select></div>
                  <div><label style={s.label}>Budget</label>
                    <select style={s.input} value={budget} onChange={e => changeBudget(e.target.value)}>
                      {budgets.map(b => <option key={b} value={b}>{budgetLabel(b)}</option>)}
                    </select></div>
                  <div><label style={s.label}>Section</label>
                    <select style={s.input} value={section} onChange={e => changeScope(e.target.value as 'I' | 'F', sens)}><option value="I">Investissement</option><option value="F">Fonctionnement</option></select></div>
                  <div><label style={s.label}>Sens</label>
                    <select style={s.input} value={sens} onChange={e => changeScope(section, e.target.value as 'D' | 'R')}><option value="D">Dépenses</option><option value="R">Recettes</option></select></div>
                  <div><label style={s.label}>Direction</label><input style={{ ...s.input, background: '#f1f5f9' }} readOnly value={direction} /></div>
                  <div><label style={s.label}>Service</label><input style={{ ...s.input, background: '#f1f5f9' }} readOnly value={service} /></div>
                  <div><label style={s.label}>Personne contact</label><input style={{ ...s.input, background: '#f1f5f9' }} readOnly value={contact} /></div>
                  <div><label style={s.label}>Date de la demande</label><input type="date" style={s.input} value={date} onChange={e => setDate(e.target.value)} /></div>
                </div>
                <div style={{ margin: '0.9rem 0' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, cursor: 'pointer', color: '#1e293b' }}>
                    <input type="checkbox" checked={compense} onChange={e => setCompense(e.target.checked)} /> Demande compensée (majorations = minorations)
                  </label>
                </div>
                <div style={{ marginBottom: '0.9rem' }}><label style={s.label}>Activité / Projet / Opération impacté</label>
                  <input style={s.input} value={activite} onChange={e => setActivite(e.target.value)} /></div>
                <div><label style={s.label}>Motivation de la demande (raison) <span style={{ color: '#dc2626' }}>* obligatoire</span></label>
                  <textarea required style={{ ...s.input, minHeight: 80, fontFamily: 'inherit' }} value={motivation} onChange={e => setMotivation(e.target.value)} placeholder="Ex. : Régularisation de lignes d'exécution négatives" /></div>
              </div>

              {liveError && <div style={{ ...s.card, borderColor: '#dc2626', color: '#b91c1c', fontSize: '0.85rem' }}><AlertTriangle size={15} style={{ verticalAlign: 'text-bottom' }} /> Impossible de lire vos lignes dans SEDIT : {liveError}</div>}
              {noLine && (
                <div style={{ ...s.card, borderColor: '#f59e0b', background: '#fffbeb', color: '#78350f', fontSize: '0.88rem' }}>
                  <AlertTriangle size={15} style={{ verticalAlign: 'text-bottom' }} /> Aucune ligne budgétaire modifiable pour cette section / ce sens : vos droits SEDIT ne couvrent aucune ligne correspondante
                  (dépenses ou recettes, investissement ou fonctionnement). Essayez l'autre section ou l'autre sens, ou demandez les droits à la direction des finances.
                </div>
              )}
              {!loading && scoped.length > 0 && (
                <div style={s.card}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.9rem' }}>
                    {FILTRES.map(f => {
                      const options = uniq(scoped.filter(l => match(l, f.key)).map(l => l[f.field]));
                      return (
                        <div key={f.key}><label style={s.label}>{f.label}</label>
                          <select style={s.input} value={filtres[f.key]} onChange={e => setFiltres({ ...filtres, [f.key]: e.target.value })}>
                            <option value="">Tous</option>
                            {options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select></div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#64748b' }}>
                    {filtered.length} ligne(s) proposée(s) sur {scoped.length}. Les imputations déjà choisies restent sélectionnées.
                    {filtreActif && <button onClick={() => setFiltres(SANS_FILTRE)} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}>Effacer les filtres</button>}
                  </div>
                </div>
              )}
              {loading ? <div style={s.card}>Chargement de vos lignes d'exécution…</div> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                  <Picker scoped={filtered} taken={taken} totalMin={totalMin} totalMaj={totalMaj} title="Imputations à minorer (−)" sign="-" picked={minorer} setPicked={setMinorer} color="#dc2626" />
                  <Picker scoped={filtered} taken={taken} totalMin={totalMin} totalMaj={totalMaj} title="Imputations à majorer (+)" sign="+" picked={majorer} setPicked={setMajorer} color="#16a34a" />
                </div>
              )}

              <div style={{ ...s.card, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1.5rem' }}>
                <div>Total à minorer : <strong>{fmt(totalMin)} €</strong></div>
                <div>Total à majorer : <strong>{fmt(totalMaj)} €</strong></div>
                <div style={{ color: desequilibre ? '#dc2626' : '#16a34a' }}>Écart : <strong>{fmt(ecart)} €</strong></div>
                {desequilibre && <span style={{ color: '#dc2626', display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}><AlertTriangle size={15} /> Demande compensée : les totaux doivent être égaux.</span>}
                {interChapitre && <span style={{ color: '#d97706', display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}><AlertTriangle size={15} /> Virement entre chapitres : il peut suivre un circuit de validation différent.</span>}
                {hasNegative && <span style={{ color: '#d97706', display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}><AlertTriangle size={15} /> Une ligne minorée passerait en disponible négatif.</span>}
                {hasLines && sansMotivation && <span style={{ color: '#dc2626', display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}><AlertTriangle size={15} /> Renseignez la motivation de la demande.</span>}
                <div style={{ marginLeft: 'auto' }}>
                  <button style={{ ...s.btn, opacity: busy || !hasLines || desequilibre || sansMotivation ? 0.5 : 1 }} disabled={busy || !hasLines || desequilibre || sansMotivation} onClick={generate}>
                    <FileText size={16} /> {busy ? 'Génération…' : 'Prévisualiser'}
                  </button>
                </div>
                {error && <div style={{ width: '100%', color: '#dc2626' }}>{error}</div>}
              </div>
            </>
          )}
        </div>
      </div>
      {showHelp && <HelpModal page="/magapp/virement-credits" title="Aide — Virement de crédits" onClose={() => setShowHelp(false)} />}
      {openId != null && <Detail id={openId} sig={sig} source={source} espaceOuvert={espaceOuvert} onClose={() => { setOpenId(null); refresh(); }} onChanged={refresh} />}
    </div>
  );
}
