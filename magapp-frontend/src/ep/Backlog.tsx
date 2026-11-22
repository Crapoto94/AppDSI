import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Lightbulb, HelpCircle, Bug, Trash2, X, Loader2, CheckCircle2, ArrowLeft, Send, Inbox, Check, MessageSquare, Paperclip } from 'lucide-react';
import { useAuth } from './useAuth';
import { COLORS, EmptyState, btnDanger, btnGhost, btnPrimary, card, input, useConfirm } from './ui';

export type BacklogType = 'question' | 'amelioration' | 'bug';
export type BacklogStatut = 'demandee' | 'acceptee' | 'refusee' | 'realisee' | 'repondue';

export interface Piece { id: number; nom: string; mime?: string; taille?: number }
export interface Commentaire { id: number; auteur: string; est_admin: boolean; texte: string; created_at: string; pieces?: Piece[] }

export interface Demande {
  nb_commentaires?: number; mienne?: boolean; pieces?: Piece[];
  id: number; type: BacklogType; type_label: string; titre: string; description: string; page?: string;
  statut: BacklogStatut; motif?: string; demandeur: string; demandeur_email?: string; traite_par?: string; traite_le?: string; created_at: string;
}

export const TYPES: Record<BacklogType, { label: string; short: string; color: string; bg: string; icon: React.ReactNode; hint: string; placeholder: string }> = {
  question: { label: 'J’ai une question', short: 'Question', color: '#1d4ed8', bg: '#dbeafe', icon: <HelpCircle size={20} />, hint: 'Un point de la procédure ou de l’outil n’est pas clair.', placeholder: 'Ex. : que faire si l’agent·e est absent·e le jour du rendez-vous ?' },
  amelioration: { label: 'Je propose une amélioration', short: 'Amélioration', color: '#7c3aed', bg: '#ede9fe', icon: <Lightbulb size={20} />, hint: 'Une idée pour rendre l’outil plus simple ou plus complet.', placeholder: 'Ex. : pouvoir filtrer la liste par catégorie directement depuis les compteurs.' },
  bug: { label: 'Il y a un bug', short: 'Bug', color: '#b91c1c', bg: '#fee2e2', icon: <Bug size={20} />, hint: 'Quelque chose ne fonctionne pas comme prévu.', placeholder: 'Ex. : après « Clôturer l’entretien », la page reste sur l’étape précédente. Indiquez l’agent·e et ce que vous avez fait.' },
};

export const STATUTS: Record<BacklogStatut, { label: string; color: string; bg: string }> = {
  demandee: { label: 'En attente', color: '#92400e', bg: '#fef3c7' },
  acceptee: { label: 'Acceptée', color: '#1e40af', bg: '#dbeafe' },
  refusee: { label: 'Refusée', color: '#991b1b', bg: '#fee2e2' },
  realisee: { label: 'Réalisée', color: '#166534', bg: '#dcfce7' },
  repondue: { label: 'Répondue', color: '#166534', bg: '#dcfce7' },
};

const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.log,.docx,.xlsx,.pptx,.odt,.ods';
const taille = (n?: number) => (n ? (n >= 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`) : '');

/** Liste de pièces jointes : un clic ouvre le fichier dans un nouvel onglet (récupéré avec l'authentification). */
function Pieces({ list }: { list?: Piece[] }) {
  const { token } = useAuth();
  if (!list || !list.length) return null;
  const ouvrir = async (p: Piece) => {
    try {
      const r = await axios.get(`/api/entretiens/backlog/pieces/${p.id}`, { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data], { type: p.mime || r.data.type }));
      const w = window.open(url, '_blank');
      if (!w) { const a = document.createElement('a'); a.href = url; a.download = p.nom; a.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { /* pièce indisponible */ }
  };
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {list.map(p => (
        <button key={p.id} type="button" onClick={() => ouvrir(p)} style={{ ...btnGhost, padding: '3px 9px', fontSize: 11.5 }} title="Ouvrir la pièce jointe">
          <Paperclip size={12} /> {p.nom}{p.taille ? ` · ${taille(p.taille)}` : ''}
        </button>
      ))}
    </div>
  );
}

/** Sélecteur de pièces jointes (au plus `max`, 10 Mo chacune). */
function ChoixPieces({ files, setFiles, max }: { files: File[]; setFiles: (f: File[]) => void; max: number }) {
  return (
    <div>
      <label style={{ ...btnGhost, display: 'inline-flex', cursor: 'pointer', fontSize: 12 }}>
        <Paperclip size={13} /> Joindre un fichier
        <input type="file" multiple accept={ACCEPT} style={{ display: 'none' }} onChange={e => { setFiles([...files, ...Array.from(e.target.files || [])].slice(0, max)); e.target.value = ''; }} />
      </label>
      {files.map((f, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6, fontSize: 11.5, color: '#475569', background: '#f1f5f9', borderRadius: 999, padding: '2px 8px' }}>
          {f.name} · {taille(f.size)}
          <button type="button" aria-label="Retirer" onClick={() => setFiles(files.filter((_, k) => k !== i))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'inline-flex' }}><X size={12} /></button>
        </span>
      ))}
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{max} fichiers au plus, 10 Mo chacun : image, PDF, texte, Word, Excel, PowerPoint ou OpenDocument.</div>
    </div>
  );
}

const fmt = (d?: string) => (d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '');
const Pill = ({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) => (
  <span style={{ fontSize: 11, fontWeight: 800, color, background: bg, borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>{children}</span>
);

/** Fil de commentaires d'une demande : lecture et ajout par tous les utilisateur·rice·s du module. */
export function Fil({ id, onAdded }: { id: number; onAdded?: () => void }) {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [list, setList] = useState<Commentaire[] | null>(null);
  const [texte, setTexte] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try { const r = await axios.get(`/api/entretiens/backlog/${id}/comments`, { headers }); setList(r.data.commentaires || []); } catch { setList([]); }
  }, [id, headers]);
  useEffect(() => { load(); }, [load]);
  const send = async () => {
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('texte', texte); files.forEach(f => fd.append('files', f));
      await axios.post(`/api/entretiens/backlog/${id}/comments`, fd, { headers });
      setTexte(''); setFiles([]); await load(); onAdded?.();
    }
    catch (e: any) { setErr(e?.response?.data?.message || 'Envoi impossible.'); } finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 8, borderTop: `1px dashed ${COLORS.border}`, paddingTop: 8 }}>
      {!list ? <Loader2 size={14} className="spin" /> : list.map(c => (
        <div key={c.id} style={{ fontSize: 12.5, color: '#334155', marginBottom: 6, background: c.est_admin ? '#eef2ff' : '#f8fafc', borderRadius: 8, padding: '6px 9px' }}>
          <strong>{c.auteur}</strong>{c.est_admin && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: COLORS.primary }}>administrateur·rice</span>}
          <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>{fmt(c.created_at)}</span>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{c.texte}</div>
          <Pieces list={c.pieces} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        <textarea style={{ ...input, minHeight: 40, flex: 1, resize: 'vertical' }} value={texte} maxLength={2000} onChange={e => setTexte(e.target.value)} placeholder="Ajouter un commentaire…" />
        <button style={{ ...btnPrimary, opacity: texte.trim().length >= 2 || files.length ? 1 : .5 }} disabled={busy || (texte.trim().length < 2 && !files.length)} onClick={send}>{busy ? <Loader2 size={14} className="spin" /> : <Send size={14} />}</button>
      </div>
      <div style={{ marginTop: 6 }}><ChoixPieces files={files} setFiles={setFiles} max={3} /></div>
      {err && <div style={{ color: COLORS.danger, fontSize: 12, marginTop: 4 }}>{err}</div>}
    </div>
  );
}

/** Fenêtre de l'ampoule : question, proposition d'amélioration ou bug ; suivi de mes demandes. */
export function BacklogDialog({ onClose, page }: { onClose: () => void; page?: string }) {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [step, setStep] = useState<'choix' | 'form' | 'mes' | 'tous'>('choix');
  const [tous, setTous] = useState<Demande[] | null>(null);
  const [fT, setFT] = useState<'' | BacklogType>('');
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [type, setType] = useState<BacklogType>('question');
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState<number | null>(null);
  const [mine, setMine] = useState<Demande[] | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const loadMine = useCallback(async () => {
    try { const r = await axios.get('/api/entretiens/backlog/mine', { headers }); setMine(r.data.demandes || []); } catch { setMine([]); }
  }, [headers]);
  useEffect(() => { if (step === 'mes') loadMine(); }, [step, loadMine]);
  const loadTous = useCallback(async () => {
    try { const r = await axios.get('/api/entretiens/backlog/all', { headers }); setTous(r.data.demandes || []); } catch { setTous([]); }
  }, [headers]);
  useEffect(() => { if (step === 'tous') loadTous(); }, [step, loadTous]);

  const send = async () => {
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('type', type); fd.append('titre', titre); fd.append('description', description); fd.append('page', page || ''); files.forEach(f => fd.append('files', f));
      const r = await axios.post('/api/entretiens/backlog', fd, { headers });
      setSent(r.data?.demande?.id || 0); setTitre(''); setDescription(''); setFiles([]);
    } catch (e: any) { setErr(e?.response?.data?.message || 'Envoi impossible.'); } finally { setBusy(false); }
  };

  const t = TYPES[type];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 3050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(15,23,42,.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
          {step !== 'choix' && !sent && <button style={{ ...btnGhost, padding: '4px 8px' }} onClick={() => { setStep('choix'); setErr(''); }}><ArrowLeft size={14} /></button>}
          <Lightbulb size={19} color="#d97706" />
          <div style={{ fontWeight: 800, fontSize: 15.5, color: COLORS.text, flex: 1 }}>Une question, une idée, un bug ?</div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', width: 30, height: 30, borderRadius: 8, cursor: 'pointer' }} aria-label="Fermer"><X size={16} /></button>
        </div>

        {sent !== null ? (
          <div style={{ padding: '26px 22px', textAlign: 'center' }}>
            <CheckCircle2 size={44} color="#16a34a" />
            <div style={{ fontWeight: 800, fontSize: 16, margin: '8px 0 4px' }}>Merci, votre demande est enregistrée{sent ? ` (n° ${sent})` : ''}</div>
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>Les administrateur·rice·s du module la traitent ; vous serez prévenu·e par e-mail de la suite donnée.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button style={btnGhost} onClick={() => { setSent(null); setStep('mes'); }}>Voir mes demandes</button>
              <button style={btnPrimary} onClick={onClose}>Fermer</button>
            </div>
          </div>
        ) : step === 'choix' ? (
          <div style={{ padding: 18, display: 'grid', gap: 10 }}>
            {(Object.keys(TYPES) as BacklogType[]).map(k => (
              <button key={k} onClick={() => { setType(k); setStep('form'); }}
                style={{ display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', cursor: 'pointer', border: `2px solid ${COLORS.border}`, background: '#fff', borderRadius: 12, padding: '12px 14px' }}>
                <span style={{ width: 40, height: 40, borderRadius: 10, background: TYPES[k].bg, color: TYPES[k].color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{TYPES[k].icon}</span>
                <span>
                  <span style={{ display: 'block', fontWeight: 800, fontSize: 14, color: COLORS.text }}>{TYPES[k].label}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: '#64748b', marginTop: 2 }}>{TYPES[k].hint}</span>
                </span>
              </button>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...btnGhost, justifyContent: 'center', flex: 1 }} onClick={() => setStep('mes')}><Inbox size={14} /> Mes demandes</button>
              <button style={{ ...btnGhost, justifyContent: 'center', flex: 1 }} onClick={() => setStep('tous')}><MessageSquare size={14} /> Celles des autres</button>
            </div>
          </div>
        ) : step === 'form' ? (
          <div style={{ padding: 18, display: 'grid', gap: 10 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, color: t.color }}><span style={{ color: t.color }}>{t.icon}</span> {t.label}</div>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: '#475569', display: 'grid', gap: 4 }}>Titre
              <input style={input} value={titre} maxLength={200} onChange={e => setTitre(e.target.value)} placeholder="En une phrase" autoFocus />
            </label>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: '#475569', display: 'grid', gap: 4 }}>Description
              <textarea style={{ ...input, minHeight: 130, resize: 'vertical' }} value={description} maxLength={5000} onChange={e => setDescription(e.target.value)} placeholder={t.placeholder} />
            </label>
            <ChoixPieces files={files} setFiles={setFiles} max={5} />
            {err && <div style={{ color: COLORS.danger, fontSize: 12.5 }}>{err}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={btnGhost} onClick={onClose}>Annuler</button>
              <button style={{ ...btnPrimary, opacity: titre.trim().length >= 3 && description.trim().length >= 3 ? 1 : .5 }} disabled={busy || titre.trim().length < 3 || description.trim().length < 3} onClick={send}>
                {busy ? <Loader2 size={14} className="spin" /> : <Send size={14} />} Envoyer
              </button>
            </div>
          </div>
        ) : step === 'tous' ? (
          <div style={{ padding: 18 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {([['', 'Toutes'], ['question', 'Questions'], ['amelioration', 'Améliorations'], ['bug', 'Bugs']] as const).map(([k, l]) => (
                <button key={k} style={fT === k ? btnPrimary : btnGhost} onClick={() => setFT(k as any)}>{l}</button>
              ))}
            </div>
            {!tous ? <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}><Loader2 size={20} className="spin" /></div>
              : !tous.filter(d => !fT || d.type === fT).length ? <div style={{ textAlign: 'center', color: '#64748b', fontSize: 13, padding: 16 }}>Aucune demande pour le moment.</div>
                : <div style={{ display: 'grid', gap: 8 }}>
                  {tous.filter(d => !fT || d.type === fT).map(d => (
                    <div key={d.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => setOuverte(o => (o === d.id ? null : d.id))}>
                        <Pill bg={TYPES[d.type].bg} color={TYPES[d.type].color}>{TYPES[d.type].short}</Pill>
                        <strong style={{ fontSize: 13 }}>{d.titre}</strong>
                        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          {!!d.nb_commentaires && <span style={{ fontSize: 11.5, color: '#64748b', display: 'inline-flex', gap: 3, alignItems: 'center' }}><MessageSquare size={12} />{d.nb_commentaires}</span>}
                          <Pill bg={STATUTS[d.statut].bg} color={STATUTS[d.statut].color}>{STATUTS[d.statut].label}</Pill>
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>n° {d.id} · {d.mienne ? 'vous' : d.demandeur} · {fmt(d.created_at)}</div>
                      {ouverte === d.id && (
                        <>
                          <div style={{ marginTop: 6, fontSize: 12.5, color: '#334155', whiteSpace: 'pre-wrap' }}>{d.description}</div>
                          <Pieces list={d.pieces} />
                          {d.motif && <div style={{ marginTop: 6, fontSize: 12.5, color: '#334155', background: '#f8fafc', borderRadius: 8, padding: '6px 9px', whiteSpace: 'pre-wrap' }}>{d.statut === 'refusee' ? 'Motif : ' : 'Réponse : '}{d.motif}</div>}
                          <Fil id={d.id} onAdded={loadTous} />
                        </>
                      )}
                    </div>
                  ))}
                </div>}
          </div>
        ) : (
          <div style={{ padding: 18 }}>
            {!mine ? <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}><Loader2 size={20} className="spin" /></div>
              : !mine.length ? <div style={{ textAlign: 'center', color: '#64748b', fontSize: 13, padding: 16 }}>Vous n’avez encore déposé aucune demande.</div>
                : <div style={{ display: 'grid', gap: 8 }}>
                  {mine.map(d => (
                    <div key={d.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Pill bg={TYPES[d.type].bg} color={TYPES[d.type].color}>{TYPES[d.type].short}</Pill>
                        <strong style={{ fontSize: 13 }}>{d.titre}</strong>
                        <span style={{ marginLeft: 'auto' }}><Pill bg={STATUTS[d.statut].bg} color={STATUTS[d.statut].color}>{STATUTS[d.statut].label}</Pill></span>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>n° {d.id} · {fmt(d.created_at)}</div>
                      <Pieces list={d.pieces} />
                      {d.motif && <div style={{ marginTop: 6, fontSize: 12.5, color: '#334155', background: '#f8fafc', borderRadius: 8, padding: '6px 9px', whiteSpace: 'pre-wrap' }}>{d.statut === 'refusee' ? 'Motif : ' : 'Réponse : '}{d.motif}</div>}
                    </div>
                  ))}
                </div>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Backlog de traitement (administrateurs) : toutes les demandes, avec décision et réponse au demandeur. */
export function BacklogAdmin({ onChanged }: { onChanged?: (pending: number) => void }) {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [list, setList] = useState<Demande[] | null>(null);
  const [fStatut, setFStatut] = useState<'' | BacklogStatut>('demandee');
  const [fType, setFType] = useState<'' | BacklogType>('');
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reply, setReply] = useState<{ id: number; statut: BacklogStatut; text: string } | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const supprimer = async (d: Demande) => {
    if (!(await confirm(`Supprimer définitivement la demande n° ${d.id} « ${d.titre} » ?\n\nSes commentaires et ses pièces jointes sont supprimés aussi. Cette action est irréversible.`, { title: 'Supprimer la demande', confirmLabel: 'Supprimer', danger: true }))) return;
    setBusy(d.id); setMsg(null);
    try { await axios.delete(`/api/entretiens/backlog/${d.id}`, { headers }); setMsg({ ok: true, text: `Demande n° ${d.id} supprimée.` }); await load(); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Suppression impossible.' }); } finally { setBusy(null); }
  };

  const load = useCallback(async () => {
    try {
      const r = await axios.get('/api/entretiens/backlog', { headers });
      const rows: Demande[] = r.data.demandes || [];
      setList(rows); onChanged?.(rows.filter(x => x.statut === 'demandee').length);
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Chargement impossible.' }); setList([]); }
  }, [headers, onChanged]);
  useEffect(() => { load(); }, [load]);

  const decide = async (d: Demande, statut: BacklogStatut, motif = '') => {
    setBusy(d.id); setMsg(null);
    try {
      const r = await axios.post(`/api/entretiens/backlog/${d.id}/decide`, { statut, motif }, { headers });
      setMsg({ ok: true, text: `Demande n° ${d.id} : ${STATUTS[statut].label.toLowerCase()}${r.data?.mail === 'envoye' ? ' — demandeur·euse prévenu·e par e-mail.' : r.data?.mail === 'sans_adresse' ? ' (pas d’adresse e-mail pour la prévenir).' : r.data?.mail === 'echec' ? ' (e-mail non envoyé).' : '.'}` });
      setReply(null); await load();
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Traitement impossible.' }); } finally { setBusy(null); }
  };

  if (!list) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><Loader2 size={22} className="spin" /></div>;
  const count = (s: BacklogStatut) => list.filter(x => x.statut === s).length;
  const shown = list.filter(d => (!fStatut || d.statut === fStatut) && (!fType || d.type === fType));
  return (
    <div>
      {confirmDialog}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 15, fontWeight: 800, color: COLORS.text }}><Lightbulb size={18} color="#d97706" /> Backlog de traitement</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([['demandee', 'En attente'], ['acceptee', 'Acceptées'], ['realisee', 'Réalisées'], ['refusee', 'Refusées'], ['repondue', 'Répondues'], ['', 'Toutes']] as const).map(([k, l]) => (
            <button key={k} style={fStatut === k ? btnPrimary : btnGhost} onClick={() => setFStatut(k as any)}>{l} ({k ? count(k as BacklogStatut) : list.length})</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {([['', 'Tous les types'], ['question', 'Questions'], ['amelioration', 'Améliorations'], ['bug', 'Bugs']] as const).map(([k, l]) => (
          <button key={k} style={fType === k ? { ...btnPrimary, background: '#475569' } : btnGhost} onClick={() => setFType(k as any)}>{l}</button>
        ))}
      </div>
      {msg && <div style={{ ...card, padding: '9px 12px', marginBottom: 12, fontSize: 12.5, color: msg.ok ? COLORS.success : COLORS.danger }}>{msg.text}</div>}
      {!shown.length ? <EmptyState icon={<Inbox size={40} />} title="Aucune demande" text="Les questions, améliorations et bugs signalés avec l’ampoule apparaissent ici." /> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {shown.map(d => (
            <div key={d.id} style={{ ...card, padding: '12px 14px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Pill bg={TYPES[d.type].bg} color={TYPES[d.type].color}>{TYPES[d.type].short}</Pill>
                <strong style={{ fontSize: 13.5 }}>{d.titre}</strong>
                <span style={{ marginLeft: 'auto' }}><Pill bg={STATUTS[d.statut].bg} color={STATUTS[d.statut].color}>{STATUTS[d.statut].label}</Pill></span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>n° {d.id} · {d.demandeur}{d.demandeur_email ? ` (${d.demandeur_email})` : ''} · {fmt(d.created_at)}</div>
              <div style={{ marginTop: 8, padding: '8px 10px', background: '#f8fafc', border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap' }}>{d.description}</div>
              <Pieces list={d.pieces} />
              {d.motif && <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}><strong>{d.statut === 'refusee' ? 'Motif' : 'Réponse'} :</strong> {d.motif}</div>}
              {d.traite_par && <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>Traitée par {d.traite_par} le {fmt(d.traite_le)}</div>}
              <details style={{ marginTop: 6 }}><summary style={{ cursor: 'pointer', fontSize: 12, color: COLORS.primary, fontWeight: 700 }}>Commentaires</summary><Fil id={d.id} /></details>
              {reply && reply.id === d.id ? (
                <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                  <textarea style={{ ...input, minHeight: 70 }} autoFocus value={reply.text} onChange={e => setReply({ ...reply, text: e.target.value })}
                    placeholder={reply.statut === 'refusee' ? 'Motif du refus (obligatoire)' : reply.statut === 'repondue' ? 'Votre réponse (obligatoire)' : 'Précision pour le·la demandeur·euse (facultatif)'} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={btnPrimary} disabled={busy === d.id} onClick={() => decide(d, reply.statut, reply.text)}>{busy === d.id ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Valider</button>
                    <button style={btnGhost} onClick={() => setReply(null)}>Annuler</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {d.type === 'question'
                    ? <button style={{ ...btnPrimary, background: COLORS.success }} onClick={() => setReply({ id: d.id, statut: 'repondue', text: '' })}><MessageSquare size={14} /> Répondre</button>
                    : <>
                      {d.statut !== 'acceptee' && <button style={{ ...btnPrimary, background: '#2563eb' }} onClick={() => setReply({ id: d.id, statut: 'acceptee', text: '' })}><Check size={14} /> Accepter</button>}
                      {d.statut !== 'realisee' && <button style={{ ...btnPrimary, background: COLORS.success }} onClick={() => setReply({ id: d.id, statut: 'realisee', text: '' })}><CheckCircle2 size={14} /> Marquer réalisée</button>}
                    </>}
                  {d.statut !== 'refusee' && <button style={btnGhost} onClick={() => setReply({ id: d.id, statut: 'refusee', text: '' })}><X size={14} /> Refuser</button>}
                  {d.statut !== 'demandee' && <button style={btnGhost} onClick={() => decide(d, 'demandee')}>Remettre en attente</button>}
                  <button style={{ ...btnDanger, marginLeft: 'auto' }} disabled={busy === d.id} onClick={() => supprimer(d)} title="Supprimer cette demande (fausse demande, doublon…)"><Trash2 size={13} /> Supprimer</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
