import React, { useState, useEffect, useMemo } from 'react';
import { Mail, Search, ExternalLink, Users, Plus, Pencil, Trash2, X, AlertTriangle, RefreshCw } from 'lucide-react';
import Header from '../components/Header';
import AgentPresenceBadge from '../components/AgentPresenceBadge';
import { classify, type PresenceInfo, type PresenceStatus } from '../utils/agentPresence';
import { useAuth } from '../contexts/AuthContext';
import { useADSearch } from '../utils/useADSearch';

interface Membre { displayName: string; email: string; }

interface SharedMailbox {
  id: number;
  nom: string;
  email: string | null;
  type: string | null;
  usage_type: string | null;
  responsable_display: string | null;
  responsable_email: string | null;
  provisoire: boolean;
  date_fin: string | null;
  membres: Membre[];
  justification: string | null;
  ticket_id: number | null;
  ticket_title: string | null;
  requested_by_username: string;
  requested_by_name: string;
  arbitrage_decision: 'positif' | 'negatif' | null;
  arbitrage_comment: string | null;
  date_creation: string | null;
  // Message du dernier échec de résolution AD (objet absent de l'AD on-prem…),
  // NULL si le dernier essai a réussi ou si aucun essai n'a encore eu lieu —
  // seul moyen de distinguer un "0 membre" non résolu d'un "0 membre" confirmé.
  ad_sync_error: string | null;
  created_at: string;
}

const fieldStyles: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 10px', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const labelStyles: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 };

// Valeurs canoniques des listes déroulantes Type / Usage. Les fiches déjà en
// base peuvent porter une variante d'orthographe/casse saisie à la main avant
// que ces champs ne soient devenus des listes (ex. "Boite Partagée") :
// normalizeToOption() les fait correspondre à l'option canonique sans toucher
// aux données existantes, et le <select> garde quand même toute valeur
// inconnue en option supplémentaire plutôt que de la faire disparaître.
const TYPE_OPTIONS = ['Boîte partagée', 'Liste de diffusion', 'Liste sécurité'];
const USAGE_OPTIONS = ['Interne', 'Externe'];
function normalizeToOption(value: string, options: string[]): string {
  if (!value) return '';
  const match = options.find((o) => o.toLowerCase() === value.toLowerCase());
  return match || value;
}

const TYPE_BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  'Boîte partagée': { bg: '#ecfdf5', fg: '#047857' },
  'Liste de diffusion': { bg: '#eef2ff', fg: '#4338ca' },
  'Liste sécurité': { bg: '#fff7ed', fg: '#c2410c' },
};
function TypeBadge({ type, usageType }: { type: string | null; usageType: string | null }) {
  if (!type && !usageType) return <span style={{ color: '#cbd5e1' }}>—</span>;
  const colors = (type && TYPE_BADGE_COLORS[type]) || { bg: '#f1f5f9', fg: '#475569' };
  return (
    <div>
      {type && (
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
          background: colors.bg, color: colors.fg,
        }}>
          {type}
        </span>
      )}
      {usageType && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{usageType}</div>}
    </div>
  );
}

function ArbitrageBadge({ decision }: { decision: 'positif' | 'negatif' | null }) {
  if (decision === 'positif') {
    return <span style={{ padding: '3px 10px', borderRadius: 999, background: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>✅ Favorable</span>;
  }
  if (decision === 'negatif') {
    return <span style={{ padding: '3px 10px', borderRadius: 999, background: '#fee2e2', color: '#991b1b', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>❌ Défavorable</span>;
  }
  return <span style={{ padding: '3px 10px', borderRadius: 999, background: '#f1f5f9', color: '#64748b', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>⏳ En attente</span>;
}

/** Recherche d'agent (AD) — même mécanisme que le reste du Hub (useADSearch). */
function AgentPicker({ value, onChange, token, placeholder }: { value: Membre | null; onChange: (v: Membre | null) => void; token: string | null; placeholder?: string }) {
  const ad = useADSearch(token);
  const [prevName, setPrevName] = useState(value?.displayName || '');
  if ((value?.displayName || '') !== prevName) {
    setPrevName(value?.displayName || '');
    ad.setQuery(value?.displayName || '');
  }
  return (
    <div style={{ position: 'relative' }}>
      <input
        style={fieldStyles}
        placeholder={placeholder || 'Rechercher un agent…'}
        value={ad.query}
        onChange={(e) => { onChange(null); ad.setQuery(e.target.value); }}
      />
      {ad.results.length > 0 && ad.query !== (value?.displayName || '') && (
        <div style={{ position: 'absolute', zIndex: 30, top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
          {ad.results.map((u) => (
            <div key={u.username} onMouseDown={() => { onChange({ displayName: u.displayName, email: u.email }); ad.setQuery(u.displayName); ad.clearResults(); }}
              style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontWeight: 600, color: '#1e293b' }}>{u.displayName}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.email}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MultiAgentPicker({ value, onChange, token }: { value: Membre[]; onChange: (v: Membre[]) => void; token: string | null }) {
  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {value.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{m.displayName}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{m.email}</div>
              </div>
              <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          ))}
        </div>
      )}
      <AgentPicker
        value={null}
        token={token}
        placeholder="Ajouter un agent…"
        onChange={(v) => { if (v && !value.some((m) => m.email === v.email)) onChange([...value, v]); }}
      />
    </div>
  );
}

const emptyForm = {
  nom: '', email: '', type: '', usage_type: '', provisoire: false, date_fin: '', date_creation: '',
  responsable: null as Membre | null, membres: [] as Membre[], justification: '',
  arbitrage_decision: '' as '' | 'positif' | 'negatif', arbitrage_comment: '', ad_sync_error: '',
};

function MailboxModal({ initial, token, onClose, onSaved }: { initial: SharedMailbox | null; token: string | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(() => initial ? {
    nom: initial.nom, email: initial.email || '',
    type: normalizeToOption(initial.type || '', TYPE_OPTIONS), usage_type: normalizeToOption(initial.usage_type || '', USAGE_OPTIONS),
    provisoire: initial.provisoire, date_fin: (initial.date_fin || '').slice(0, 10), date_creation: (initial.date_creation || '').slice(0, 10),
    responsable: initial.responsable_display ? { displayName: initial.responsable_display, email: initial.responsable_email || '' } : null,
    membres: initial.membres || [], justification: initial.justification || '',
    arbitrage_decision: (initial.arbitrage_decision || '') as '' | 'positif' | 'negatif',
    arbitrage_comment: initial.arbitrage_comment || '',
    ad_sync_error: initial.ad_sync_error || '',
  } : emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [syncingAd, setSyncingAd] = useState(false);
  const [syncAdMsg, setSyncAdMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Relit dans l'annuaire AD les membres réels de la boîte/liste (délégués
  // Accès total pour une boîte partagée, membres de groupe pour une liste de
  // diffusion — cf. GET /api/mailboxes/ad-members) et remplace la liste
  // manuelle. Recale aussi le Type si l'AD contredit la fiche.
  const syncFromAd = async () => {
    const email = form.email.trim();
    if (!email) { setSyncAdMsg({ ok: false, text: "Renseignez d'abord l'adresse mail précise de la boîte/liste." }); return; }
    setSyncingAd(true);
    setSyncAdMsg(null);
    try {
      const res = await fetch(`/api/mailboxes/ad-members?email=${encodeURIComponent(email)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Introuvable dans l'AD");
      const members: Membre[] = (data.members || []).map((m: Membre) => ({ displayName: m.displayName, email: m.email }));
      setForm((f) => ({
        ...f,
        membres: members,
        ad_sync_error: '', // succès : efface un échec précédent éventuel
        // L'AD distingue boîte partagée / groupe mail-enabled, mais pas liste
        // de diffusion vs liste de sécurité (même attribut `member` des deux
        // côtés) — on ne recale donc PAS un Type "Liste sécurité" déjà choisi.
        type: data.type === 'liste' ? (f.type === 'Liste sécurité' ? f.type : 'Liste de diffusion')
          : data.type === 'boite_partagee' ? 'Boîte partagée' : f.type,
      }));
      setSyncAdMsg({ ok: true, text: `${members.length} membre${members.length > 1 ? 's' : ''} récupéré${members.length > 1 ? 's' : ''} depuis l'AD (${data.recipientName || email}).` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur lors de la lecture AD';
      // Échec : on ne touche PAS à la liste de membres existante (pas de perte
      // de données), mais on mémorise l'échec pour l'affichage en liste — cf.
      // ad_sync_error, distingue "0 non résolu" de "0 confirmé".
      setForm((f) => ({ ...f, ad_sync_error: msg }));
      setSyncAdMsg({ ok: false, text: msg });
    } finally {
      setSyncingAd(false);
    }
  };

  const save = async () => {
    if (!form.nom.trim()) { setError('Le nom de la boîte est requis'); return; }
    setSaving(true);
    setError('');
    const payload = {
      nom: form.nom.trim(), email: form.email.trim() || null, type: form.type || null, usage_type: form.usage_type || null,
      provisoire: form.provisoire, date_fin: form.provisoire ? (form.date_fin || null) : null,
      responsable_display: form.responsable?.displayName || null, responsable_email: form.responsable?.email || null,
      membres: form.membres, justification: form.justification || null,
      arbitrage_decision: form.arbitrage_decision || null, arbitrage_comment: form.arbitrage_comment || null,
      date_creation: form.date_creation || null, ad_sync_error: form.ad_sync_error || null,
    };
    try {
      const res = await fetch(initial ? `/api/mailboxes/${initial.id}` : '/api/mailboxes', {
        method: initial ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erreur');
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{initial ? 'Modifier la boîte' : 'Nouvelle boîte mail partagée'}</h3>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: '#64748b' }}><X size={16} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>}
          <div>
            <label style={labelStyles}>Nom de la boîte *</label>
            <input style={fieldStyles} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Ex. Accueil DSI" />
          </div>
          <div>
            <label style={labelStyles}>Adresse mail précise</label>
            <input style={fieldStyles} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="boite@ivry94.fr" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyles}>Type</label>
              <select style={fieldStyles} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="">—</option>
                {(form.type && !TYPE_OPTIONS.includes(form.type) ? [form.type, ...TYPE_OPTIONS] : TYPE_OPTIONS).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyles}>Usage</label>
              <select style={fieldStyles} value={form.usage_type} onChange={(e) => setForm({ ...form, usage_type: e.target.value })}>
                <option value="">—</option>
                {(form.usage_type && !USAGE_OPTIONS.includes(form.usage_type) ? [form.usage_type, ...USAGE_OPTIONS] : USAGE_OPTIONS).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyles}>Date de création</label>
            <input type="date" style={{ ...fieldStyles, width: 'auto' }} value={form.date_creation} onChange={(e) => setForm({ ...form, date_creation: e.target.value })} />
          </div>
          <div>
            <label style={labelStyles}>Responsable</label>
            <AgentPicker value={form.responsable} token={token} onChange={(v) => setForm({ ...form, responsable: v })} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <label style={{ ...labelStyles, marginBottom: 0 }}>Agents ayant accès</label>
              <button type="button" onClick={syncFromAd} disabled={syncingAd}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', borderRadius: 6, cursor: syncingAd ? 'default' : 'pointer', fontSize: 11, fontWeight: 700, opacity: syncingAd ? 0.6 : 1 }}
                title="Relire la liste réelle des membres depuis l'annuaire AD (remplace la liste ci-dessous)">
                <RefreshCw size={11} className={syncingAd ? 'animate-spin' : ''} /> {syncingAd ? 'Recherche…' : "Récupérer depuis l'AD"}
              </button>
            </div>
            {syncAdMsg && (
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: syncAdMsg.ok ? '#15803d' : '#dc2626' }}>
                {syncAdMsg.ok ? '✅' : '❌'} {syncAdMsg.text}
              </div>
            )}
            <MultiAgentPicker value={form.membres} token={token} onChange={(v) => setForm({ ...form, membres: v })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.provisoire} onChange={(e) => setForm({ ...form, provisoire: e.target.checked })} />
              Boîte provisoire
            </label>
            {form.provisoire && (
              <input type="date" style={{ ...fieldStyles, width: 'auto' }} value={form.date_fin} onChange={(e) => setForm({ ...form, date_fin: e.target.value })} />
            )}
          </div>
          <div>
            <label style={labelStyles}>Justification</label>
            <textarea style={{ ...fieldStyles, resize: 'vertical' }} rows={2} value={form.justification} onChange={(e) => setForm({ ...form, justification: e.target.value })} />
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
            <label style={labelStyles}>Arbitrage</label>
            <select style={fieldStyles} value={form.arbitrage_decision} onChange={(e) => setForm({ ...form, arbitrage_decision: e.target.value as '' | 'positif' | 'negatif' })}>
              <option value="">⏳ En attente</option>
              <option value="positif">✅ Favorable</option>
              <option value="negatif">❌ Défavorable</option>
            </select>
            {form.arbitrage_decision && (
              <input style={{ ...fieldStyles, marginTop: 8 }} placeholder="Commentaire (facultatif)" value={form.arbitrage_comment} onChange={(e) => setForm({ ...form, arbitrage_comment: e.target.value })} />
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid #e2e8f0' }}>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: '10px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Enregistrement…' : initial ? 'Enregistrer' : 'Créer la boîte'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 16px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
            Annuler
          </button>
        </div>
      </div>
      <style>{`
        .animate-spin { animation: boites-spin 1s linear infinite; }
        @keyframes boites-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

/** true si l'agent (par email) est marqué "parti" côté RH Studio. */
function useDepartedEmails(emails: string[]): Set<string> {
  const [departed, setDeparted] = useState<Set<string>>(new Set());
  const token = localStorage.getItem('token');
  const key = emails.join(',');

  useEffect(() => {
    if (emails.length === 0) return;
    let cancelled = false;
    (async () => {
      const found = new Set<string>();
      for (const email of emails) {
        try {
          const res = await fetch(`/api/infra/agents/presence?email=${encodeURIComponent(email)}`, { headers: { Authorization: `Bearer ${token}` } });
          const data = await res.json();
          const agent = data?.agent;
          const status = `${agent?.status || ''} ${agent?.statusLabel || ''}`.toLowerCase();
          if (data?.found && agent && !agent.present && (status.includes('parti') || status.includes('depart') || status.includes('sorti'))) {
            found.add(email.toLowerCase());
          }
        } catch { /* ignore */ }
      }
      if (!cancelled) setDeparted(found);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return departed;
}

/**
 * Statut RH Studio (présent / parti / pas encore arrivé / inconnu) de tous
 * les membres de toutes les boîtes/listes, en une poignée d'appels groupés
 * (POST /api/infra/agents/presence/batch, jusqu'à 500 agents par appel —
 * même classification que AgentPresenceBadge, cf. classify()) plutôt qu'une
 * requête par membre : ~680 emails uniques pour ~500 boîtes, une recherche
 * individuelle par ligne du tableau serait beaucoup trop coûteuse.
 */
function useMembersPresenceStatus(boxes: SharedMailbox[]): Map<string, PresenceStatus> {
  const [statusByEmail, setStatusByEmail] = useState<Map<string, PresenceStatus>>(new Map());
  const token = localStorage.getItem('token');
  const uniqueEmails = useMemo(
    () => [...new Set(boxes.flatMap((b) => (b.membres || []).map((m) => (m.email || '').trim().toLowerCase()).filter(Boolean)))],
    [boxes]
  );
  const key = uniqueEmails.join(',');

  useEffect(() => {
    if (uniqueEmails.length === 0) { setStatusByEmail(new Map()); return; }
    let cancelled = false;
    (async () => {
      const result = new Map<string, PresenceStatus>();
      const CHUNK = 500;
      for (let i = 0; i < uniqueEmails.length; i += CHUNK) {
        const chunk = uniqueEmails.slice(i, i + CHUNK);
        try {
          const res = await fetch('/api/infra/agents/presence/batch', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ agents: chunk.map((email) => ({ email })) }),
          });
          const data = await res.json();
          (data.results || []).forEach((r: { found: boolean; agent?: unknown }, idx: number) => {
            result.set(chunk[idx], classify(r.found ? { found: true, agent: r.agent as PresenceInfo['agent'] } : { found: false }));
          });
        } catch { /* boîtes concernées affichées comme "inconnu" par défaut, cf. valeur de repli ci-dessous */ }
      }
      if (!cancelled) setStatusByEmail(result);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return statusByEmail;
}

export default function BoitesPartagees() {
  const { token } = useAuth();
  const [boxes, setBoxes] = useState<SharedMailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'positif' | 'negatif'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [modalMailbox, setModalMailbox] = useState<SharedMailbox | null | undefined>(undefined); // undefined = closed
  // Ecriture reservee aux superviseurs/admins tickets cote backend
  // (authenticateTicketAdmin) — on va chercher le role RESOLU du module
  // tickets (pas user.role du AuthContext, qui est le role GLOBAL et ne
  // reconnait jamais "supervisor", un role uniquement module tickets).
  const [canManage, setCanManage] = useState(false);

  const fetchBoxes = () => {
    if (!token) return;
    fetch('/api/mailboxes', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setBoxes(Array.isArray(d) ? d : []))
      .catch(() => setBoxes([]))
      .finally(() => setLoading(false));
  };
  // Rechargement imperatif (apres creation/modification/suppression) :
  // ré-affiche le spinner, contrairement au chargement initial (deja
  // `loading=true` par defaut, cf. useState(true) ci-dessus).
  const load = () => { setLoading(true); fetchBoxes(); };

  useEffect(fetchBoxes, [token]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/tickets/my-role', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setCanManage(['supervisor', 'admin', 'superadmin'].includes(d.role)))
      .catch(() => setCanManage(false));
  }, [token]);

  const responsableEmails = useMemo(
    () => Array.from(new Set(boxes.map((b) => b.responsable_email).filter((e): e is string => !!e))),
    [boxes]
  );
  const departedResponsables = useDepartedEmails(responsableEmails);
  const alertCount = boxes.filter((b) => b.responsable_email && departedResponsables.has(b.responsable_email.toLowerCase())).length;
  const memberPresence = useMembersPresenceStatus(boxes);
  // Emails absents de memberPresence (chargement pas encore terminé, ou lot en
  // échec) : ni compté "parti" ni "inconnu" tant qu'on n'a pas de réponse, pour
  // ne pas afficher un ❓ transitoire à chaque chargement de page.
  const memberIssueCounts = useMemo(() => {
    const map = new Map<number, { departed: number; unknown: number }>();
    boxes.forEach((b) => {
      let departed = 0, unknown = 0;
      (b.membres || []).forEach((m) => {
        const status = memberPresence.get((m.email || '').trim().toLowerCase());
        if (status === 'departed') departed++;
        else if (status === 'unknown') unknown++;
      });
      if (departed || unknown) map.set(b.id, { departed, unknown });
    });
    return map;
  }, [boxes, memberPresence]);

  // Types réellement présents en base (plutôt que TYPE_OPTIONS en dur) : couvre
  // aussi bien la valeur canonique qu'une variante héritée non normalisée,
  // pour que le filtre ne fasse jamais disparaître silencieusement une fiche.
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    boxes.forEach((b) => { if (b.type) counts.set(b.type, (counts.get(b.type) || 0) + 1); });
    return counts;
  }, [boxes]);
  const availableTypes = useMemo(
    () => [...typeCounts.keys()].sort((a, b) => a.localeCompare(b, 'fr')),
    [typeCounts]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return boxes.filter((b) => {
      if (statusFilter === 'pending' && b.arbitrage_decision) return false;
      if (statusFilter === 'positif' && b.arbitrage_decision !== 'positif') return false;
      if (statusFilter === 'negatif' && b.arbitrage_decision !== 'negatif') return false;
      if (typeFilter !== 'all' && b.type !== typeFilter) return false;
      if (!q) return true;
      return [b.nom, b.email, b.responsable_display, b.responsable_email, b.requested_by_name, ...(b.membres || []).map((m) => m.displayName)]
        .filter(Boolean).some((s) => String(s).toLowerCase().includes(q));
    }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
  }, [boxes, search, statusFilter, typeFilter]);

  const counts = useMemo(() => ({
    total: boxes.length,
    pending: boxes.filter((b) => !b.arbitrage_decision).length,
    positif: boxes.filter((b) => b.arbitrage_decision === 'positif').length,
    negatif: boxes.filter((b) => b.arbitrage_decision === 'negatif').length,
  }), [boxes]);

  const deleteBox = async (b: SharedMailbox) => {
    if (!window.confirm(`Supprimer la boîte "${b.nom}" ?`)) return;
    await fetch(`/api/mailboxes/${b.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    load();
  };

  return (
    <div>
      <Header />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
            <Mail size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1e293b' }}>Boîtes mail partagées</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>
              {counts.total} demande{counts.total > 1 ? 's' : ''} — {counts.pending} en attente, {counts.positif} favorable{counts.positif > 1 ? 's' : ''}, {counts.negatif} défavorable{counts.negatif > 1 ? 's' : ''}
            </p>
          </div>
          {canManage && (
            <button onClick={() => setModalMailbox(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              <Plus size={15} /> Ajouter une boîte
            </button>
          )}
        </div>

        {alertCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
            <AlertTriangle size={16} />
            {alertCount} boîte{alertCount > 1 ? 's ont' : ' a'} un·e responsable parti·e — pensez à réaffecter la responsabilité.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une boîte, un responsable, un agent…"
              style={{ width: '100%', padding: '8px 10px 8px 30px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: typeFilter === 'all' ? '#475569' : '#1d4ed8', background: typeFilter === 'all' ? 'white' : '#eff6ff' }}
          >
            <option value="all">Tous les types ({boxes.length})</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>{t} ({typeCounts.get(t)})</option>
            ))}
          </select>
          {[
            { v: 'all', label: 'Toutes' },
            { v: 'pending', label: '⏳ En attente' },
            { v: 'positif', label: '✅ Favorables' },
            { v: 'negatif', label: '❌ Défavorables' },
          ].map((opt) => (
            <button
              key={opt.v}
              onClick={() => setStatusFilter(opt.v as typeof statusFilter)}
              style={{
                padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                border: statusFilter === opt.v ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                background: statusFilter === opt.v ? '#eff6ff' : 'white',
                color: statusFilter === opt.v ? '#1d4ed8' : '#475569',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ background: 'white', border: '1.5px dashed #e2e8f0', borderRadius: 12, padding: 50, textAlign: 'center', color: '#94a3b8' }}>
            <Mail size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
            <p style={{ margin: 0, fontWeight: 600 }}>Aucune boîte mail partagée trouvée.</p>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Boîte</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Type</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Responsable</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Agents</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Fin</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Ticket</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Arbitrage</th>
                  {canManage && <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const expanded = expandedId === b.id;
                  const responsableDeparted = !!(b.responsable_email && departedResponsables.has(b.responsable_email.toLowerCase()));
                  return (
                    <React.Fragment key={b.id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : b.id)}
                        style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#fafbfc')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                      >
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#1e293b' }}>{b.email || '—'}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{b.nom}</div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <TypeBadge type={b.type} usageType={b.usage_type} />
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {b.responsable_display ? (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: responsableDeparted ? '#dc2626' : '#1e293b', fontWeight: responsableDeparted ? 700 : 400 }}>
                                <AgentPresenceBadge email={b.responsable_email} name={b.responsable_display} />
                                {b.responsable_display}
                                {responsableDeparted && <span title="Responsable parti·e"><AlertTriangle size={13} color="#dc2626" /></span>}
                              </div>
                              <div style={{ fontSize: 11, color: '#94a3b8' }}>{b.responsable_email || ''}</div>
                            </>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#475569' }}>
                          {(b.membres || []).length === 0 && b.ad_sync_error ? (
                            <span title={`Non résolu dans l'AD : ${b.ad_sync_error}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#dc2626', fontWeight: 600, cursor: 'help' }}>
                              <AlertTriangle size={12} /> ?
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Users size={12} /> {(b.membres || []).length}
                              </span>
                              {memberIssueCounts.get(b.id)?.departed ? (
                                <span title={`${memberIssueCounts.get(b.id)!.departed} membre(s) parti(s) (RH Studio)`} style={{ color: '#dc2626', fontWeight: 700, fontSize: 11, cursor: 'help' }}>
                                  ❌{memberIssueCounts.get(b.id)!.departed}
                                </span>
                              ) : null}
                              {memberIssueCounts.get(b.id)?.unknown ? (
                                <span title={`${memberIssueCounts.get(b.id)!.unknown} membre(s) inconnu(s) de RH Studio`} style={{ color: '#94a3b8', fontWeight: 700, fontSize: 11, cursor: 'help' }}>
                                  ❓{memberIssueCounts.get(b.id)!.unknown}
                                </span>
                              ) : null}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#64748b' }}>
                          {b.provisoire && b.date_fin ? new Date(b.date_fin).toLocaleDateString('fr-FR') : b.provisoire ? 'Provisoire' : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {b.ticket_id ? (
                            <a
                              href={`/tickets/${b.ticket_id}`}
                              onClick={(e) => e.stopPropagation()}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
                            >
                              #{b.ticket_id} <ExternalLink size={11} />
                            </a>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <ArbitrageBadge decision={b.arbitrage_decision} />
                        </td>
                        {canManage && (
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => setModalMailbox(b)} title="Modifier" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', padding: 4 }}>
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => deleteBox(b)} title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                      {expanded && (
                        <tr style={{ background: '#fafbfc' }}>
                          <td colSpan={canManage ? 8 : 7} style={{ padding: '10px 14px 16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>Agents ayant accès</div>
                                {(b.membres || []).length === 0 ? (
                                  b.ad_sync_error ? (
                                    <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                                      <AlertTriangle size={13} /> Non résolu dans l'AD : {b.ad_sync_error}
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Aucun</div>
                                  )
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {b.membres.map((m, i) => (
                                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1e293b' }}>
                                        <AgentPresenceBadge email={m.email} name={m.displayName} />
                                        {m.displayName} <span style={{ color: '#94a3b8' }}>({m.email})</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>
                                  Demandée par {b.requested_by_name} le {new Date(b.created_at).toLocaleDateString('fr-FR')}
                                  {b.date_creation && <> — créée le {new Date(b.date_creation).toLocaleDateString('fr-FR')}</>}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>Justification</div>
                                <div style={{ fontSize: 12, color: '#1e293b', whiteSpace: 'pre-wrap', marginBottom: 10 }}>{b.justification || '—'}</div>
                                {b.arbitrage_comment && (
                                  <>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                                      Commentaire d'arbitrage
                                    </div>
                                    <div style={{
                                      fontSize: 12, padding: '6px 10px', borderRadius: 6,
                                      color: b.arbitrage_decision === 'positif' ? '#166534' : '#991b1b',
                                      background: b.arbitrage_decision === 'positif' ? '#f0fdf4' : '#fef2f2',
                                      border: `1px solid ${b.arbitrage_decision === 'positif' ? '#bbf7d0' : '#fecaca'}`,
                                    }}>
                                      {b.arbitrage_decision === 'positif' ? 'FAVORABLE' : 'DÉFAVORABLE'} — {b.arbitrage_comment}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalMailbox !== undefined && (
        <MailboxModal initial={modalMailbox} token={token} onClose={() => setModalMailbox(undefined)} onSaved={load} />
      )}
    </div>
  );
}
