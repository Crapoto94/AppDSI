import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  Plus, Search, Trash2, Save, Sparkles, RefreshCw, Pin, PinOff, Eye, Pencil, X,
  NotebookPen, Folder, ChevronRight, ChevronDown, FileText, Tag,
  Cloud, Check, AlertCircle, Loader2, History, Wand2, LayoutList,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import AgentPresenceBadge from '../components/AgentPresenceBadge';
import NoteEditor, { type Mention } from '../components/notes/NoteEditor';
import NoteTasksModal from '../components/notes/NoteTasksModal';
import WordCloud, { type CloudWord } from '../components/notes/WordCloud';

// ── Utilitaires ────────────────────────────────────────────────────────────
function stripHtml(html?: string | null): string {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Encadre les mentions d'un <span> stylé dans le HTML rendu. */
function decorateMentions(html: string, mentions: Mention[]): string {
  let out = html || '';
  for (const m of mentions || []) {
    if (!m?.name) continue;
    const parts = m.name.trim().split(/\s+/).map(escapeRegex);
    if (!parts.length) continue;
    const pattern = '@' + parts.join('[\\s\\u00a0]+');
    const safeEmail = (m.email || '').replace(/"/g, '');
    out = out.replace(new RegExp(pattern, 'gi'), '@<span class="note-mention" data-email="' + safeEmail + '">' + m.name + '</span>');
  }
  return out;
}

const AI_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  idle: { label: 'Non analysée', color: '#64748b', bg: '#f1f5f9' },
  pending: { label: 'En attente IA', color: '#854d0e', bg: '#fef9c3' },
  running: { label: 'Analyse IA…', color: '#1e40af', bg: '#dbeafe' },
  done: { label: 'Analysée', color: '#166534', bg: '#dcfce7' },
  error: { label: 'Erreur IA', color: '#991b1b', bg: '#fee2e2' },
};

function AiBadge({ status, size = 11 }: { status?: string; size?: number }) {
  const meta = AI_STATUS_META[status || 'idle'] || AI_STATUS_META.idle;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: meta.bg, color: meta.color, fontSize: size, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {status === 'running' || status === 'pending' ? <Loader2 size={size} style={{ animation: 'spin 1s linear infinite' }} /> : status === 'error' ? <AlertCircle size={size} /> : status === 'done' ? <Check size={size} /> : <Sparkles size={size} />}
      {meta.label}
    </span>
  );
}

interface Notebook { id: number; title: string; color?: string; is_inbox?: boolean; note_count?: number; sections?: Section[] }
interface Section { id: number; notebook_id: number; title: string; note_count?: number }

// ── Page ───────────────────────────────────────────────────────────────────
const Notes: React.FC = () => {
  const { token } = useAuth();
  const api = useCallback((method: string, url: string, payload?: any) => {
    const cfg: any = { headers: { Authorization: `Bearer ${token}` } };
    if (method.toLowerCase() === 'get') cfg.params = payload; else cfg.data = payload;
    return axios({ method, url, ...cfg });
  }, [token]);

  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [settings, setSettings] = useState<{ auto_analyze: boolean; auto_classify: boolean; model: string }>({ auto_analyze: true, auto_classify: true, model: '' });
  const [loading, setLoading] = useState(true);

  const [selectedNotebook, setSelectedNotebook] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const [note, setNote] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagList, setTagList] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [aiTab, setAiTab] = useState<'reformule' | 'corrige' | 'original'>('reformule');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [cloudOpen, setCloudOpen] = useState(false);
  const [cloudWords, setCloudWords] = useState<CloudWord[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudDays, setCloudDays] = useState('0');

  const [reorgOpen, setReorgOpen] = useState(false);
  const [reorgLoading, setReorgLoading] = useState(false);
  const [reorgProposal, setReorgProposal] = useState<any>(null);
  const [reorgRaw, setReorgRaw] = useState('');
  const [tasksOpen, setTasksOpen] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);

  const loadedRef = useRef<{ title: string; content: string }>({ title: '', content: '' });
  const analyzedRef = useRef<string>('');
  const pollRef = useRef<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // ── Chargements ──────────────────────────────────────────────────────────
  const loadTree = useCallback(async () => {
    try {
      const r = await api('get', '/api/notes/tree');
      setNotebooks(r.data.notebooks || []);
      setTags(r.data.tags || []);
    } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur arborescence'); }
  }, [api]);

  const loadNotes = useCallback(async () => {
    try {
      const params: any = {};
      if (searchQuery.trim()) params.q = searchQuery.trim();
      else {
        if (selectedSection) params.section_id = selectedSection;
        else if (selectedNotebook) params.notebook_id = selectedNotebook;
        if (selectedTag) params.tag = selectedTag;
      }
      const r = await api('get', '/api/notes', params);
      setNotes(r.data || []);
    } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur notes'); }
  }, [api, searchQuery, selectedNotebook, selectedSection, selectedTag]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadTree(), loadNotes()]);
      try {
        const r = await api('get', '/api/notes/settings');
        setSettings(r.data);
      } catch { /* défauts */ }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { loadNotes(); }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, selectedNotebook, selectedSection, selectedTag, loadNotes]);

  // ── Sélection d'une note ─────────────────────────────────────────────────
  const openNote = useCallback(async (id: number) => {
    try {
      const r = await api('get', `/api/notes/${id}`);
      const n = r.data;
      setNote(n);
      setTitle(n.title || '');
      setContent(n.content || '');
      setTagList((n.tags || []).map((t: any) => t.tag));
      setMentions((n.mentions || []).map((m: any) => ({ name: m.agent_name || '', email: m.agent_email || '' })));
      loadedRef.current = { title: n.title || '', content: n.content || '' };
      analyzedRef.current = n.content || '';
      setMode('edit');
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      if (n.ai_status === 'pending' || n.ai_status === 'running' || n.processing) pollAi(id);
    } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur chargement note'); }
  }, [api]);

  // ── Sauvegarde ───────────────────────────────────────────────────────────
  const saveNote = useCallback(async (explicit: boolean) => {
    if (!note) return;
    setSaving(true);
    try {
      const r = await api('put', `/api/notes/${note.id}`, { title, content, tags: tagList, mentions, notebook_id: note.notebook_id, section_id: note.section_id });
      loadedRef.current = { title, content };
      setNote((prev: any) => ({ ...prev, ...r.data, tags: r.data.tags, mentions: r.data.mentions }));
      if (explicit) flash('success', 'Note enregistrée');
      loadTree();
      loadNotes();
      if (settings.auto_analyze && analyzedRef.current !== content && stripHtml(content).length > 3) {
        analyzedRef.current = content;
        requestAnalysis(note.id);
      }
    } catch (e: any) {
      flash('error', e.response?.data?.message || 'Erreur enregistrement');
    } finally {
      setSaving(false);
    }
  }, [api, note, title, content, tagList, mentions, settings.auto_analyze, loadTree, loadNotes]);

  // Auto-save (débounce) quand le contenu change après chargement.
  useEffect(() => {
    if (!note) return;
    if (title === loadedRef.current.title && content === loadedRef.current.content) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveNote(false); }, 2500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [title, content, note, saveNote]);

  // ── Analyse IA ───────────────────────────────────────────────────────────
  const requestAnalysis = async (id: number) => {
    try {
      await api('post', `/api/notes/${id}/analyze`);
      setNote((prev: any) => (prev && prev.id === id ? { ...prev, ai_status: 'pending', ai_error: null } : prev));
      pollAi(id);
    } catch (e: any) { flash('error', e.response?.data?.message || "Erreur lancement analyse"); }
  };

  const pollAi = (id: number) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    let ticks = 0;
    pollRef.current = window.setInterval(async () => {
      ticks++;
      try {
        const r = await api('get', `/api/notes/${id}/ai-status`);
        const d = r.data;
        // On ne réinjecte pas le titre serveur : l'utilisateur peut être en train
        // de le modifier (l'analyse tourne en arrière-plan après sauvegarde).
        const { title: _serverTitle, ...fields } = d;
        setNote((prev: any) => (prev && prev.id === id ? { ...prev, ...fields, tags: d.tags } : prev));
        if (d.tags) setTagList((d.tags as any[]).map(t => t.tag));
        if (d.ai_status !== 'pending' && d.ai_status !== 'running') {
          window.clearInterval(pollRef.current!); pollRef.current = null;
          loadTree(); loadNotes();
          if (d.ai_status === 'error') flash('error', d.ai_error || 'Analyse IA en erreur');
        }
      } catch { /* ignore */ }
      if (ticks > 200) { window.clearInterval(pollRef.current!); pollRef.current = null; }
    }, 2500);
  };

  const applySuggestion = async () => {
    if (!note) return;
    try {
      await api('post', `/api/notes/${note.id}/apply-suggestion`, { suggestion: note.ai_suggestion });
      await openNote(note.id);
      loadTree(); loadNotes();
      flash('success', 'Classement IA appliqué');
    } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur application'); }
  };

  const useAiVersion = (html: string) => {
    setContent(html);
    setMode('edit');
    setNote((prev: any) => ({ ...prev, content_origin: 'ia' }));
    setTimeout(() => saveNote(true), 50);
  };

  // ── Tâches proposées par l'IA ────────────────────────────────────────────
  const proposeTasks = async () => {
    if (!note) return;
    setTasksLoading(true);
    try {
      const r = await api('post', `/api/notes/${note.id}/propose-tasks`);
      setNote((prev: any) => (prev && prev.id === note.id ? { ...prev, task_suggestions: r.data.tasks } : prev));
      setTasksOpen(true);
    } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur extraction des tâches'); }
    finally { setTasksLoading(false); }
  };

  const refreshTaskSuggestions = async () => {
    if (!note) return;
    try {
      const r = await api('get', `/api/notes/${note.id}`);
      setNote(r.data);
      loadTree();
    } catch { /* ignore */ }
  };

  // ── Créations / suppressions ─────────────────────────────────────────────
  const createNote = async () => {
    try {
      const body: any = {};
      if (selectedSection) body.section_id = selectedSection;
      else if (selectedNotebook) body.notebook_id = selectedNotebook;
      body.title = '';
      body.content = '';
      const r = await api('post', '/api/notes', body);
      await loadTree(); await loadNotes();
      openNote(r.data.id);
    } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur création'); }
  };

  const createNotebook = async () => {
    const name = window.prompt('Nom du nouveau carnet :');
    if (!name) return;
    try { await api('post', '/api/notes/notebooks', { title: name }); loadTree(); } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur'); }
  };

  const createSection = async (notebookId: number) => {
    const name = window.prompt('Nom de la nouvelle section :');
    if (!name) return;
    try { await api('post', '/api/notes/sections', { notebook_id: notebookId, title: name }); loadTree(); } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur'); }
  };

  const deleteNote = async () => {
    if (!note || !window.confirm('Supprimer définitivement cette note ?')) return;
    try {
      await api('delete', `/api/notes/${note.id}`);
      setNote(null); loadTree(); loadNotes();
      flash('success', 'Note supprimée');
    } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur suppression'); }
  };

  const deleteNotebook = async (nb: Notebook) => {
    if (nb.is_inbox) return;
    if (!window.confirm(`Supprimer le carnet « ${nb.title} » ? Ses notes seront conservées mais non classées.`)) return;
    try { await api('delete', `/api/notes/notebooks/${nb.id}`); loadTree(); loadNotes(); setSelectedNotebook(null); setSelectedSection(null); } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur'); }
  };

  const togglePin = async () => {
    if (!note) return;
    try {
      const r = await api('put', `/api/notes/${note.id}`, { is_pinned: !note.is_pinned });
      setNote((prev: any) => ({ ...prev, is_pinned: r.data.is_pinned }));
      loadNotes();
    } catch { /* ignore */ }
  };

  const moveNote = async (notebook_id: number | null, section_id: number | null) => {
    if (!note) return;
    try {
      const r = await api('put', `/api/notes/${note.id}`, { notebook_id, section_id });
      setNote((prev: any) => ({ ...prev, ...r.data }));
      loadTree(); loadNotes();
    } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur déplacement'); }
  };

  // ── Nuage de mots ────────────────────────────────────────────────────────
  const openCloud = async () => {
    setCloudOpen(true); setCloudLoading(true);
    try {
      const params: any = {};
      if (selectedNotebook) params.notebook_id = selectedNotebook;
      if (cloudDays !== '0') params.days = cloudDays;
      const r = await api('get', '/api/notes/wordcloud', params);
      setCloudWords(r.data.words || []);
    } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur nuage'); }
    finally { setCloudLoading(false); }
  };

  useEffect(() => { if (cloudOpen) openCloud(); /* eslint-disable-next-line */ }, [cloudDays]);

  // ── Réorganisation ───────────────────────────────────────────────────────
  const runReorganize = async () => {
    setReorgOpen(true); setReorgLoading(true); setReorgProposal(null); setReorgRaw('');
    try {
      const body: any = {};
      if (selectedNotebook) body.notebook_id = selectedNotebook;
      const r = await api('post', '/api/notes/reorganize', body);
      setReorgProposal(r.data.proposal);
      setReorgRaw(r.data.raw || '');
    } catch (e: any) { flash('error', e.response?.data?.message || "Erreur réorganisation"); }
    finally { setReorgLoading(false); }
  };

  const applyReorganize = async () => {
    if (!reorgProposal) return;
    try {
      const r = await api('post', '/api/notes/apply-classification', { proposal: reorgProposal });
      setReorgOpen(false);
      loadTree(); loadNotes();
      flash('success', `Réorganisation appliquée : ${r.data.moved} note(s) déplacée(s), ${r.data.createdNotebooks} carnet(s) créé(s)`);
    } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur application'); }
  };

  const analyzeAll = async () => {
    try {
      const r = await api('post', '/api/notes/analyze-all', {});
      flash('success', `${r.data.queued} note(s) en file d'analyse IA`);
    } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur'); }
  };

  const restoreVersion = async (versionId: number) => {
    if (!note || !window.confirm('Restaurer cette version ? Le contenu actuel sera conservé dans l\'historique.')) return;
    try { await api('post', `/api/notes/${note.id}/versions/${versionId}/restore`); await openNote(note.id); flash('success', 'Version restaurée'); } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur restauration'); }
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/^#/, '');
    if (t && !tagList.includes(t)) setTagList([...tagList, t]);
    setTagInput('');
  };

  const sortedNotebooks = React.useMemo(() => [...notebooks].sort((a, b) => (b.is_inbox ? 1 : 0) - (a.is_inbox ? 1 : 0)), [notebooks]);
  const activeNotebook = sortedNotebooks.find(n => n.id === selectedNotebook);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-color)' }}>
        <Header />
        <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-color)', display: 'flex', flexDirection: 'column' }}>
      <Header />

      {message && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 5000, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: message.type === 'success' ? '#dcfce7' : '#fee2e2', color: message.type === 'success' ? '#166534' : '#991b1b', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 10px 30px rgba(15,23,42,.15)' }}>
          {message.type === 'success' ? <Check size={15} /> : <AlertCircle size={15} />} {message.text}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0, padding: '16px 16px 0', gap: 14, alignItems: 'stretch', height: 'calc(100vh - 64px)', boxSizing: 'border-box' }}>
        {/* ── Colonne gauche : arborescence ── */}
        <aside style={{ width: 280, flexShrink: 0, background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 14, borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <NotebookPen size={18} color="#2563eb" />
              <h1 style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', margin: 0, flex: 1 }}>Mes Notes</h1>
              <button title="Nouveau carnet" onClick={createNotebook} style={iconBtn}><Plus size={16} /></button>
            </div>
            <button onClick={createNote} style={{ ...primaryBtn, width: '100%', justifyContent: 'center' }}>
              <Plus size={16} /> Nouvelle note
            </button>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <Search size={15} color="#94a3b8" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Rechercher…"
                style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, fontFamily: 'inherit' }} />
              {searchQuery && <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={14} /></button>}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
            <TreeRow active={!selectedNotebook && !selectedTag && !searchQuery} onClick={() => { setSelectedNotebook(null); setSelectedSection(null); setSelectedTag(null); }} icon={<LayoutList size={15} />} label="Toutes les notes" />
            {sortedNotebooks.map(nb => {
              const isOpen = expanded[nb.id] !== false;
              return (
                <div key={nb.id} style={{ marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button onClick={() => setExpanded(e => ({ ...e, [nb.id]: !isOpen }))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}>
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <TreeRow
                      active={selectedNotebook === nb.id && !selectedSection}
                      onClick={() => { setSelectedNotebook(nb.id); setSelectedSection(null); setSelectedTag(null); setExpanded(e => ({ ...e, [nb.id]: true })); }}
                      icon={nb.is_inbox ? <Folder size={15} color="#2563eb" /> : <Folder size={15} />}
                      label={nb.title}
                      count={nb.note_count}
                      color={nb.color}
                      onDelete={nb.is_inbox ? undefined : () => deleteNotebook(nb)}
                      onAdd={() => createSection(nb.id)}
                    />
                  </div>
                  {isOpen && (nb.sections || []).map(sec => (
                    <TreeRow
                      key={sec.id}
                      indent
                      active={selectedSection === sec.id}
                      onClick={() => { setSelectedNotebook(nb.id); setSelectedSection(sec.id); setSelectedTag(null); }}
                      icon={<FileText size={14} />}
                      label={sec.title}
                      count={sec.note_count}
                    />
                  ))}
                </div>
              );
            })}

            {tags.length > 0 && (
              <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Tag size={12} /> Tags
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {tags.map(t => (
                    <button key={t.tag} onClick={() => { setSelectedTag(selectedTag === t.tag ? null : t.tag); setSelectedNotebook(null); setSelectedSection(null); }}
                      style={{ border: 'none', cursor: 'pointer', borderRadius: 20, padding: '3px 10px', fontSize: 11.5, fontWeight: 600, background: selectedTag === t.tag ? '#2563eb' : '#f1f5f9', color: selectedTag === t.tag ? 'white' : '#475569' }}>
                      #{t.tag} <span style={{ opacity: .7 }}>{t.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: 10, borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
            <button onClick={openCloud} style={{ ...ghostBtn, flex: 1, justifyContent: 'center' }}><Cloud size={14} /> Nuage</button>
            <button onClick={analyzeAll} style={{ ...ghostBtn, flex: 1, justifyContent: 'center' }} title="Analyser toutes les notes non analysées"><Sparkles size={14} /> Analyser</button>
            <button onClick={runReorganize} style={{ ...ghostBtn, flex: 1, justifyContent: 'center' }} title="Proposer une réorganisation par l'IA"><Wand2 size={14} /> Réorganiser</button>
          </div>
        </aside>

        {/* ── Colonne médiane : liste des notes ── */}
        <section style={{ width: 330, flexShrink: 0, background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 13, fontWeight: 800, color: '#334155' }}>
            {searchQuery ? `Recherche « ${searchQuery} »` : selectedTag ? `#${selectedTag}` : activeNotebook ? activeNotebook.title : 'Toutes les notes'}
            <span style={{ color: '#94a3b8', fontWeight: 600 }}> · {notes.length}</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {notes.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Aucune note</div>
            ) : notes.map(n => (
              <div key={n.id} onClick={() => openNote(n.id)}
                style={{ padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', background: note?.id === n.id ? '#eff6ff' : 'white', borderLeft: note?.id === n.id ? '3px solid #2563eb' : '3px solid transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  {n.is_pinned ? <Pin size={12} color="#f59e0b" /> : null}
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1e293b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title || 'Sans titre'}</div>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4, maxHeight: 34, overflow: 'hidden' }}>{stripHtml(n.summary_ai || n.excerpt).slice(0, 120) || '—'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <AiBadge status={n.ai_status} size={10} />
                  <span style={{ fontSize: 10.5, color: '#94a3b8' }}>{new Date(n.updated_at).toLocaleDateString('fr-FR')}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Colonne droite : éditeur ── */}
        <section style={{ flex: 1, minWidth: 0, background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!note ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: 12 }}>
              <NotebookPen size={40} opacity={0.4} />
              <div style={{ fontSize: 15, fontWeight: 600 }}>Sélectionnez une note ou créez-en une nouvelle</div>
              <button onClick={createNote} style={primaryBtn}><Plus size={16} /> Nouvelle note</button>
            </div>
          ) : (
            <>
              {/* Barre d'outils */}
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <select value={note.notebook_id || ''} onChange={e => moveNote(e.target.value ? parseInt(e.target.value, 10) : null, null)} style={miniSelect}>
                  {sortedNotebooks.map(nb => <option key={nb.id} value={nb.id}>{nb.title}</option>)}
                </select>
                <select value={note.section_id || ''} onChange={e => moveNote(note.notebook_id, e.target.value ? parseInt(e.target.value, 10) : null)} style={miniSelect}>
                  <option value="">— Section —</option>
                  {(sortedNotebooks.find(nb => nb.id === note.notebook_id)?.sections || []).map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
                <AiBadge status={note.ai_status} />
                {note.processing ? <span style={{ fontSize: 11, color: '#1e40af' }}>en file…</span> : null}
                <div style={{ flex: 1 }} />
                <button onClick={togglePin} title={note.is_pinned ? 'Désépingler' : 'Épingler'} style={iconBtn}>{note.is_pinned ? <PinOff size={15} /> : <Pin size={15} />}</button>
                <button onClick={() => setMode(m => m === 'edit' ? 'preview' : 'edit')} title="Aperçu" style={iconBtn}>{mode === 'edit' ? <Eye size={15} /> : <Pencil size={15} />}</button>
                <button onClick={() => requestAnalysis(note.id)} title="Relancer l'analyse IA" style={iconBtn}><Sparkles size={15} /></button>
                <button onClick={() => saveNote(true)} disabled={saving} style={{ ...primaryBtn, padding: '7px 14px' }}><Save size={15} /> {saving ? '…' : 'Enregistrer'}</button>
                <button onClick={deleteNote} title="Supprimer" style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={15} /></button>
              </div>

              {/* Contenu */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre de la note"
                  style={{ width: '100%', border: 'none', outline: 'none', fontSize: 24, fontWeight: 900, color: '#0f172a', marginBottom: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {tagList.map(t => (
                    <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eff6ff', color: '#1e40af', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                      #{t}
                      <button onClick={() => setTagList(tagList.filter(x => x !== t))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#3b82f6', display: 'flex' }}><X size={12} /></button>
                    </span>
                  ))}
                  <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }} onBlur={addTag}
                    placeholder="+ tag" style={{ border: '1px dashed #cbd5e1', borderRadius: 20, padding: '3px 10px', fontSize: 12, outline: 'none', width: 90 }} />
                </div>

                {mentions.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12, padding: '8px 10px', background: '#f8fafc', borderRadius: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Mentions</span>
                    {mentions.map((m, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'white', border: '1px solid #e2e8f0', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600, color: '#334155' }}>
                        @{m.name} <AgentPresenceBadge email={m.email} name={m.name} size={12} />
                        <button onClick={() => setMentions(mentions.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                )}

                {mode === 'edit' ? (
                  <NoteEditor value={content} onChange={setContent} mentions={mentions} onMentionsChange={setMentions} token={token} />
                ) : (
                  <div className="note-html" style={previewBox} dangerouslySetInnerHTML={{ __html: decorateMentions(content, mentions) }} />
                )}

                {/* Panneau IA */}
                <AiPanel
                  note={note}
                  aiTab={aiTab}
                  setAiTab={setAiTab}
                  onApply={applySuggestion}
                  onUseVersion={useAiVersion}
                  onRetry={() => requestAnalysis(note.id)}
                  onRestore={restoreVersion}
                  decorate={decorateMentions}
                  onOpenTasks={() => setTasksOpen(true)}
                  onProposeTasks={proposeTasks}
                  tasksLoading={tasksLoading}
                />
              </div>
            </>
          )}
        </section>
      </div>

      {/* ── Modale nuage de mots ── */}
      {cloudOpen && (
        <Modal title="Nuage de mots" icon={<Cloud size={18} color="#2563eb" />} onClose={() => setCloudOpen(false)} width={720}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[['0', 'Tout'], ['30', '30 jours'], ['90', '90 jours'], ['365', '1 an']].map(([v, l]) => (
              <button key={v} onClick={() => setCloudDays(v)} style={{ ...ghostBtn, background: cloudDays === v ? '#2563eb' : '#f1f5f9', color: cloudDays === v ? 'white' : '#334155' }}>{l}</button>
            ))}
          </div>
          {cloudLoading ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Calcul…</div> : <WordCloud words={cloudWords} height={360} onWordClick={w => { setCloudOpen(false); setSearchQuery(w); }} />}
        </Modal>
      )}

      {/* ── Modale réorganisation ── */}
      {reorgOpen && (
        <Modal title="Réorganisation proposée par l'IA" icon={<Wand2 size={18} color="#7c3aed" />} onClose={() => setReorgOpen(false)} width={720}>
          {reorgLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /> L'IA analyse vos notes…
            </div>
          ) : reorgProposal?.carnets?.length ? (
            <>
              <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                {(reorgProposal.carnets || []).map((c: any, i: number) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}><Folder size={14} style={{ verticalAlign: -2 }} /> {c.nom}</div>
                    {c.description && <div style={{ fontSize: 12, color: '#64748b', marginLeft: 20 }}>{c.description}</div>}
                    {(c.sections || []).map((s: any, j: number) => (
                      <div key={j} style={{ marginLeft: 20, marginTop: 4, fontSize: 13, color: '#334155' }}>
                        <strong>{s.nom}</strong> <span style={{ color: '#94a3b8' }}>({(s.notes || []).length} note(s))</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button onClick={() => setReorgOpen(false)} style={ghostBtn}>Annuler</button>
                <button onClick={applyReorganize} style={primaryBtn}><Check size={16} /> Appliquer la réorganisation</button>
              </div>
            </>
          ) : (
            <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>
              Aucune proposition exploitable.
              {reorgRaw && <div style={{ marginTop: 12, textAlign: 'left', fontSize: 11, color: '#64748b', maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{reorgRaw.slice(0, 2000)}</div>}
            </div>
          )}
        </Modal>
      )}

      {tasksOpen && note && (
        <NoteTasksModal
          noteId={note.id}
          noteTitle={note.title}
          suggestions={note.task_suggestions || []}
          token={token}
          onClose={() => setTasksOpen(false)}
          onDone={refreshTaskSuggestions}
        />
      )}

      <style>{`
        .note-html { font-size: 14px; color: #334155; line-height: 1.6; }
        .note-html ul, .note-html ol { padding-left: 1.5em; margin: .4em 0; }
        .note-html ul { list-style: disc; } .note-html ol { list-style: decimal; }
        .note-html h1, .note-html h2, .note-html h3 { color: #0f172a; margin: .6em 0 .3em; }
        .note-html a { color: #2563eb; }
        .note-mention { color: #1d4ed8; background: #dbeafe; border-radius: 4px; padding: 0 4px; font-weight: 600; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

// ── Sous-composants ────────────────────────────────────────────────────────
const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 };
const ghostBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12 };
const iconBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', color: '#475569' };
const miniSelect: React.CSSProperties = { padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12.5, color: '#334155', background: 'white', maxWidth: 160 };
const previewBox: React.CSSProperties = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, minHeight: 280 };

function TreeRow({ label, icon, active, onClick, count, indent, color, onDelete, onAdd }: { label: string; icon: React.ReactNode; active?: boolean; onClick: () => void; count?: number; indent?: boolean; color?: string; onDelete?: () => void; onAdd?: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', marginLeft: indent ? 18 : 0, borderRadius: 7, cursor: 'pointer', background: active ? '#eff6ff' : hover ? '#f8fafc' : 'transparent', color: active ? '#1d4ed8' : '#475569', fontSize: 13, fontWeight: active ? 700 : 500, flex: 1, minWidth: 0 }}>
      <span style={{ color: color || (active ? '#2563eb' : '#94a3b8'), flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {typeof count === 'number' && <span style={{ fontSize: 11, color: '#94a3b8' }}>{count}</span>}
      {hover && onAdd && <button onClick={e => { e.stopPropagation(); onAdd(); }} title="Nouvelle section" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><Plus size={12} /></button>}
      {hover && onDelete && <button onClick={e => { e.stopPropagation(); onDelete(); }} title="Supprimer" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex' }}><Trash2 size={12} /></button>}
    </div>
  );
}

function Modal({ title, icon, children, onClose, width = 600 }: { title: string; icon?: React.ReactNode; children: React.ReactNode; onClose: () => void; width?: number }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: width, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
          {icon}
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a', flex: 1 }}>{title}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}

function AiPanel({ note, aiTab, setAiTab, onApply, onUseVersion, onRetry, onRestore, decorate, onOpenTasks, onProposeTasks, tasksLoading }: any) {
  const s = note?.ai_suggestion || {};
  const tabs: [string, string, string | null][] = [
    ['reformule', 'Reformulée', note?.content_ai],
    ['corrige', 'Corrigée', s?.corrige],
    ['original', 'Originale', note?.content],
  ];
  const current = tabs.find(t => t[0] === aiTab)?.[2];
  return (
    <div style={{ marginTop: 20, border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Sparkles size={15} color="#7c3aed" />
        <span style={{ fontWeight: 800, fontSize: 13.5, color: '#0f172a' }}>Assistant IA</span>
        <div style={{ flex: 1 }} />
        <button onClick={onRetry} style={ghostBtn}><RefreshCw size={13} /> Relancer</button>
      </div>
      <div style={{ padding: 14 }}>
        {note?.ai_error && <div style={{ marginBottom: 10, padding: '8px 10px', background: '#fef9c3', color: '#854d0e', borderRadius: 8, fontSize: 12 }}>{note.ai_error}</div>}
        {s?.resume && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Résumé</div>
            <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{s.resume}</div>
          </div>
        )}

        {s && (s.carnet || s.section) && (
          <div style={{ marginBottom: 12, padding: '8px 10px', background: '#eff6ff', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#1e40af', fontWeight: 700 }}>Classement suggéré : {s.carnet}{s.section ? ` › ${s.section}` : ''}</span>
            <div style={{ flex: 1 }} />
            <button onClick={onApply} style={{ ...ghostBtn, background: '#2563eb', color: 'white', border: 'none' }}><Check size={13} /> Appliquer</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {tabs.map(([key, label, html]) => (
            <button key={key} onClick={() => setAiTab(key)} disabled={!html}
              style={{ ...ghostBtn, background: aiTab === key ? '#e0e7ff' : '#f8fafc', color: aiTab === key ? '#3730a3' : '#64748b', opacity: html ? 1 : .45 }}>{label}</button>
          ))}
        </div>
        {current ? (
          <>
            <div className="note-html" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, maxHeight: 260, overflowY: 'auto' }} dangerouslySetInnerHTML={{ __html: decorate(String(current), (note?.mentions || []).map((m: any) => ({ name: m.agent_name, email: m.agent_email }))) }} />
            {aiTab !== 'original' && (
              <button onClick={() => onUseVersion(String(current))} style={{ ...ghostBtn, marginTop: 8 }}><Check size={13} /> Utiliser cette version</button>
            )}
          </>
        ) : <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Aucune version IA disponible. Cliquez sur « Relancer ».</div>}

        {s?.tags?.length ? (
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {s.tags.map((t: string, i: number) => <span key={i} style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', borderRadius: 20, padding: '2px 9px' }}>#{t}</span>)}
          </div>
        ) : null}

        {(() => {
          const ts = (note?.task_suggestions || []) as any[];
          const proposed = ts.filter(t => t.status === 'proposed');
          const accepted = ts.filter(t => t.status === 'accepted');
          return (
            <div style={{ marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Tâches suggérées</span>
                <span style={{ fontSize: 11, fontWeight: 800, background: proposed.length ? '#dbeafe' : '#f1f5f9', color: proposed.length ? '#1e40af' : '#64748b', borderRadius: 20, padding: '1px 8px' }}>{proposed.length}</span>
                {accepted.length > 0 && <span style={{ fontSize: 11.5, color: '#16a34a', fontWeight: 700 }}>✓ {accepted.length} créée(s)</span>}
                <div style={{ flex: 1 }} />
                <button onClick={onProposeTasks} disabled={tasksLoading} style={ghostBtn} title="Détecter les tâches avec l'IA">
                  {tasksLoading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Wand2 size={13} />} {tasksLoading ? 'Analyse…' : 'Détecter'}
                </button>
                {proposed.length > 0 && <button onClick={onOpenTasks} style={{ ...ghostBtn, background: '#2563eb', color: 'white', border: 'none' }}><Check size={13} /> Valider {proposed.length}</button>}
              </div>
              {proposed.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {proposed.slice(0, 5).map((t: any) => (
                    <div key={t.id} style={{ fontSize: 12.5, color: '#334155', display: 'flex', gap: 6 }}>
                      <span style={{ color: '#94a3b8' }}>•</span>
                      <span style={{ flex: 1 }}>{t.description}{t.assignee ? <span style={{ color: '#94a3b8' }}> — {t.assignee}</span> : null}{t.deadline ? <span style={{ color: '#94a3b8' }}> ({t.deadline})</span> : null}</span>
                    </div>
                  ))}
                  {proposed.length > 5 && <div style={{ fontSize: 11.5, color: '#94a3b8' }}>+ {proposed.length - 5} autre(s)…</div>}
                </div>
              ) : <div style={{ fontSize: 12, color: '#94a3b8' }}>Aucune tâche proposée. Cliquez sur « Détecter ».</div>}
            </div>
          );
        })()}

        {note?.versions?.length ? (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <History size={13} /> Historique ({note.versions.length})
            </summary>
            <div style={{ marginTop: 8, maxHeight: 180, overflowY: 'auto' }}>
              {note.versions.map((v: any) => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>{new Date(v.created_at).toLocaleString('fr-FR')}</span>
                  <span style={{ color: '#94a3b8' }}>· {v.origin}</span>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => onRestore(v.id)} style={{ ...ghostBtn, padding: '3px 8px', fontSize: 11 }}>Restaurer</button>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

export default Notes;
