import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Lightbulb, ThumbsUp, Send, VenetianMask, Trash2, MessageSquareReply, Search, Sparkles, Check } from 'lucide-react';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';

interface Categorie { key: string; label: string; emoji: string; color: string; description: string }
interface Idee {
  id: number; categorie: string; titre: string; contenu: string; anonyme: boolean; auteur_nom: string | null; statut: string;
  reponse: string | null; reponse_par: string | null; reponse_at: string | null; created_at: string; votes: number; vote_moi: boolean; mienne: boolean;
}

const STATUTS: Record<string, { label: string; bg: string; color: string }> = {
  nouvelle: { label: 'Nouvelle', bg: '#e0e7ff', color: '#3730a3' },
  en_etude: { label: 'En étude', bg: '#fef3c7', color: '#92400e' },
  retenue: { label: 'Retenue', bg: '#dcfce7', color: '#166534' },
  realisee: { label: 'Réalisée', bg: '#d1fae5', color: '#065f46' },
  refusee: { label: 'Non retenue', bg: '#f1f5f9', color: '#475569' },
};
const FALLBACK_CATS: Categorie[] = [
  { key: 'cadre_vie', label: 'Cadre de vie', emoji: '🌳', color: '#16a34a', description: '' },
  { key: 'efficacite', label: 'Efficacité', emoji: '⚡', color: '#f59e0b', description: '' },
  { key: 'autre', label: 'Autre', emoji: '💡', color: '#64748b', description: '' },
];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const tint = (hex: string, alpha: string) => `${hex}${alpha}`; // #rrggbb + alpha hexa (ex. '1a')

export default function BoiteIdees() {
  const { token, user } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const isAdmin = ['admin', 'superadmin'].includes(user?.role || '');

  const [cats, setCats] = useState<Categorie[]>(FALLBACK_CATS);
  const [idees, setIdees] = useState<Idee[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtreCat, setFiltreCat] = useState('');
  const [filtreStatut, setFiltreStatut] = useState('');
  const [tri, setTri] = useState<'recent' | 'votes'>('recent');
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ categorie: '', titre: '', contenu: '', anonyme: false });
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reponseDraft, setReponseDraft] = useState<Record<number, string>>({});

  const catOf = useCallback((k: string) => cats.find(c => c.key === k) || { key: k, label: k, emoji: '💡', color: '#64748b', description: '' }, [cats]);

  useEffect(() => {
    axios.get('/api/boite-idees/categories', { headers }).then(r => { if (Array.isArray(r.data?.categories)) setCats(r.data.categories); }).catch(() => { /* catégories par défaut */ });
  }, [headers]);

  const load = useCallback(async () => {
    try {
      const r = await axios.get<Idee[]>('/api/boite-idees', { headers, params: { categorie: filtreCat || undefined, statut: filtreStatut || undefined, tri, q: q || undefined, mine: mine ? '1' : undefined } });
      setIdees(r.data);
    } catch { setIdees([]); } finally { setLoading(false); }
  }, [headers, filtreCat, filtreStatut, tri, q, mine]);
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of idees) m[i.categorie] = (m[i.categorie] || 0) + 1;
    return m;
  }, [idees]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!form.categorie) { setMessage({ ok: false, text: 'Choisissez d\'abord une catégorie.' }); return; }
    setSending(true);
    try {
      const r = await axios.post('/api/boite-idees', form, { headers });
      setMessage({ ok: true, text: r.data?.message || 'Merci pour votre idée !' });
      setForm({ categorie: '', titre: '', contenu: '', anonyme: false });
      await load();
    } catch (err: any) {
      setMessage({ ok: false, text: err.response?.data?.message || 'Erreur lors du dépôt' });
    } finally { setSending(false); }
  };

  const vote = async (i: Idee) => {
    try {
      const r = await axios.post(`/api/boite-idees/${i.id}/vote`, {}, { headers });
      setIdees(list => list.map(x => (x.id === i.id ? { ...x, votes: r.data.votes, vote_moi: r.data.vote_moi } : x)));
    } catch { /* silencieux */ }
  };
  const moderate = async (i: Idee, body: { statut?: string; reponse?: string }) => {
    try { await axios.patch(`/api/boite-idees/${i.id}`, body, { headers }); await load(); }
    catch (err: any) { alert(err.response?.data?.message || 'Erreur'); }
  };
  const remove = async (i: Idee) => {
    if (!window.confirm(`Supprimer l'idée « ${i.titre} » ?`)) return;
    try { await axios.delete(`/api/boite-idees/${i.id}`, { headers }); await load(); }
    catch (err: any) { alert(err.response?.data?.message || 'Erreur'); }
  };

  const chosen = form.categorie ? catOf(form.categorie) : null;
  const input: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #fefce8 0%, #f8fafc 280px)' }}>
      <Header />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 20px 60px' }}>

        {/* Bandeau */}
        <div style={{ borderRadius: 24, padding: '32px 36px', background: 'linear-gradient(120deg, #f59e0b 0%, #ec4899 45%, #8b5cf6 100%)', color: '#fff', position: 'relative', overflow: 'hidden', marginBottom: 24, boxShadow: '0 12px 30px rgba(236,72,153,.25)' }}>
          <div style={{ position: 'absolute', right: -30, top: -40, fontSize: 200, opacity: .15, transform: 'rotate(15deg)' }}>💡</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
            <div style={{ width: 54, height: 54, borderRadius: 16, background: 'rgba(255,255,255,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Lightbulb size={30} /></div>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800 }}>Boîte à idées</h1>
          </div>
          <p style={{ margin: 0, fontSize: 16, maxWidth: 680, lineHeight: 1.5, opacity: .95 }}>
            Une suggestion pour améliorer le quotidien ? Déposez-la ici, avec votre nom ou <b>en toute anonymité</b>. Les idées sont visibles de tous, chacun peut soutenir celles qu'il trouve bonnes.
          </p>
        </div>

        {/* Catégories */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 12, marginBottom: 26 }}>
          {cats.map(c => {
            const active = filtreCat === c.key;
            return (
              <button key={c.key} type="button" onClick={() => setFiltreCat(active ? '' : c.key)} title={c.description}
                style={{ textAlign: 'left', border: `2px solid ${active ? c.color : tint(c.color, '33')}`, background: active ? c.color : tint(c.color, '14'), color: active ? '#fff' : '#1e293b',
                  borderRadius: 16, padding: '14px 14px 12px', cursor: 'pointer', transition: 'all .15s', boxShadow: active ? `0 6px 16px ${tint(c.color, '55')}` : 'none' }}>
                <div style={{ fontSize: 28, lineHeight: 1 }}>{c.emoji}</div>
                <div style={{ fontWeight: 700, fontSize: 14, marginTop: 6 }}>{c.label}</div>
                <div style={{ fontSize: 12, opacity: .8 }}>{counts[c.key] || 0} idée{(counts[c.key] || 0) > 1 ? 's' : ''}</div>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Formulaire */}
          <form onSubmit={submit} style={{ flex: '0 0 380px', maxWidth: '100%', background: '#fff', borderRadius: 20, padding: 22, boxShadow: '0 4px 18px rgba(15,23,42,.08)', border: `2px solid ${chosen ? tint(chosen.color, '66') : '#e2e8f0'}`, position: 'sticky', top: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>
              <Sparkles size={20} color="#f59e0b" /> Déposer une idée
            </div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Catégorie *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0 14px' }}>
              {cats.map(c => {
                const on = form.categorie === c.key;
                return (
                  <button key={c.key} type="button" onClick={() => setForm(f => ({ ...f, categorie: c.key }))}
                    style={{ padding: '5px 11px', borderRadius: 999, border: `1.5px solid ${c.color}`, background: on ? c.color : '#fff', color: on ? '#fff' : c.color, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {c.emoji} {c.label}
                  </button>
                );
              })}
            </div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Titre *</label>
            <input style={{ ...input, margin: '6px 0 14px' }} value={form.titre} maxLength={150} placeholder="En quelques mots…" onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} required />
            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Votre idée *</label>
            <textarea style={{ ...input, margin: '6px 0 14px', minHeight: 130, resize: 'vertical' }} value={form.contenu} maxLength={4000} placeholder="Décrivez votre idée : le constat, ce que vous proposez, ce que ça changerait…" onChange={e => setForm(f => ({ ...f, contenu: e.target.value }))} required />

            <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', padding: '12px 14px', borderRadius: 14, background: form.anonyme ? '#1e293b' : '#f8fafc', color: form.anonyme ? '#fff' : '#334155', border: `1.5px solid ${form.anonyme ? '#1e293b' : '#e2e8f0'}`, marginBottom: 14, transition: 'all .15s' }}>
              <input type="checkbox" checked={form.anonyme} onChange={e => setForm(f => ({ ...f, anonyme: e.target.checked }))} style={{ width: 18, height: 18, marginTop: 2, cursor: 'pointer' }} />
              <span style={{ fontSize: 13, lineHeight: 1.45 }}>
                <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}><VenetianMask size={16} /> Rester anonyme</b>
                {form.anonyme
                  ? 'Ni votre nom ni votre identifiant ne sont enregistrés : personne ne pourra savoir que cette idée vient de vous (vous ne la retrouverez pas non plus dans « Mes idées »).'
                  : 'Votre nom sera affiché avec l\'idée. Cochez cette case pour la déposer sans nom.'}
              </span>
            </label>

            {message && (
              <div style={{ padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 12, background: message.ok ? '#dcfce7' : '#fee2e2', color: message.ok ? '#166534' : '#991b1b', display: 'flex', gap: 8, alignItems: 'center' }}>
                {message.ok && <Check size={16} />} {message.text}
              </div>
            )}
            <button type="submit" disabled={sending}
              style={{ width: '100%', padding: '13px 16px', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: `linear-gradient(120deg, ${chosen?.color || '#f59e0b'}, #ec4899)`, boxShadow: '0 6px 16px rgba(236,72,153,.3)' }}>
              <Send size={17} /> {sending ? 'Envoi…' : form.anonyme ? 'Déposer anonymement' : 'Déposer mon idée'}
            </button>
          </form>

          {/* Fil des idées */}
          <div style={{ flex: '1 1 480px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ position: 'relative', flex: '1 1 200px' }}>
                <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 12, top: 12 }} />
                <input style={{ ...input, paddingLeft: 34, background: '#fff' }} placeholder="Rechercher une idée…" value={q} onChange={e => setQ(e.target.value)} />
              </div>
              <select style={{ ...input, width: 'auto', background: '#fff' }} value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}>
                <option value="">Tous les statuts</option>
                {Object.entries(STATUTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
              </select>
              <select style={{ ...input, width: 'auto', background: '#fff' }} value={tri} onChange={e => setTri(e.target.value as 'recent' | 'votes')}>
                <option value="recent">Plus récentes</option>
                <option value="votes">Plus soutenues</option>
              </select>
              <button type="button" onClick={() => setMine(m => !m)} style={{ padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${mine ? '#8b5cf6' : '#e2e8f0'}`, background: mine ? '#8b5cf6' : '#fff', color: mine ? '#fff' : '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Mes idées</button>
            </div>

            {loading && <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Chargement…</div>}
            {!loading && idees.length === 0 && (
              <div style={{ textAlign: 'center', padding: '50px 20px', background: '#fff', borderRadius: 20, color: '#64748b' }}>
                <div style={{ fontSize: 54 }}>🌱</div>
                <div style={{ fontWeight: 700, fontSize: 17, color: '#1e293b' }}>Aucune idée pour l'instant</div>
                <div style={{ fontSize: 14 }}>Soyez le premier à déposer une idée !</div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {idees.map(i => {
                const c = catOf(i.categorie);
                const st = STATUTS[i.statut] || STATUTS.nouvelle;
                return (
                  <div key={i.id} style={{ background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 3px 14px rgba(15,23,42,.07)', display: 'flex', border: `1px solid ${tint(c.color, '33')}` }}>
                    <div style={{ width: 7, background: c.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, padding: '16px 18px', minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ background: tint(c.color, '1f'), color: c.color, borderRadius: 999, padding: '3px 11px', fontSize: 12, fontWeight: 800 }}>{c.emoji} {c.label}</span>
                        <span style={{ background: st.bg, color: st.color, borderRadius: 999, padding: '3px 11px', fontSize: 12, fontWeight: 700 }}>{st.label}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>{fmtDate(i.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>{i.titre}</div>
                      <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{i.contenu}</div>

                      {i.reponse && (
                        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 12, background: '#f0f9ff', border: '1px solid #bae6fd', fontSize: 13, color: '#075985' }}>
                          <b>Réponse{i.reponse_par ? ` de ${i.reponse_par}` : ''} :</b> {i.reponse}
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => vote(i)} title={i.vote_moi ? 'Retirer mon soutien' : 'Soutenir cette idée'}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontWeight: 800, fontSize: 13,
                            border: `1.5px solid ${i.vote_moi ? c.color : '#e2e8f0'}`, background: i.vote_moi ? c.color : '#fff', color: i.vote_moi ? '#fff' : '#475569' }}>
                          <ThumbsUp size={15} /> {i.votes}
                        </button>
                        <span style={{ fontSize: 13, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          {i.anonyme ? <><VenetianMask size={14} /> Anonyme</> : <>par <b style={{ color: '#334155' }}>{i.auteur_nom}</b></>}
                        </span>
                        {(isAdmin || i.mienne) && (
                          <button type="button" onClick={() => remove(i)} title="Supprimer" style={{ marginLeft: 'auto', border: 'none', background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', display: 'inline-flex' }}><Trash2 size={15} /></button>
                        )}
                      </div>

                      {isAdmin && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #e2e8f0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          <select value={i.statut} onChange={e => moderate(i, { statut: e.target.value })} style={{ ...input, width: 'auto', padding: '7px 10px', fontSize: 13 }}>
                            {Object.entries(STATUTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                          </select>
                          <textarea style={{ ...input, flex: '1 1 220px', minHeight: 40, fontSize: 13 }} placeholder="Réponse de la DSI (visible de tous)…"
                            value={reponseDraft[i.id] ?? i.reponse ?? ''} onChange={e => setReponseDraft(d => ({ ...d, [i.id]: e.target.value }))} />
                          <button type="button" onClick={() => moderate(i, { reponse: reponseDraft[i.id] ?? i.reponse ?? '' })}
                            style={{ padding: '8px 12px', border: 'none', borderRadius: 10, background: '#0ea5e9', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <MessageSquareReply size={15} /> Répondre
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
