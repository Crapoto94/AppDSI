import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, Search, Upload, Edit2, Trash2, GraduationCap, UserCheck, Clock, CalendarCheck, List, CalendarDays, X, FileText } from 'lucide-react';
import AgentPresenceBadge from '../../components/AgentPresenceBadge';

const API = '/api/admin/rh/stagiaires';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });
const VIEW_KEY = 'rh_stagiaires_view';

interface Stagiaire {
  id: number;
  nom: string;
  niveau: string;
  date_arrivee: string | null; // AAAA-MM-JJ
  date_fin: string | null;
  duree_semaines: number | null;
  maitre_stage: string;
  cv_nom: string | null;       // nom d'origine du CV déposé (null = aucun)
  rapport_nom: string | null;  // idem pour le rapport de stage
  maitre_username: string | null; // agent DSI (liste de /calendrier-dsi) ; null = valeur historique en texte libre
  notes: string;
}

interface AgentDsi { username: string; nom: string; email: string; service: string }

type FormData = Omit<Stagiaire, 'id' | 'duree_semaines' | 'cv_nom' | 'rapport_nom'> & { id?: number };
type DocKind = 'cv' | 'rapport';
const DOC_LABEL: Record<DocKind, string> = { cv: 'CV', rapport: 'Rapport de stage' };
const DOC_MAX = 15 * 1024 * 1024;
type Statut = 'en_cours' | 'a_venir' | 'termine' | 'sans_date';

const EMPTY_FORM: FormData = { nom: '', niveau: '', date_arrivee: '', date_fin: '', maitre_stage: '', maitre_username: '', notes: '' };

const C = { indigo: '#4f46e5', green: '#16a34a', amber: '#d97706', slate: '#64748b', border: '#e2e8f0' };

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// Couleur par maître de stage (stable : dépend du nom)
const PALETTE = ['#4f46e5', '#0891b2', '#16a34a', '#d97706', '#db2777', '#7c3aed', '#dc2626', '#0d9488'];
const colorOf = (maitre: string) => {
  const key = maitre.trim().toUpperCase();
  if (!key) return '#94a3b8';
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

// jj/mm/aaaa (ou aaaa-mm-jj) → aaaa-mm-jj ; chaîne vide → null ; invalide → undefined
function parseDate(raw: string): string | null | undefined {
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? s : undefined;
}

function statutOf(s: Stagiaire, today: string): Statut {
  if (!s.date_arrivee || !s.date_fin) return 'sans_date';
  if (s.date_fin < today) return 'termine';
  if (s.date_arrivee > today) return 'a_venir';
  return 'en_cours';
}

const STATUT_LABEL: Record<Statut, string> = { en_cours: 'En cours', a_venir: 'À venir', termine: 'Terminé', sans_date: 'Dates à définir' };
const STATUT_STYLE: Record<Statut, { bg: string; fg: string }> = {
  en_cours: { bg: '#dcfce7', fg: '#15803d' }, a_venir: { bg: '#dbeafe', fg: '#1d4ed8' },
  termine: { bg: '#f1f5f9', fg: '#64748b' }, sans_date: { bg: '#fef3c7', fg: '#b45309' },
};

// Champ à saisie prédictive des agents DSI (nom, identifiant ou service ; accents et casse ignorés).
// Flèches haut/bas + Entrée pour choisir au clavier, Échap pour fermer, × pour retirer le maître de stage.
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function AgentPicker({ agents, username, legacy, onPick }: {
  agents: AgentDsi[]; username: string | null; legacy: string; onPick: (a: AgentDsi | null) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = agents.find(a => a.username === username) || null;

  const matches = useMemo(() => {
    const n = norm(q.trim());
    const list = n ? agents.filter(a => norm(`${a.nom} ${a.username} ${a.service}`).includes(n)) : agents;
    return list.slice(0, 50);
  }, [q, agents]);

  useEffect(() => {
    (listRef.current?.children[hi] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }, [hi, open]);

  const pick = (a: AgentDsi | null) => { onPick(a); setOpen(false); setQ(''); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && open && matches[hi]) { e.preventDefault(); pick(matches[hi]); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); setQ(''); }
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={open ? q : (selected?.nom || '')}
        placeholder={legacy && !selected ? `À rattacher (valeur d'origine : ${legacy}) — tapez pour chercher` : 'Tapez un nom, un prénom ou un service…'}
        onFocus={() => { setOpen(true); setQ(''); setHi(0); }}
        onBlur={() => { setOpen(false); setQ(''); }}
        onChange={e => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        style={{ paddingRight: 28 }}
      />
      {selected && (
        <button type="button" title="Retirer le maître de stage" onMouseDown={e => { e.preventDefault(); pick(null); }}
          style={{ position: 'absolute', right: 6, top: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, lineHeight: 1 }}>×</button>
      )}
      {open && (
        <div ref={listRef} style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 2, maxHeight: 220, overflowY: 'auto', background: 'white', border: `1px solid ${C.border}`, borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
          {matches.length === 0 && <div style={{ padding: '8px 10px', fontSize: 13, color: '#94a3b8' }}>Aucun agent DSI ne correspond</div>}
          {matches.map((a, i) => (
            <div key={a.username} onMouseDown={e => { e.preventDefault(); pick(a); }} onMouseEnter={() => setHi(i)}
              style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 14, background: i === hi ? '#eef2ff' : undefined }}>
              <b style={{ fontWeight: a.username === username ? 700 : 500 }}>{a.nom}</b>
              <span style={{ marginLeft: 8, fontSize: 11, color: '#94a3b8' }}>{a.service}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type SortKey = 'nom' | 'niveau' | 'date_arrivee' | 'date_fin' | 'duree_semaines' | 'maitre_stage';

export default function Stagiaires() {
  const [items, setItems] = useState<Stagiaire[]>([]);
  const [agents, setAgents] = useState<AgentDsi[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ id: number; kind: DocKind } | null>(null);
  const [busyDoc, setBusyDoc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'liste' | 'calendrier'>(() => {
    try { return localStorage.getItem(VIEW_KEY) === 'calendrier' ? 'calendrier' : 'liste'; } catch { return 'liste'; }
  });
  const [search, setSearch] = useState('');
  const [maitreFilter, setMaitreFilter] = useState('');
  const [statutFilter, setStatutFilter] = useState<'' | Statut>('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date_arrivee', dir: 1 });
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const today = isoOf(new Date());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(API, { headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || `Erreur ${res.status}`);
      setItems(await res.json());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Les maîtres de stage sont des agents DSI : même liste que /calendrier-dsi
  useEffect(() => {
    fetch('/api/calendrier-dsi/agents', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then((list: AgentDsi[]) => setAgents(Array.isArray(list) ? list.map(a => ({ username: a.username, nom: a.nom, email: a.email || '', service: a.service || '' })) : []))
      .catch(() => setAgents([]));
  }, []);

  const agentByUsername = useMemo(() => new Map(agents.map(a => [a.username, a])), [agents]);

  const changeView = (v: 'liste' | 'calendrier') => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* stockage indisponible */ }
  };

  const maitres = useMemo(() => [...new Set(items.map(i => i.maitre_stage.trim()).filter(Boolean))].sort(), [items]);
  const niveaux = useMemo(() => [...new Set(items.map(i => i.niveau.trim()).filter(Boolean))].sort(), [items]);

  // Filtres communs aux deux vues (recherche + maître de stage)
  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(i =>
      (!maitreFilter || i.maitre_stage.trim().toUpperCase() === maitreFilter.toUpperCase()) &&
      (!q || `${i.nom} ${i.niveau} ${i.maitre_stage}`.toLowerCase().includes(q)));
  }, [items, search, maitreFilter]);

  const rows = useMemo(() => {
    const list = base.filter(i => !statutFilter || statutOf(i, today) === statutFilter);
    const { key, dir } = sort;
    return [...list].sort((a, b) => {
      const va = a[key], vb = b[key];
      if (va == null || va === '') return vb == null || vb === '' ? 0 : 1; // valeurs vides en dernier
      if (vb == null || vb === '') return -1;
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr')) * dir;
    });
  }, [base, statutFilter, sort, today]);

  const counts = useMemo(() => {
    const c = { total: items.length, en_cours: 0, a_venir: 0, termine: 0 };
    for (const i of items) {
      const s = statutOf(i, today);
      if (s !== 'sans_date') c[s]++;
    }
    return c;
  }, [items, today]);

  const toggleSort = (key: SortKey) => setSort(s => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  const sortMark = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');

  // --- CRUD ---
  const openCreate = () => { setForm(EMPTY_FORM); setFormError(null); setModal('create'); };
  const openEdit = (s: Stagiaire) => {
    setForm({ id: s.id, nom: s.nom, niveau: s.niveau || '', date_arrivee: s.date_arrivee || '', date_fin: s.date_fin || '', maitre_stage: s.maitre_stage || '', maitre_username: s.maitre_username || '', notes: s.notes || '' });
    setFormError(null);
    setModal('edit');
  };

  const save = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(modal === 'create' ? API : `${API}/${form.id}`, {
        method: modal === 'create' ? 'POST' : 'PUT', headers: authHeaders(), body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || `Erreur ${res.status}`);
      setModal(null);
      await fetchData();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: Stagiaire) => {
    if (!confirm(`Supprimer le stage de ${s.nom}${s.date_arrivee ? ` (${fmt(s.date_arrivee)} → ${fmt(s.date_fin)})` : ''} ?`)) return;
    try {
      const res = await fetch(`${API}/${s.id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || `Erreur ${res.status}`);
      setModal(null);
      await fetchData();
    } catch (e) {
      alert('Erreur : ' + (e as Error).message);
    }
  };

  // --- Documents (CV, rapport de stage) : fichiers servis par une route authentifiée, jamais par une URL publique ---
  const bearer = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
  const mergeRow = (row: Stagiaire) => setItems(prev => prev.map(i => (i.id === row.id ? { ...i, ...row } : i)));

  const pickFile = (id: number, kind: DocKind) => {
    uploadTarget.current = { id, kind };
    fileInput.current?.click();
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const t = uploadTarget.current;
    if (!file || !t) return;
    if (file.size > DOC_MAX) { alert('Fichier trop volumineux (15 Mo maximum).'); return; }
    setBusyDoc(`${t.id}:${t.kind}`);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API}/${t.id}/documents/${t.kind}`, { method: 'POST', headers: bearer(), body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || `Erreur ${res.status}`);
      mergeRow(data);
    } catch (err) {
      alert('Erreur : ' + (err as Error).message);
    } finally {
      setBusyDoc(null);
    }
  };

  const openDoc = async (s: Stagiaire, kind: DocKind) => {
    try {
      const res = await fetch(`${API}/${s.id}/documents/${kind}`, { headers: bearer() });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || `Erreur ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (blob.type === 'application/pdf') {
        window.open(url, '_blank');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = (kind === 'cv' ? s.cv_nom : s.rapport_nom) || 'document';
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      alert('Erreur : ' + (err as Error).message);
    }
  };

  const removeDoc = async (s: Stagiaire, kind: DocKind) => {
    if (!confirm(`Supprimer le document « ${DOC_LABEL[kind]} » de ${s.nom} ?`)) return;
    try {
      const res = await fetch(`${API}/${s.id}/documents/${kind}`, { method: 'DELETE', headers: bearer() });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || `Erreur ${res.status}`);
      mergeRow(data);
    } catch (err) {
      alert('Erreur : ' + (err as Error).message);
    }
  };

  // --- Import : lignes collées depuis Excel (nom, niveau, date d'arrivée, date de fin, durée, maître de stage) ---
  const doImport = async () => {
    setImportError(null);
    const lines = importText.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.trim());
    const payload: { nom: string; niveau: string; date_arrivee: string | null; date_fin: string | null; maitre_stage: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      if (i === 0 && /^nom/i.test(cols[0].trim())) continue; // ligne d'en-tête
      const arrivee = parseDate(cols[2] || '');
      const fin = parseDate(cols[3] || '');
      if (arrivee === undefined || fin === undefined) { setImportError(`Ligne ${i + 1} : date illisible (format attendu jj/mm/aaaa).`); return; }
      payload.push({ nom: (cols[0] || '').trim(), niveau: (cols[1] || '').trim(), date_arrivee: arrivee, date_fin: fin, maitre_stage: (cols[5] || '').trim() });
    }
    if (!payload.length) { setImportError('Aucune ligne à importer.'); return; }
    try {
      const res = await fetch(`${API}/import`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ rows: payload }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || `Erreur ${res.status}`);
      setImportOpen(false);
      setImportText('');
      await fetchData();
      alert(`${data.imported} stagiaire(s) importé(s).`);
    } catch (e) {
      setImportError((e as Error).message);
    }
  };

  // --- Calendrier : mois en cours + 12 suivants ---
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 15 }, (_, k) => new Date(now.getFullYear(), now.getMonth() + k, 1));
  }, []);

  // jour (AAAA-MM-JJ) → stagiaires présents ce jour-là
  const presence = useMemo(() => {
    const map = new Map<string, Stagiaire[]>();
    const first = isoOf(months[0]);
    const lastMonth = months[months.length - 1];
    const last = isoOf(new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0));
    for (const s of base) {
      if (!s.date_arrivee || !s.date_fin || s.date_fin < first || s.date_arrivee > last) continue;
      const [y, m, d] = s.date_arrivee.split('-').map(Number);
      for (let cur = new Date(y, m - 1, d); isoOf(cur) <= s.date_fin && isoOf(cur) <= last; cur.setDate(cur.getDate() + 1)) {
        const k = isoOf(cur);
        if (k < first) continue;
        const arr = map.get(k);
        if (arr) arr.push(s); else map.set(k, [s]);
      }
    }
    return map;
  }, [base, months]);

  const renderMonth = (first: Date) => {
    const year = first.getFullYear(), month = first.getMonth();
    const nbDays = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // lundi = 0
    const monthStart = isoOf(first), monthEnd = isoOf(new Date(year, month, nbDays));
    const present = base
      .filter(s => s.date_arrivee && s.date_fin && s.date_arrivee <= monthEnd && s.date_fin >= monthStart)
      .sort((a, b) => (a.date_arrivee || '').localeCompare(b.date_arrivee || '') || a.nom.localeCompare(b.nom, 'fr'));
    const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: nbDays }, (_, i) => i + 1)];
    return (
      <div className="stg-month" key={monthStart}>
        <div className="stg-month-title">{MOIS[month]} {year}<span>{present.length} stagiaire{present.length > 1 ? 's' : ''}</span></div>
        <div className="stg-days">
          {JOURS.map((j, i) => <div key={i} className="stg-dow">{j}</div>)}
          {cells.map((n, i) => {
            if (n === null) return <div key={`e${i}`} />;
            const iso = `${year}-${pad(month + 1)}-${pad(n)}`;
            const here = presence.get(iso) || [];
            const weekend = (offset + n - 1) % 7 >= 5;
            const bg = here.length && !weekend ? `rgba(79,70,229,${Math.min(0.18 + here.length * 0.17, 0.75)})` : undefined;
            return (
              <div key={iso} className={`stg-day${weekend ? ' we' : ''}${iso === today ? ' today' : ''}`} style={{ background: bg, color: bg && here.length > 2 ? 'white' : undefined }}
                title={here.length ? `${fmt(iso)} : ${here.map(s => s.nom).join(', ')}` : undefined}>
                {n}
                {here.length > 1 && !weekend && <span className="stg-count">{here.length}</span>}
              </div>
            );
          })}
        </div>
        <div className="stg-chips">
          {present.length === 0 && <span className="stg-none">Aucun stagiaire</span>}
          {present.map(s => (
            <button key={s.id} className="stg-chip" style={{ borderLeftColor: colorOf(s.maitre_stage) }} onClick={() => openEdit(s)}
              title={`${s.nom} — ${s.niveau || 'niveau non renseigné'}${s.maitre_stage ? ` — maître de stage : ${s.maitre_stage}` : ''}`}>
              <b>{s.nom}</b> {fmt(s.date_arrivee).slice(0, 5)} → {fmt(s.date_fin).slice(0, 5)}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const dureeForm = useMemo(() => {
    if (!form.date_arrivee || !form.date_fin || form.date_fin < form.date_arrivee) return null;
    const a = new Date(form.date_arrivee + 'T00:00:00Z').getTime(), b = new Date(form.date_fin + 'T00:00:00Z').getTime();
    return Math.ceil(((b - a) / 86400000 + 1) / 7);
  }, [form.date_arrivee, form.date_fin]);

  return (
    <div>
      <style>{`
        .stg-title { font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 4px; display: flex; align-items: center; gap: 10px; }
        .stg-subtitle { color: #64748b; margin-bottom: 20px; font-size: 14px; }
        .stg-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .stg-stat { background: white; border-radius: 12px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); display: flex; align-items: center; gap: 12px; }
        .stg-stat-icon { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .stg-stat-value { font-size: 22px; font-weight: 700; color: #1e293b; line-height: 1.1; }
        .stg-stat-label { font-size: 12px; color: #64748b; }
        .stg-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
        .stg-toolbar input[type=text], .stg-toolbar select { padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; background: white; }
        .stg-search { position: relative; flex: 1; min-width: 220px; }
        .stg-search input { width: 100%; padding-left: 32px !important; box-sizing: border-box; }
        .stg-search svg { position: absolute; left: 10px; top: 10px; color: #94a3b8; }
        .stg-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; border: 1px solid transparent; font-size: 14px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: .15s; }
        .stg-btn-primary { background: #4f46e5; color: white; } .stg-btn-primary:hover { background: #4338ca; }
        .stg-btn-outline { background: white; border-color: #e2e8f0; color: #475569; } .stg-btn-outline:hover { background: #f8fafc; }
        .stg-btn-danger { background: #dc2626; color: white; } .stg-btn-danger:hover { background: #b91c1c; }
        .stg-btn-sm { padding: 4px 8px; font-size: 12px; }
        .stg-seg { display: inline-flex; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: white; }
        .stg-seg button { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: none; background: none; font-size: 14px; color: #64748b; cursor: pointer; }
        .stg-seg button.on { background: #eef2ff; color: #4f46e5; font-weight: 600; }
        .stg-table-wrap { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); overflow: auto; }
        table.stg-table { width: 100%; border-collapse: collapse; font-size: 14px; }
        table.stg-table th { background: #f8fafc; padding: 12px 16px; text-align: left; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; white-space: nowrap; cursor: pointer; user-select: none; }
        table.stg-table td { padding: 10px 16px; border-bottom: 1px solid #f1f5f9; }
        table.stg-table tr:hover td { background: #f8fafc; }
        .stg-badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; white-space: nowrap; }
        .stg-maitre { display: inline-flex; align-items: center; gap: 6px; }
        .stg-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .stg-doc { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; margin-right: 4px; border-radius: 6px; border: 1px dashed #cbd5e1; background: white; color: #64748b; font-size: 12px; cursor: pointer; }
        .stg-doc:hover { border-color: #4f46e5; color: #4f46e5; }
        .stg-doc.has { border-style: solid; border-color: #86efac; background: #f0fdf4; color: #15803d; }
        .stg-doc:disabled { opacity: .5; cursor: wait; }
        .stg-docrow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; }
        .stg-docrow .label { font-weight: 600; color: #475569; min-width: 110px; }
        .stg-docrow .name { color: #4f46e5; cursor: pointer; background: none; border: none; padding: 0; font-size: 13px; text-decoration: underline; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .stg-empty { text-align: center; padding: 48px; color: #94a3b8; }
        .stg-error { background: #fef2f2; color: #b91c1c; padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; font-size: 14px; }
        .stg-legend { display: flex; gap: 6px 16px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; font-size: 12px; color: #475569; }
        .stg-months { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
        @media (max-width: 1100px) { .stg-months { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 700px) { .stg-months { grid-template-columns: 1fr; } }
        .stg-month { background: white; border-radius: 12px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
        .stg-month-title { font-weight: 700; color: #1e293b; text-transform: capitalize; display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
        .stg-month-title span { font-size: 12px; font-weight: 500; color: #64748b; text-transform: none; }
        .stg-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
        .stg-dow { text-align: center; font-size: 11px; color: #94a3b8; font-weight: 600; padding: 2px 0; }
        .stg-day { position: relative; text-align: center; font-size: 12px; padding: 5px 0; border-radius: 6px; color: #334155; }
        .stg-count { position: absolute; top: -5px; right: -3px; min-width: 14px; height: 14px; padding: 0 3px; box-sizing: border-box; border-radius: 7px; background: #dc2626; color: white; font-size: 9px; font-weight: 700; line-height: 14px; text-align: center; box-shadow: 0 0 0 1.5px white; pointer-events: none; }
        .stg-day.we { color: #cbd5e1; }
        .stg-day.today { outline: 2px solid #f59e0b; outline-offset: -2px; font-weight: 700; }
        .stg-chips { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; }
        .stg-chip { text-align: left; border: 1px solid #e2e8f0; border-left: 4px solid #94a3b8; border-radius: 6px; background: #f8fafc; padding: 4px 8px; font-size: 12px; color: #475569; cursor: pointer; }
        .stg-chip:hover { background: #eef2ff; }
        .stg-chip b { color: #1e293b; }
        .stg-none { font-size: 12px; color: #94a3b8; }
        .stg-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .stg-modal { background: white; border-radius: 12px; padding: 24px; max-width: 600px; width: 92%; max-height: 88vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.15); }
        .stg-modal h3 { font-size: 18px; margin: 0 0 16px; color: #1e293b; display: flex; justify-content: space-between; align-items: center; }
        .stg-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .stg-form .full { grid-column: 1 / -1; }
        .stg-form label { font-size: 13px; font-weight: 500; color: #475569; display: block; margin-bottom: 4px; }
        .stg-form input, .stg-form textarea { width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
        .stg-form textarea { min-height: 70px; resize: vertical; font-family: inherit; }
        .stg-actions { display: flex; gap: 8px; justify-content: space-between; margin-top: 18px; }
        .stg-actions .right { display: flex; gap: 8px; margin-left: auto; }
        @media (max-width: 768px) { .stg-form { grid-template-columns: 1fr; } .stg-toolbar { flex-direction: column; align-items: stretch; } }
      `}</style>

      <input ref={fileInput} type="file" accept=".pdf,.doc,.docx,.odt,.rtf" onChange={onFileChosen} style={{ display: 'none' }} />
      <div className="stg-title"><GraduationCap size={24} color={C.indigo} /> Stagiaires</div>
      <div className="stg-subtitle">Accueil des stagiaires de la DSI : liste des stages et calendrier du mois en cours et des 14 mois suivants.</div>

      <div className="stg-stats">
        <div className="stg-stat"><div className="stg-stat-icon" style={{ background: '#ede9fe' }}><GraduationCap size={19} color={C.indigo} /></div><div><div className="stg-stat-value">{counts.total}</div><div className="stg-stat-label">Stages enregistrés</div></div></div>
        <div className="stg-stat"><div className="stg-stat-icon" style={{ background: '#dcfce7' }}><UserCheck size={19} color={C.green} /></div><div><div className="stg-stat-value">{counts.en_cours}</div><div className="stg-stat-label">En cours</div></div></div>
        <div className="stg-stat"><div className="stg-stat-icon" style={{ background: '#dbeafe' }}><Clock size={19} color="#2563eb" /></div><div><div className="stg-stat-value">{counts.a_venir}</div><div className="stg-stat-label">À venir</div></div></div>
        <div className="stg-stat"><div className="stg-stat-icon" style={{ background: '#f1f5f9' }}><CalendarCheck size={19} color={C.slate} /></div><div><div className="stg-stat-value">{counts.termine}</div><div className="stg-stat-label">Terminés</div></div></div>
      </div>

      <div className="stg-toolbar">
        <div className="stg-seg">
          <button className={view === 'liste' ? 'on' : ''} onClick={() => changeView('liste')}><List size={16} /> Liste</button>
          <button className={view === 'calendrier' ? 'on' : ''} onClick={() => changeView('calendrier')}><CalendarDays size={16} /> Calendrier</button>
        </div>
        <div className="stg-search">
          <Search size={16} />
          <input type="text" placeholder="Rechercher un nom, un niveau, un maître de stage…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={maitreFilter} onChange={e => setMaitreFilter(e.target.value)}>
          <option value="">Tous les maîtres de stage</option>
          {maitres.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {view === 'liste' && (
          <select value={statutFilter} onChange={e => setStatutFilter(e.target.value as '' | Statut)}>
            <option value="">Tous les statuts</option>
            <option value="en_cours">En cours</option>
            <option value="a_venir">À venir</option>
            <option value="termine">Terminés</option>
            <option value="sans_date">Dates à définir</option>
          </select>
        )}
        <button className="stg-btn stg-btn-primary" onClick={openCreate}><Plus size={16} /> Ajouter</button>
        <button className="stg-btn stg-btn-outline" onClick={() => { setImportError(null); setImportOpen(true); }}><Upload size={16} /> Importer</button>
      </div>

      {error && <div className="stg-error">{error}</div>}

      {view === 'liste' ? (
        <div className="stg-table-wrap">
          {loading ? <div className="stg-empty">Chargement…</div> : rows.length === 0 ? (
            <div className="stg-empty">{items.length === 0 ? 'Aucun stagiaire enregistré. Utilisez « Ajouter » ou « Importer ».' : 'Aucun stagiaire ne correspond aux filtres.'}</div>
          ) : (
            <table className="stg-table">
              <thead>
                <tr>
                  <th onClick={() => toggleSort('nom')}>Nom du stagiaire{sortMark('nom')}</th>
                  <th onClick={() => toggleSort('niveau')}>Niveau{sortMark('niveau')}</th>
                  <th onClick={() => toggleSort('date_arrivee')}>Arrivée{sortMark('date_arrivee')}</th>
                  <th onClick={() => toggleSort('date_fin')}>Fin{sortMark('date_fin')}</th>
                  <th onClick={() => toggleSort('duree_semaines')}>Durée{sortMark('duree_semaines')}</th>
                  <th onClick={() => toggleSort('maitre_stage')}>Maître de stage{sortMark('maitre_stage')}</th>
                  <th style={{ cursor: 'default' }}>Documents</th>
                  <th style={{ cursor: 'default' }}>Statut</th>
                  <th style={{ cursor: 'default' }} />
                </tr>
              </thead>
              <tbody>
                {rows.map(s => {
                  const st = statutOf(s, today);
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.nom}{s.notes ? <span title={s.notes} style={{ marginLeft: 6, color: '#94a3b8' }}>📝</span> : null}</td>
                      <td>{s.niveau}</td>
                      <td>{fmt(s.date_arrivee)}</td>
                      <td>{fmt(s.date_fin)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{s.duree_semaines != null ? `${s.duree_semaines} sem.` : ''}</td>
                      <td>{s.maitre_stage ? (
                        <span className="stg-maitre"><span className="stg-dot" style={{ background: colorOf(s.maitre_stage) }} />{s.maitre_stage}
                          {s.maitre_username && <AgentPresenceBadge email={agentByUsername.get(s.maitre_username)?.email} name={s.maitre_stage} />}
                          {!s.maitre_username && <span title="Valeur d'origine non rattachée à un agent DSI : à choisir dans la fiche" style={{ color: '#d97706' }}>⚠</span>}
                        </span>) : ''}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {(['cv', 'rapport'] as DocKind[]).map(kind => {
                          const nom = kind === 'cv' ? s.cv_nom : s.rapport_nom;
                          const short = kind === 'cv' ? 'CV' : 'Rapport';
                          return nom ? (
                            <button key={kind} className="stg-doc has" title={`${DOC_LABEL[kind]} : ${nom} (cliquer pour ouvrir)`} onClick={() => openDoc(s, kind)}><FileText size={13} /> {short}</button>
                          ) : (
                            <button key={kind} className="stg-doc" disabled={busyDoc === `${s.id}:${kind}`} title={`Téléverser ${kind === 'cv' ? 'un CV' : 'un rapport de stage'} (PDF, DOC, DOCX, ODT, RTF — 15 Mo max)`} onClick={() => pickFile(s.id, kind)}><Upload size={13} /> {short}</button>
                          );
                        })}
                      </td>
                      <td><span className="stg-badge" style={{ background: STATUT_STYLE[st].bg, color: STATUT_STYLE[st].fg }}>{STATUT_LABEL[st]}</span></td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button className="stg-btn stg-btn-outline stg-btn-sm" title="Modifier" onClick={() => openEdit(s)}><Edit2 size={14} /></button>{' '}
                        <button className="stg-btn stg-btn-outline stg-btn-sm" title="Supprimer" onClick={() => remove(s)} style={{ color: '#dc2626' }}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <>
          <div className="stg-legend">
            <span style={{ fontWeight: 700 }}>Maîtres de stage :</span>
            {maitres.length === 0 && <span>—</span>}
            {maitres.map(m => <span key={m} className="stg-maitre"><span className="stg-dot" style={{ background: colorOf(m) }} />{m}</span>)}
            <span style={{ marginLeft: 'auto' }}>Plus un jour est foncé, plus il y a de stagiaires présents (week-ends exclus).</span>
          </div>
          {loading ? <div className="stg-empty">Chargement…</div> : <div className="stg-months">{months.map(renderMonth)}</div>}
        </>
      )}

      {modal && (
        <div className="stg-overlay" onClick={() => setModal(null)}>
          <div className="stg-modal" onClick={e => e.stopPropagation()}>
            <h3>{modal === 'create' ? 'Nouveau stagiaire' : 'Modifier le stage'}<button className="stg-btn stg-btn-outline stg-btn-sm" onClick={() => setModal(null)}><X size={14} /></button></h3>
            <div className="stg-form">
              <div className="full"><label>Nom du stagiaire *</label><input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} autoFocus /></div>
              <div><label>Niveau</label><input list="stg-niveaux" value={form.niveau} onChange={e => setForm({ ...form, niveau: e.target.value })} placeholder="ex. SECONDE BAC PRO" />
                <datalist id="stg-niveaux">{niveaux.map(n => <option key={n} value={n} />)}</datalist></div>
              <div><label>Maître de stage</label><AgentPicker agents={agents} username={form.maitre_username || null} legacy={form.maitre_stage}
                  onPick={a => setForm({ ...form, maitre_username: a?.username || '', maitre_stage: a?.nom || '' })} /></div>
              <div><label>Date d'arrivée</label><input type="date" value={form.date_arrivee || ''} onChange={e => setForm({ ...form, date_arrivee: e.target.value })} /></div>
              <div><label>Date de fin</label><input type="date" value={form.date_fin || ''} min={form.date_arrivee || undefined} onChange={e => setForm({ ...form, date_fin: e.target.value })} /></div>
              <div className="full" style={{ fontSize: 13, color: '#64748b' }}>Durée : {dureeForm != null ? <b>{dureeForm} semaine{dureeForm > 1 ? 's' : ''}</b> : 'calculée à partir des deux dates'}</div>
              <div className="full"><label>Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="full">
                <label>Documents</label>
                {modal === 'create' || form.id == null ? (
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>Le CV et le rapport de stage pourront être ajoutés après l'enregistrement du stagiaire.</div>
                ) : (() => {
                  const cur = items.find(i => i.id === form.id);
                  if (!cur) return null;
                  return (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {(['cv', 'rapport'] as DocKind[]).map(kind => {
                        const nom = kind === 'cv' ? cur.cv_nom : cur.rapport_nom;
                        const busy = busyDoc === `${cur.id}:${kind}`;
                        return (
                          <div className="stg-docrow" key={kind}>
                            <span className="label">{DOC_LABEL[kind]}</span>
                            {nom ? <button type="button" className="name" title="Ouvrir" onClick={() => openDoc(cur, kind)}>{nom}</button> : <span style={{ color: '#94a3b8' }}>Aucun document</span>}
                            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
                              <button type="button" className="stg-btn stg-btn-outline stg-btn-sm" disabled={busy} onClick={() => pickFile(cur.id, kind)}><Upload size={13} /> {busy ? 'Envoi…' : nom ? 'Remplacer' : 'Téléverser'}</button>
                              {nom && <button type="button" className="stg-btn stg-btn-outline stg-btn-sm" style={{ color: '#dc2626' }} onClick={() => removeDoc(cur, kind)}><Trash2 size={13} /></button>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
            {formError && <div className="stg-error" style={{ marginTop: 12, marginBottom: 0 }}>{formError}</div>}
            <div className="stg-actions">
              {modal === 'edit' && <button className="stg-btn stg-btn-danger" onClick={() => remove(form as Stagiaire)}><Trash2 size={14} /> Supprimer</button>}
              <div className="right">
                <button className="stg-btn stg-btn-outline" onClick={() => setModal(null)}>Annuler</button>
                <button className="stg-btn stg-btn-primary" onClick={save} disabled={saving || !form.nom.trim()}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="stg-overlay" onClick={() => setImportOpen(false)}>
          <div className="stg-modal" style={{ maxWidth: 760 }} onClick={e => e.stopPropagation()}>
            <h3>Importer des stagiaires<button className="stg-btn stg-btn-outline stg-btn-sm" onClick={() => setImportOpen(false)}><X size={14} /></button></h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 8px' }}>
              Copiez les lignes du tableau Excel et collez-les ci-dessous. Colonnes attendues, dans cet ordre :
              <b> Nom, Niveau, Date d'arrivée, Date de fin, Durée</b> (ignorée, recalculée) <b>, Maître de stage</b> (rattaché à l'agent DSI correspondant s'il est unique). Dates au format jj/mm/aaaa. La ligne d'en-tête est ignorée.
              L'import est refusé en entier si une ligne est invalide.
            </p>
            <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder={'RAHALI CHERINE\tTERMINALE BAC PRO\t24/11/2025\t19/12/2025\t4\tMOURAD'}
              style={{ width: '100%', minHeight: 220, padding: 10, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: 'monospace', fontSize: 12, boxSizing: 'border-box' }} />
            {importError && <div className="stg-error" style={{ marginTop: 12, marginBottom: 0 }}>{importError}</div>}
            <div className="stg-actions">
              <div className="right">
                <button className="stg-btn stg-btn-outline" onClick={() => setImportOpen(false)}>Annuler</button>
                <button className="stg-btn stg-btn-primary" onClick={doImport} disabled={!importText.trim()}><Upload size={14} /> Importer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
