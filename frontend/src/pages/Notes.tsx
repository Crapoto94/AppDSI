import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  Plus, Search, Trash2, Save, Sparkles, RefreshCw, Pin, PinOff, Eye, Pencil, X,
  NotebookPen, Folder, ChevronRight, ChevronDown, FileText, Tag,
  Cloud, Check, AlertCircle, Loader2, History, Wand2, LayoutList,
  Paperclip, Upload, Download, Mail, Send, UserPlus, Users, Share2, ListTree,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import AgentPresenceBadge from '../components/AgentPresenceBadge';
import DocumentPdfViewer from '../components/parapheur/DocumentPdfViewer';
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

/** Le modèle IA renvoie parfois du texte brut : on rétablit les retours à la ligne en HTML. */
function ensureHtml(html?: string | null): string {
  const s = String(html || '');
  if (!s) return '';
  if (/<\/?[a-z][\s\S]*>/i.test(s)) return s;
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function formatSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

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
  const [loading, setLoading] = useState(true);

  const [selectedNotebook, setSelectedNotebook] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const [note, setNote] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentAi, setContentAi] = useState('');
  const [viewVersion, setViewVersion] = useState<'original' | 'ia'>('original');
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
  const [uploading, setUploading] = useState(false);
  const [attPreview, setAttPreview] = useState<any>(null);
  const [classifying, setClassifying] = useState(false);

  const [mailOpen, setMailOpen] = useState(false);
  const [mailRecipients, setMailRecipients] = useState<string[]>([]);
  const [mailInput, setMailInput] = useState('');
  const [mailAgents, setMailAgents] = useState<any[]>([]);
  const [mailSubject, setMailSubject] = useState('');
  const [mailMessage, setMailMessage] = useState('');
  const [mailSending, setMailSending] = useState(false);
  const [mailOk, setMailOk] = useState<string | null>(null);
  const mailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sharedNotes, setSharedNotes] = useState<any[]>([]);
  const [showShared, setShowShared] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shares, setShares] = useState<any[]>([]);
  const [shareInput, setShareInput] = useState('');
  const [shareAgents, setShareAgents] = useState<any[]>([]);
  const [sharing, setSharing] = useState(false);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadedRef = useRef<{ title: string; content: string; contentAi: string }>({ title: '', content: '', contentAi: '' });
  const contentAiRef = useRef('');
  useEffect(() => { contentAiRef.current = contentAi; }, [contentAi]);
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
      await Promise.all([loadTree(), loadNotes(), loadShared()]);
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
      setContentAi(n.content_ai || '');
      // Par défaut : on présente la note REFAITE PAR L'IA si elle existe.
      // Une note encore en cours de rédaction (pas de version IA) s'ouvre
      // directement en édition sur l'originale.
      const hasAi = !!n.content_ai;
      setViewVersion(hasAi ? 'ia' : 'original');
      setTagList((n.tags || []).map((t: any) => t.tag));
      setMentions((n.mentions || []).map((m: any) => ({ name: m.agent_name || '', email: m.agent_email || '' })));
      loadedRef.current = { title: n.title || '', content: n.content || '', contentAi: n.content_ai || '' };
      analyzedRef.current = n.content || '';
      // La note (version courante : prise de note ou version IA) reste toujours
      // éditable ; seule une note PARTAGÉE (non propriétaire) est en lecture seule.
      setMode(n.is_owner === false ? 'preview' : 'edit');
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      if (n.ai_status === 'pending' || n.ai_status === 'running' || n.processing) pollAi(id);
    } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur chargement note'); }
  }, [api]);

  // ── Sauvegarde ───────────────────────────────────────────────────────────
  const saveNote = useCallback(async (explicit: boolean, override?: { title?: string; content?: string; contentAi?: string }) => {
    if (!note) return;
    const t = override?.title !== undefined ? override.title : title;
    const c = override?.content !== undefined ? override.content : content;
    const cAi = override?.contentAi !== undefined ? override.contentAi : contentAi;
    setSaving(true);
    try {
      const r = await api('put', `/api/notes/${note.id}`, { title: t, content: c, content_ai: cAi, tags: tagList, mentions, notebook_id: note.notebook_id, section_id: note.section_id });
      loadedRef.current = { title: t, content: c, contentAi: cAi };
      setNote((prev: any) => ({ ...prev, ...r.data, tags: r.data.tags, mentions: r.data.mentions }));
      if (explicit) flash('success', 'Note enregistrée');
      loadTree();
      loadNotes();
      // L'analyse IA est programmée côté serveur (3 min après la dernière modif) ;
      // pas de nouvelle interrogation IA si la note n'a pas changé.
    } catch (e: any) {
      flash('error', e.response?.data?.message || 'Erreur enregistrement');
    } finally {
      setSaving(false);
    }
  }, [api, note, title, content, contentAi, tagList, mentions, loadTree, loadNotes]);

  // Auto-save (débounce) quand le contenu change après chargement.
  useEffect(() => {
    if (!note) return;
    if (title === loadedRef.current.title && content === loadedRef.current.content && contentAi === loadedRef.current.contentAi) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveNote(false); }, 2500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [title, content, contentAi, note, saveNote]);

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
        // Récupère la version IA sans écraser une éventuelle modification
        // utilisateur en cours sur cette version.
        if (d.content_ai !== undefined && contentAiRef.current === loadedRef.current.contentAi) {
          const nextAi = d.content_ai || '';
          setContentAi(nextAi);
          loadedRef.current = { ...loadedRef.current, contentAi: nextAi };
        }
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
    // La version choisie (reformulée/corrigée) devient la version COURANTE
    // (content_ai), éditable. La note d'origine (content) n'est JAMAIS modifiée.
    setContentAi(html);
    setViewVersion('ia');
    setMode('edit');
    saveNote(true, { contentAi: html });
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

  // ── Pièces jointes ───────────────────────────────────────────────────────
  const refreshAttachments = async () => {
    if (!note) return;
    try {
      const r = await api('get', `/api/notes/${note.id}/attachments`);
      setNote((prev: any) => (prev && prev.id === note.id ? { ...prev, attachments: r.data } : prev));
    } catch { /* ignore */ }
  };

  const uploadFiles = async (fileList: FileList | null) => {
    if (!note || !fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        await api('post', `/api/notes/${note.id}/attachments`, fd);
      }
      await refreshAttachments();
      flash('success', `${files.length} pièce(s) jointe(s) ajoutée(s)`);
    } catch (e: any) {
      flash('error', e.response?.data?.message || "Erreur lors de l'ajout de la pièce jointe");
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (att: any) => {
    if (!note) return;
    if (!window.confirm(`Supprimer la pièce jointe « ${att.original_name || att.filename} » ?`)) return;
    try {
      await api('delete', `/api/notes/${note.id}/attachments/${att.id}`);
      await refreshAttachments();
      flash('success', 'Pièce jointe supprimée');
    } catch (e: any) {
      flash('error', e.response?.data?.message || 'Erreur suppression');
    }
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

  // ── Envoi par mail ───────────────────────────────────────────────────────
  const openMail = () => {
    setMailOpen(true);
    setMailRecipients([]);
    setMailInput('');
    setMailAgents([]);
    setMailSubject(`Note : ${title || note?.title || ''}`);
    setMailMessage('');
    setMailOk(null);
  };

  const searchMailAgents = (q: string) => {
    setMailInput(q);
    if (mailTimer.current) clearTimeout(mailTimer.current);
    if (q.trim().length < 2 || q.includes('@')) { setMailAgents([]); return; }
    mailTimer.current = setTimeout(async () => {
      try {
        const r = await api('get', `/api/notes/agents?q=${encodeURIComponent(q)}`);
        setMailAgents(Array.isArray(r.data) ? r.data.slice(0, 8) : []);
      } catch { setMailAgents([]); }
    }, 300);
  };

  const addMailRecipient = (email: string) => {
    const e = String(email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return;
    setMailRecipients((prev) => (prev.includes(e) ? prev : [...prev, e]));
    setMailInput('');
    setMailAgents([]);
  };

  const doSendMail = async () => {
    if (!note) return;
    const to = [...mailRecipients];
    const pending = mailInput.trim();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pending)) to.push(pending);
    if (!to.length) { flash('error', 'Indiquez au moins un destinataire.'); return; }
    setMailSending(true);
    setMailOk(null);
    try {
      const r = await api('post', `/api/notes/${note.id}/send-mail`, { to, subject: mailSubject, message: mailMessage });
      setMailOk(`Mail envoyé à ${r.data.sent} destinataire(s).`);
      setMailRecipients([]);
      setMailInput('');
    } catch (e: any) {
      flash('error', e.response?.data?.message || "Échec de l'envoi du mail");
    } finally { setMailSending(false); }
  };

  // ── Partage interne ──────────────────────────────────────────────────────
  const loadShared = useCallback(async () => {
    try {
      const r = await api('get', '/api/notes/shared');
      setSharedNotes(Array.isArray(r.data) ? r.data : []);
    } catch { /* ignore */ }
  }, [api]);

  const openShare = async () => {
    if (!note) return;
    setShareOpen(true);
    setShareInput('');
    setShareAgents([]);
    try {
      const r = await api('get', `/api/notes/${note.id}/shares`);
      setShares(Array.isArray(r.data) ? r.data : []);
    } catch { setShares([]); }
  };

  const searchShareAgents = (q: string) => {
    setShareInput(q);
    if (shareTimer.current) clearTimeout(shareTimer.current);
    if (q.trim().length < 2 || q.includes('@')) { setShareAgents([]); return; }
    shareTimer.current = setTimeout(async () => {
      try {
        const r = await api('get', `/api/notes/agents?q=${encodeURIComponent(q)}`);
        setShareAgents(Array.isArray(r.data) ? r.data.slice(0, 8) : []);
      } catch { setShareAgents([]); }
    }, 300);
  };

  const addShare = async (agent: any) => {
    if (!note) return;
    const username = String(agent?.username || '').trim();
    if (!username) return;
    setSharing(true);
    try {
      const r = await api('post', `/api/notes/${note.id}/share`, { shared_with: username, shared_with_email: agent?.email || null });
      setShares(Array.isArray(r.data) ? r.data : []);
      setShareInput(''); setShareAgents([]);
      flash('success', 'Note partagée');
      loadShared();
    } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur partage'); }
    finally { setSharing(false); }
  };

  const removeShare = async (shareId: number) => {
    if (!note) return;
    try {
      await api('delete', `/api/notes/${note.id}/shares/${shareId}`);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
      loadShared();
    } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur'); }
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

  const classifyNow = async () => {
    if (!window.confirm("Demander à l'IA de classer TOUTES vos notes maintenant ?\n(peut prendre un moment)")) return;
    setClassifying(true);
    try {
      const r = await api('post', '/api/notes/classify-now', {});
      loadTree(); loadNotes();
      flash('success', `Classement IA appliqué : ${r.data.moved || 0} note(s) déplacée(s), ${r.data.createdNotebooks || 0} carnet(s) créé(s)`);
    } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur classement IA'); }
    finally { setClassifying(false); }
  };

  const restoreVersion = async (versionId: number) => {
    if (!note || !window.confirm('Restaurer cette version ? Le contenu actuel sera conservé dans l\'historique.')) return;
    try { await api('post', `/api/notes/${note.id}/versions/${versionId}/restore`); await openNote(note.id); flash('success', 'Version restaurée'); } catch (e: any) { flash('error', e.response?.data?.message || 'Erreur restauration'); }
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/^#/, '');
    setTagInput('');
    if (!t) return;
    if (tagList.length >= 8) { flash('error', 'Maximum 8 tags par note'); return; }
    if (!tagList.includes(t)) setTagList([...tagList, t]);
  };

  const sortedNotebooks = React.useMemo(() => [...notebooks].sort((a, b) => (b.is_inbox ? 1 : 0) - (a.is_inbox ? 1 : 0)), [notebooks]);
  const activeNotebook = sortedNotebooks.find(n => n.id === selectedNotebook);
  const editorValue = viewVersion === 'ia' ? contentAi : content;
  const handleEditorChange = useCallback((html: string) => {
    if (viewVersion === 'ia') setContentAi(html); else setContent(html);
  }, [viewVersion]);
  const proposedTasks = ((note?.task_suggestions || []) as any[]).filter((t: any) => t.status === 'proposed');
  const isOwner = note ? note.is_owner !== false : true;

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
            <TreeRow active={!selectedNotebook && !selectedTag && !searchQuery && !showShared} onClick={() => { setSelectedNotebook(null); setSelectedSection(null); setSelectedTag(null); setShowShared(false); }} icon={<LayoutList size={15} />} label="Toutes les notes" />
            <TreeRow active={showShared} onClick={() => { setShowShared(true); setSelectedNotebook(null); setSelectedSection(null); setSelectedTag(null); setSearchQuery(''); }} icon={<Users size={15} />} label="Partagées avec moi" count={sharedNotes.length} />
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
                      onClick={() => { setSelectedNotebook(nb.id); setSelectedSection(null); setSelectedTag(null); setShowShared(false); setExpanded(e => ({ ...e, [nb.id]: true })); }}
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
                      onClick={() => { setSelectedNotebook(nb.id); setSelectedSection(sec.id); setSelectedTag(null); setShowShared(false); }}
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
                    <button key={t.tag} onClick={() => { setSelectedTag(selectedTag === t.tag ? null : t.tag); setSelectedNotebook(null); setSelectedSection(null); setShowShared(false); }}
                      style={{ border: 'none', cursor: 'pointer', borderRadius: 20, padding: '3px 10px', fontSize: 11.5, fontWeight: 600, background: selectedTag === t.tag ? '#2563eb' : '#f1f5f9', color: selectedTag === t.tag ? 'white' : '#475569' }}>
                      #{t.tag} <span style={{ opacity: .7 }}>{t.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: 10, borderTop: '1px solid #f1f5f9', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={openCloud} style={{ ...ghostBtn, flex: '1 1 30%', justifyContent: 'center' }}><Cloud size={14} /> Nuage</button>
            <button onClick={analyzeAll} style={{ ...ghostBtn, flex: '1 1 30%', justifyContent: 'center' }} title="Analyser toutes les notes non analysées"><Sparkles size={14} /> Analyser</button>
            <button onClick={classifyNow} disabled={classifying} style={{ ...ghostBtn, flex: '1 1 30%', justifyContent: 'center' }} title="Demander à l'IA de classer toutes les notes">
              {classifying ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ListTree size={14} />} {classifying ? 'Classement…' : 'Classement IA'}
            </button>
            <button onClick={runReorganize} style={{ ...ghostBtn, flex: '1 1 100%', justifyContent: 'center' }} title="Proposer une réorganisation par l'IA"><Wand2 size={14} /> Réorganiser (aperçu)</button>
          </div>
        </aside>

        {/* ── Colonne médiane : liste des notes ── */}
        <section style={{ width: 330, flexShrink: 0, background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 13, fontWeight: 800, color: '#334155' }}>
            {showShared ? 'Partagées avec moi' : searchQuery ? `Recherche « ${searchQuery} »` : selectedTag ? `#${selectedTag}` : activeNotebook ? activeNotebook.title : 'Toutes les notes'}
            <span style={{ color: '#94a3b8', fontWeight: 600 }}> · {(showShared ? sharedNotes : notes).length}</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {(showShared ? sharedNotes : notes).length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>{showShared ? 'Aucune note partagée avec vous' : 'Aucune note'}</div>
            ) : (showShared ? sharedNotes : notes).map(n => (
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
                  {showShared && n.shared_by_name && <span style={{ fontSize: 10.5, color: '#6366f1' }}>· de {n.shared_by_name}</span>}
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
                <select value={note.notebook_id || ''} disabled={!isOwner} onChange={e => moveNote(e.target.value ? parseInt(e.target.value, 10) : null, null)} style={{ ...miniSelect, opacity: isOwner ? 1 : 0.6 }}>
                  {sortedNotebooks.map(nb => <option key={nb.id} value={nb.id}>{nb.title}</option>)}
                </select>
                <select value={note.section_id || ''} disabled={!isOwner} onChange={e => moveNote(note.notebook_id, e.target.value ? parseInt(e.target.value, 10) : null)} style={{ ...miniSelect, opacity: isOwner ? 1 : 0.6 }}>
                  <option value="">— Section —</option>
                  {(sortedNotebooks.find(nb => nb.id === note.notebook_id)?.sections || []).map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
                <AiBadge status={note.ai_status} />
                {note.processing ? <span style={{ fontSize: 11, color: '#1e40af' }}>en file…</span> : null}
                {!isOwner && <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700 }}><Users size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Partagée par {note.shared_by_name || note.shared_by} — lecture seule</span>}
                <div style={{ display: 'inline-flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }} title="Version affichée">
                  <button onClick={() => setViewVersion('ia')} disabled={!contentAi}
                    style={{ border: 'none', cursor: contentAi ? 'pointer' : 'not-allowed', padding: '5px 10px', fontSize: 11.5, fontWeight: 700, background: viewVersion === 'ia' ? '#7c3aed' : '#f8fafc', color: viewVersion === 'ia' ? 'white' : (contentAi ? '#475569' : '#cbd5e1') }}>
                    <Sparkles size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Version IA
                  </button>
                  <button onClick={() => setViewVersion('original')}
                    style={{ border: 'none', cursor: 'pointer', padding: '5px 10px', fontSize: 11.5, fontWeight: 700, background: viewVersion === 'original' ? '#334155' : '#f8fafc', color: viewVersion === 'original' ? 'white' : '#475569' }}>
                    Originale
                  </button>
                </div>
                <div style={{ flex: 1 }} />
                {isOwner ? (
                  <>
                    <button onClick={togglePin} title={note.is_pinned ? 'Désépingler' : 'Épingler'} style={iconBtn}>{note.is_pinned ? <PinOff size={15} /> : <Pin size={15} />}</button>
                    <button onClick={() => setMode(m => m === 'edit' ? 'preview' : 'edit')} title="Aperçu / Édition" style={iconBtn}>{mode === 'edit' ? <Eye size={15} /> : <Pencil size={15} />}</button>
                    <button onClick={() => requestAnalysis(note.id)} title="Relancer l'analyse IA" style={iconBtn}><Sparkles size={15} /></button>
                    <button onClick={openMail} title="Envoyer la note par mail" style={iconBtn}><Mail size={15} /></button>
                    <button onClick={openShare} title="Partager la note" style={iconBtn}><Share2 size={15} /></button>
                    <button onClick={() => saveNote(true)} disabled={saving} style={{ ...primaryBtn, padding: '7px 14px' }}><Save size={15} /> {saving ? '…' : 'Enregistrer'}</button>
                    <button onClick={deleteNote} title="Supprimer" style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={15} /></button>
                  </>
                ) : (
                  <button onClick={() => setMode('preview')} title="Lecture seule" style={iconBtn}><Eye size={15} /></button>
                )}
              </div>

              {/* Contenu */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
                {proposedTasks.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 14, flexWrap: 'wrap' }}>
                    <Sparkles size={17} color="#2563eb" />
                    <span style={{ fontSize: 13.5, color: '#1e40af', fontWeight: 700 }}>
                      {proposedTasks.length} action{proposedTasks.length > 1 ? 's' : ''} à mener identifiée{proposedTasks.length > 1 ? 's' : ''} par l'IA
                    </span>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => setTasksOpen(true)} style={{ ...primaryBtn, padding: '7px 14px' }}>
                      <Check size={15} /> Proposer {proposedTasks.length} tâche{proposedTasks.length > 1 ? 's' : ''} à l'application
                    </button>
                  </div>
                )}
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

                {/* Pièces jointes */}
                <div style={{ marginBottom: 14, border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: (note.attachments || []).length ? 8 : 0 }}>
                    <Paperclip size={15} color="#64748b" />
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Pièces jointes</span>
                    <span style={{ fontSize: 11, fontWeight: 800, background: '#e2e8f0', color: '#475569', borderRadius: 20, padding: '1px 8px' }}>{(note.attachments || []).length}</span>
                    <div style={{ flex: 1 }} />
                    <label style={{ ...ghostBtn, cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.7 : 1 }}>
                      {uploading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />}
                      {uploading ? 'Envoi…' : 'Ajouter'}
                      <input type="file" multiple style={{ display: 'none' }} disabled={uploading}
                        onChange={e => { uploadFiles(e.target.files); e.currentTarget.value = ''; }} />
                    </label>
                  </div>
                  {(note.attachments || []).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(note.attachments || []).map((a: any) => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px' }}>
                          {String(a.mimetype || '').startsWith('image/') && a.public_url
                            ? <img src={a.public_url} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                            : <FileText size={18} color="#64748b" style={{ flexShrink: 0 }} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.original_name || a.filename}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{formatSize(a.size)}{a.mimetype ? ` · ${a.mimetype}` : ''}</div>
                          </div>
                          {(String(a.mimetype || '').includes('pdf') || String(a.mimetype || '').startsWith('image/')) && (
                            <button onClick={() => setAttPreview(a)} title="Prévisualiser" style={iconBtn}><Eye size={14} /></button>
                          )}
                          <a href={a.public_url || a.url} download={a.original_name || a.filename} title="Télécharger" style={{ ...iconBtn, textDecoration: 'none' }}><Download size={14} /></a>
                          <button onClick={() => removeAttachment(a)} title="Supprimer" style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {mode === 'edit' ? (
                  <NoteEditor
                    value={editorValue}
                    onChange={handleEditorChange}
                    mentions={mentions}
                    onMentionsChange={setMentions}
                    token={token}
                    placeholder={viewVersion === 'ia' ? 'Note reformulée par IA (vous pouvez la corriger)…' : undefined}
                  />
                ) : (
                  <div className="note-html" style={previewBox} dangerouslySetInnerHTML={{ __html: decorateMentions(ensureHtml(editorValue), mentions) }} />
                )}
                {mode === 'preview' && viewVersion === 'ia' && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={13} /> Version reformulée par l'IA — la note originale reste intégralement conservée.
                  </div>
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

      {mailOpen && note && (
        <Modal title="Envoyer la note par mail" icon={<Mail size={18} color="#0e7490" />} onClose={() => setMailOpen(false)} width={620}>
          <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 12 }}>
            Note : <strong>{title || note.title}</strong> — contenu envoyé : version IA si disponible, sinon la note d'origine.
          </div>

          <label style={mailLbl}>Destinataires (recherche d'agent ou adresse libre)</label>
          {mailRecipients.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {mailRecipients.map((r) => (
                <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                  {r}
                  <button onClick={() => setMailRecipients((prev) => prev.filter((x) => x !== r))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6366f1', display: 'flex' }}><X size={11} /></button>
                </span>
              ))}
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <input
              value={mailInput}
              onChange={(e) => searchMailAgents(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',' || e.key === ';') { e.preventDefault(); addMailRecipient(mailAgents[0]?.email || mailInput); } }}
              placeholder="Nom, prénom ou adresse e-mail…"
              style={mailInputStyle}
            />
            {mailAgents.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #c7d2fe', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 10, maxHeight: 200, overflowY: 'auto', marginTop: 2 }}>
                {mailAgents.map((u, i) => (
                  <div key={u.email || u.username || i} onClick={() => addMailRecipient(u.email || '')}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#eef2ff')} onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}>
                    <UserPlus size={13} color="#4338ca" />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{u.displayName || u.email}</div>
                      {u.email && <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.email}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label style={{ ...mailLbl, marginTop: 14 }}>Objet</label>
          <input value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} style={mailInputStyle} />

          <label style={{ ...mailLbl, marginTop: 14 }}>Message</label>
          <textarea value={mailMessage} onChange={(e) => setMailMessage(e.target.value)} rows={4}
            placeholder="Message (facultatif)…"
            style={{ ...mailInputStyle, resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }} />

          {mailOk && <div style={{ marginTop: 12, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{mailOk}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button onClick={() => setMailOpen(false)} style={ghostBtn}>Fermer</button>
            <button onClick={doSendMail} disabled={mailSending} style={primaryBtn}>
              {mailSending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />} {mailSending ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        </Modal>
      )}

      {shareOpen && note && (
        <Modal title="Partager la note" icon={<Share2 size={18} color="#4338ca" />} onClose={() => setShareOpen(false)} width={560}>
          <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 12 }}>
            Partage interne à la collectivité. La note apparaîtra chez l'agent dans « Partagées avec moi » (lecture seule).
          </div>
          <label style={mailLbl}>Ajouter un agent</label>
          <div style={{ position: 'relative' }}>
            <input
              value={shareInput}
              onChange={(e) => searchShareAgents(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addShare(shareAgents[0]); } }}
              placeholder="Nom ou prénom de l'agent…"
              style={mailInputStyle}
            />
            {shareAgents.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #c7d2fe', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 10, maxHeight: 200, overflowY: 'auto', marginTop: 2 }}>
                {shareAgents.map((u, i) => (
                  <div key={u.username || u.email || i} onClick={() => addShare(u)}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#eef2ff')} onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}>
                    <UserPlus size={13} color="#4338ca" />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{u.displayName || u.email}</div>
                      {u.email && <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.email}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {shares.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={mailLbl}>Partagée avec ({shares.length})</div>
              {shares.map((s: any) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 6 }}>
                  <Users size={14} color="#6366f1" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.shared_with_email || s.shared_with}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.shared_with}</div>
                  </div>
                  <button onClick={() => removeShare(s.id)} style={{ ...iconBtn, color: '#dc2626' }} title="Retirer le partage"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={() => setShareOpen(false)} style={ghostBtn}>Fermer</button>
          </div>
        </Modal>
      )}

      {attPreview && note && String(attPreview.mimetype || '').includes('pdf') && (
        <DocumentPdfViewer
          open
          url={`/api/notes/${note.id}/attachments/${attPreview.id}/download?inline=1`}
          authToken={token}
          title={attPreview.original_name || attPreview.filename}
          onClose={() => setAttPreview(null)}
        />
      )}
      {attPreview && String(attPreview.mimetype || '').startsWith('image/') && (
        <Modal title={attPreview.original_name || attPreview.filename} icon={<Paperclip size={18} />} onClose={() => setAttPreview(null)} width={840}>
          <img src={attPreview.public_url || attPreview.url} alt="" style={{ maxWidth: '100%', maxHeight: '75vh', display: 'block', margin: '0 auto', borderRadius: 8 }} />
        </Modal>
      )}

      <style>{`
        .note-html { font-size: 14px; color: #334155; line-height: 1.6; }
        .note-html ul, .note-html ol { padding-left: 1.5em; margin: .4em 0; }
        .note-html ul { list-style: disc; } .note-html ol { list-style: decimal; }
        .note-html h1, .note-html h2, .note-html h3 { color: #0f172a; margin: .6em 0 .3em; }
        .note-html a { color: #2563eb; }
        .note-mention { color: #1d4ed8; background: #dbeafe; border-radius: 4px; padding: 0 4px; font-weight: 600; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes noteRecPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(1.35); } }
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
const mailLbl: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 };
const mailInputStyle: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13.5, boxSizing: 'border-box', outline: 'none' };

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
    ['original', "Note d'origine", note?.content_original || note?.content],
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
            <div className="note-html" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, maxHeight: 260, overflowY: 'auto' }} dangerouslySetInnerHTML={{ __html: decorate(ensureHtml(String(current)), (note?.mentions || []).map((m: any) => ({ name: m.agent_name, email: m.agent_email }))) }} />
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
