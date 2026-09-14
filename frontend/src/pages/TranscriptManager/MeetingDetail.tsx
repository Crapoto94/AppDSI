import React, { useEffect, useState, useRef } from 'react';
import Header from '../../components/Header';
import TranscriptAgentHeader from '../../components/TranscriptAgentHeader';
import {
    ArrowLeft, Calendar, Clock,
    CheckCircle2, Circle, RefreshCw,
    MessageSquare, ListTodo, FileText, Search, Users, Share2, Building2, CheckCircle, UserCheck,
    Paperclip, Upload, Trash2, Bot, Mail, Send, X
} from 'lucide-react';
import AgentPresenceBadge from '../../components/AgentPresenceBadge';
import TaskValidationModal from '../../components/TaskValidationModal';
import type { DsiAgent } from '../../components/TaskValidationModal';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { marked } from 'marked';
import TurndownService from 'turndown';
import * as turndownGfm from 'turndown-plugin-gfm';
import { useADSearch } from '../../utils/useADSearch';

// Édition de l'amendement en WYSIWYG (react-quill-new, comme l'éditeur de
// commentaires des tickets) : l'amendeur ne doit jamais voir de Markdown brut.
// On convertit Markdown -> HTML (marked) pour alimenter l'éditeur, puis
// HTML -> Markdown (turndown) à la validation/au brouillon — le Markdown
// reste le format de stockage côté backend (diff, rendu final, IA...).
const turndownService = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
turndownService.use(turndownGfm.gfm); // tableaux, ~~barré~~, listes à cocher
// turndown-plugin-gfm ne convertit un <table> en tableau Markdown QUE si sa
// première ligne est faite de <th> — jamais le cas pour un tableau collé
// depuis Word (ni pour les tableaux Quill, qui n'utilisent que <td>) : il
// reste alors en HTML brut, invisible une fois republié. On force donc la
// première ligne en en-tête avant la conversion (cf. promoteTableHeaders).
turndownService.addRule('emptyParagraph', {
    // Une ligne vide dans l'éditeur (Entrée sans texte) doit rester une ligne
    // vide visible à la republication — en Markdown, une ligne blanche est
    // juste un séparateur de paragraphe (aucune ligne blanche « en trop »
    // n'est représentable) : on la remplace donc par un espace insécable,
    // qui forme un paragraphe à part entière (donc une ligne vide visible)
    // aussi bien pour marked (mail) que pour ReactMarkdown (app).
    filter: (node) => node.nodeName === 'P' && node.textContent.replace(/ /g, '').trim() === '',
    replacement: () => '\n\n&nbsp;\n\n',
});
const promoteTableHeaders = (html: string) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('table').forEach(table => {
        const firstRow = table.rows[0];
        if (!firstRow || firstRow.cells.length === 0) return;
        if (Array.from(firstRow.cells).every(c => c.tagName === 'TH')) return; // déjà un en-tête
        Array.from(firstRow.cells).forEach(cell => {
            const th = doc.createElement('th');
            th.innerHTML = cell.innerHTML;
            cell.replaceWith(th);
        });
    });
    return doc.body.innerHTML;
};
// react-markdown filtre par défaut les URLs "data:" (protection XSS générique)
// — ce qui supprimait silencieusement les images collées (data URI base64)
// à l'affichage, alors qu'elles s'éditaient normalement dans Quill (qui ne
// filtre rien). On laisse passer explicitement les data URI d'image.
const markdownUrlTransform = (url: string) => /^data:image\//i.test(url) ? url : defaultUrlTransform(url);
const mdToHtml = (md: string) => marked.parse(md || '', { breaks: true }) as string;
// Quill (comme tout contentEditable) substitue couramment de vrais espaces
// insécables (U+00A0) aux espaces normaux pour empêcher leur suppression au
// rendu — Turndown les recopie tels quels dans le Markdown. Résultat : le CR
// stocké se remplissait progressivement de VRAIS caractères insécables (pas
// juste l'entité "&nbsp;", indétectable à l'œil ou par une recherche de
// texte) à chaque passage par l'éditeur riche — l'ancien Outlook les traite
// comme réellement infranchissables, d'où le débordement. On les renormalise
// systématiquement en espaces normaux ; ne touche pas notre propre usage de
// l'entité littérale "&nbsp;" (texte, pas ce caractère) pour les lignes vides.
const htmlToMd = (html: string) => turndownService.turndown(promoteTableHeaders(html || '')).replace(/ /g, ' ').trim();
// `table: true` : sans ça, Quill ne reconnaît pas le <table> collé depuis Word/
// Excel et le réduit à du texte en vrac — la mise en forme n'est pas éditable
// via la barre d'outils (hors scope « fonctions de base ») mais le tableau
// collé s'affiche et se convertit correctement en Markdown à la validation.
const AMEND_QUILL_MODULES = { toolbar: [[{ header: [2, 3, false] }], ['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']], table: true };

// Quill ne gère nativement que le collage d'un <img> déjà présent dans le
// HTML du presse-papiers — pas le collage d'une image « brute » (fichier)
// comme lors d'un Ctrl+C d'une capture d'écran ou d'une image Word : on
// l'intercepte nous-mêmes et on l'insère en data URI (base64).
function attachImagePasteHandler(quill: { root: HTMLElement; getSelection: (focus?: boolean) => { index: number } | null; getLength: () => number; insertEmbed: (index: number, type: string, value: unknown) => void; setSelection: (index: number, length: number) => void }) {
    const handler = (e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (!file) continue;
                e.preventDefault();
                const reader = new FileReader();
                reader.onload = () => {
                    const range = quill.getSelection(true);
                    const index = range ? range.index : quill.getLength();
                    quill.insertEmbed(index, 'image', reader.result);
                    quill.setSelection(index + 1, 0);
                };
                reader.readAsDataURL(file);
                break;
            }
        }
    };
    quill.root.addEventListener('paste', handler);
    return () => quill.root.removeEventListener('paste', handler);
}

interface Cue {
    id: number;
    speaker_name: string;
    speaker_username?: string;
    speaker_email?: string;
    start_seconds: number;
    text: string;
}

interface Meeting {
    id: number;
    title: string;
    meeting_date: string;
    summary: string;
    created_at: string;
    cues: Cue[];
    shared_with_direction?: string | null;
    shared_with_service?: string | null;
    summary_edited_by?: string | null;
    summary_edited_at?: string | null;
    summary_requester?: string | null;
    summary_model?: string | null;
    summary_requested_at?: string | null;
    summary_last_send?: {
        sent_at: string | null;
        sent_by: string | null;
        recipients: string | null;
        sent_count: number | null;
        failed_count: number | null;
    } | null;
    summary_notice?: string;
    summary_amendments?: Amendment[];
    summary_amended_markdown?: string | null;
}

interface Amendment {
    id: number;
    username: string;
    name: string;
    color: string;
    created_at: string;
}

interface Task {
    id: number;
    description: string;
    assignee: string;
    requester: string;
    deadline: string;
    is_completed: boolean;
    start_seconds?: number;
    origin?: string;
    assignee_username?: string | null;
    assignee_match_score?: number | null;
    app_task_id?: number | null;
    added_by_name?: string | null;
    added_by_color?: string | null;
    deleted_at?: string | null;
    deleted_by_name?: string | null;
    deleted_by_color?: string | null;
}

interface Attachment {
    id: number;
    filename: string;
    original_name: string;
    mimetype?: string;
    size?: number;
    uploaded_by?: string;
    created_at?: string;
}

interface AxiosErrorLike {
    response?: { status?: number; data?: { error?: string } };
    code?: string;
    message?: string;
}

const participantInputStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, border: '1px solid #E2E8F0', borderRadius: 6,
    padding: '2px 6px', fontSize: '0.72rem', outline: 'none', background: '#FFFFFF',
};

// Retire le bloc « ## META » : on ne l'édite jamais à la main, il est réappliqué
// automatiquement par le backend à l'enregistrement.
const stripSummaryMetaClient = (text: string) =>
    String(text || '').replace(/## META[\s\S]*$/m, '').replace(/\s+$/m, '');

// Toujours convertir vers l'heure d'Ivry-sur-Seine explicitement plutôt que de
// dépendre du fuseau horaire par défaut de l'environnement (navigateur mal
// réglé, ou — côté mail — conteneur serveur en UTC) : sans cela, les horaires
// affichés glissaient de 1h ou 2h (été/hiver) par rapport à l'heure locale réelle.
const PARIS_TZ = 'Europe/Paris';
const fmtDateTime = (d?: string | number | Date | null) => d ? new Date(d).toLocaleString('fr-FR', { timeZone: PARIS_TZ }) : '';
const fmtDate = (d?: string | number | Date | null) => d ? new Date(d).toLocaleDateString('fr-FR', { timeZone: PARIS_TZ }) : '';

const MeetingDetail: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token, user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [meeting, setMeeting] = useState<Meeting | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [genElapsed, setGenElapsed] = useState(0); // secondes écoulées depuis le clic sur "Générer"
    const genTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Un proxy réseau intermédiaire peut couper la connexion avant que le
    // backend n'ait fini (constaté : le résumé finit par être enregistré
    // malgré l'erreur affichée au client). Dans ce cas, on vérifie
    // périodiquement si le résultat arrive quand même plutôt que de laisser
    // l'utilisateur croire à un échec pur et simple.
    const [isPollingAfterError, setIsPollingAfterError] = useState(false);
    const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editValues, setEditValues] = useState({ title: '', meeting_date: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [showAllSpeakers, setShowAllSpeakers] = useState(false);
    const [transcriptSearch, setTranscriptSearch] = useState("");
    const [speakerFilter, setSpeakerFilter] = useState<string>("");

    // Pièces jointes de la réunion (stockées via shared/storage.js → /GED)
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
    const attachmentInputRef = useRef<HTMLInputElement>(null);

    // Génération IA (APM) : choix du modèle + rapprochement agents DSI.
    // Le modèle par défaut vient de l'admin (transcript_apm_default_model) —
    // pas de mémorisation par navigateur, pour que le réglage admin s'applique
    // à chaque chargement ; le choix fait ici via le sélecteur ne vaut que
    // pour cette génération.
    const [aiModels, setAiModels] = useState<string[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [modelsError, setModelsError] = useState('');
    const [aiSource, setAiSource] = useState<'apm' | 'local'>('apm');
    const [dsiAgents, setDsiAgents] = useState<DsiAgent[]>([]);
    const [showTaskValidation, setShowTaskValidation] = useState(false);
    // Envoi du résumé IA par mail
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailParticipants, setEmailParticipants] = useState<{ email: string; name: string; internal: boolean; fonction?: string | null; direction?: string | null; service?: string | null }[]>([]);
    const [emailSelected, setEmailSelected] = useState<Set<string>>(new Set());
    const [emailExtra, setEmailExtra] = useState('');
    const [emailMessage, setEmailMessage] = useState('');
    const [emailSending, setEmailSending] = useState(false);
    const [emailResult, setEmailResult] = useState<{ sent: number; failed: number } | null>(null);
    const [emailError, setEmailError] = useState('');
    const [isEditingSummary, setIsEditingSummary] = useState(false);
    const [summaryDraft, setSummaryDraft] = useState("");
    const summaryQuillRef = useRef<ReactQuill>(null);
    const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
    const [taskDraft, setTaskDraft] = useState({ description: '', assignee: '', requester: '', deadline: '' });
    const transcriptRef = useRef<HTMLDivElement>(null);

    // Amendement du CR (ajout/suppression de tâches + correction du texte,
    // par tout destinataire interne du mail — pas seulement l'admin/owner).
    const [amendAccess, setAmendAccess] = useState<{
        allowed: boolean; color?: string; name?: string; draft?: string | null; draft_updated_at?: string | null;
        recipients?: { email: string; name: string; internal: boolean }[]; isAdmin?: boolean;
    }>({ allowed: false });
    // Modale de validation des amendements : ajout (tout amendeur) / retrait
    // (admin uniquement) de destinataires à la boucle de diffusion, avant
    // envoi effectif — cf. handleAmendValidateClick / submitAmendment.
    const [pendingAddRecipients, setPendingAddRecipients] = useState<{ email: string; name: string }[]>([]);
    const [pendingRemoveEmails, setPendingRemoveEmails] = useState<Set<string>>(new Set());
    const [manualRecipientEmail, setManualRecipientEmail] = useState('');
    const recipientAd = useADSearch(token);
    const [showAddTask, setShowAddTask] = useState(false);
    const [newTaskDraft, setNewTaskDraft] = useState({ description: '', assignee: '', requester: '', deadline: '' });
    const [isAddingTask, setIsAddingTask] = useState(false);
    const [deletedTasks, setDeletedTasks] = useState<Task[] | null>(null);
    const [showDeletedTasks, setShowDeletedTasks] = useState(false);
    const [isEditingAmend, setIsEditingAmend] = useState(false);
    const [amendEditorHtml, setAmendEditorHtml] = useState(''); // contenu WYSIWYG (HTML) — jamais de MD affiché
    const amendQuillRef = useRef<ReactQuill>(null);
    const [isAmending, setIsAmending] = useState(false);
    const [amendMessage, setAmendMessage] = useState('');
    const [showSendConfirmModal, setShowSendConfirmModal] = useState(false);
    const [showAmendedContent, setShowAmendedContent] = useState(false);

    // Sharing state
    const [orgDirections, setOrgDirections] = useState<{ code: string; label: string }[]>([]);
    const [orgServices, setOrgServices] = useState<{ code: string; label: string }[]>([]);
    const [shareDirection, setShareDirection] = useState('');
    const [shareService, setShareService] = useState('');
    const [isSharingMode, setIsSharingMode] = useState<'direction' | 'service' | ''>('');
    const [shareSaved, setShareSaved] = useState(false);
    const [isSavingShare, setIsSavingShare] = useState(false);

    useEffect(() => {
        fetchData();
    }, [id, token]);

    // Collage d'image (capture d'écran, image Word...) dans l'un ou l'autre
    // éditeur riche — Quill ne le gère pas nativement (cf. attachImagePasteHandler).
    useEffect(() => {
        if (!isEditingAmend) return;
        const editor = amendQuillRef.current?.getEditor();
        if (!editor) return;
        return attachImagePasteHandler(editor);
    }, [isEditingAmend]);

    useEffect(() => {
        if (!isEditingSummary) return;
        const editor = summaryQuillRef.current?.getEditor();
        if (!editor) return;
        return attachImagePasteHandler(editor);
    }, [isEditingSummary]);

    // Sécurité : si on navigue hors de la page en pleine génération, on ne
    // laisse pas le compteur — ni le sondage post-erreur — tourner dans le vide.
    useEffect(() => () => {
        if (genTimerRef.current) clearInterval(genTimerRef.current);
        if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    }, []);

    useEffect(() => {
        if (!token) return;
        axios.get('/api/transcriptmanager/ai/models', { headers: { Authorization: `Bearer ${token}` } })
            .then(res => {
                const models: string[] = res.data?.models || [];
                const defaultModel: string = res.data?.defaultModel || '';
                setAiModels(models);
                setAiSource(res.data?.source === 'local' ? 'local' : 'apm');
                setModelsError('');
                setSelectedModel(prev => {
                    if (prev && models.includes(prev)) return prev;
                    return (defaultModel && models.includes(defaultModel)) ? defaultModel : (models[0] || '');
                });
            })
            .catch(err => {
                console.error(err);
                setModelsError(err?.response?.data?.error || "Impossible de charger les modèles IA. Vérifier la configuration dans /admin (section IA) et /admin/infra.");
            });

        axios.get('/api/calendrier-dsi/agents', { headers: { Authorization: `Bearer ${token}` } })
            .then(res => setDsiAgents(res.data || []))
            .catch(err => console.error(err));
    }, [token]);

    const fetchData = async () => {
        if (!token || !id) return;
        try {
            const [mRes, tRes, aRes, amendRes] = await Promise.all([
                axios.get(`/api/transcriptmanager/meeting/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`/api/transcriptmanager/tasks?meeting_id=${id}`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`/api/transcriptmanager/meeting/${id}/attachments`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`/api/transcriptmanager/meeting/${id}/amend-access`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { allowed: false } })),
            ]);
            setMeeting(mRes.data);
            setEditValues({
                title: mRes.data.title || '',
                meeting_date: mRes.data.meeting_date ? new Date(mRes.data.meeting_date).toISOString().split('T')[0] : new Date(mRes.data.created_at).toISOString().split('T')[0]
            });
            setTasks(tRes.data);
            setAttachments(aRes.data || []);
            setAmendAccess(amendRes.data || { allowed: false });
            // Init sharing state from existing meeting data
            const existingDir = mRes.data.shared_with_direction || '';
            const existingService = mRes.data.shared_with_service || '';
            setShareDirection(existingDir);
            setShareService(existingService);
            if (existingService) setIsSharingMode('service');
            else if (existingDir) setIsSharingMode('direction');
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const loadOrgDirections = async () => {
        try {
            const res = await axios.get('/api/consumable/org-directions', { headers: { Authorization: `Bearer ${token}` } });
            setOrgDirections(res.data);
        } catch (err) { console.error(err); }
    };

    const loadOrgServices = async (directionLabel: string) => {
        if (!directionLabel) { setOrgServices([]); return; }
        const dir = orgDirections.find(d => d.label === directionLabel);
        if (!dir) return;
        try {
            const res = await axios.get(`/api/consumable/org-services/${encodeURIComponent(dir.code)}`, { headers: { Authorization: `Bearer ${token}` } });
            setOrgServices(res.data);
        } catch (err) { console.error(err); }
    };

    const handleSaveSharing = async () => {
        if (!id || !token) return;
        setIsSavingShare(true);
        try {
            const payload = isSharingMode === 'direction'
                ? { shared_with_direction: shareDirection || null, shared_with_service: null }
                : isSharingMode === 'service'
                ? { shared_with_direction: null, shared_with_service: shareService || null }
                : { shared_with_direction: null, shared_with_service: null };
            await axios.put(`/api/transcriptmanager/meeting/${id}`, payload, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMeeting(m => m ? { ...m, ...payload } : null);
            setShareSaved(true);
            setTimeout(() => setShareSaved(false), 2500);
        } catch (err) { console.error(err); }
        finally { setIsSavingShare(false); }
    };

    const handleUpdateMeeting = async () => {
        if (!id || !token) return;
        setIsSaving(true);
        try {
            await axios.put(`/api/transcriptmanager/meeting/${id}`, editValues, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMeeting(meeting ? { ...meeting, title: editValues.title, meeting_date: editValues.meeting_date } : null);
            setIsEditing(false);
        } catch (err) {
            console.error(err);
            alert("Erreur lors de la mise à jour");
        } finally {
            setIsSaving(false);
        }
    };

    const stopGenerating = () => {
        if (genTimerRef.current) { clearInterval(genTimerRef.current); genTimerRef.current = null; }
        if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
        setIsGenerating(false);
        setIsPollingAfterError(false);
    };

    // Constaté en pratique : un proxy réseau intermédiaire (nginx, etc.) coupe
    // parfois la connexion avec le client avant que le backend n'ait fini —
    // celui-ci continue de travailler et enregistre le résumé quand même. On
    // vérifie donc périodiquement si le résultat finit par arriver avant de
    // considérer que la génération a réellement échoué.
    const pollForLateResult = (summaryBefore: string, genStart: number) => {
        const POLL_INTERVAL_MS = 15000;
        const MAX_WAIT_MS = 10 * 60 * 1000; // 10 min
        setIsPollingAfterError(true);

        const poll = async () => {
            if (!id || !token) { stopGenerating(); return; }
            try {
                const res = await axios.get(`/api/transcriptmanager/meeting/${id}`, { headers: { Authorization: `Bearer ${token}` } });
                const newSummary: string = res.data?.summary || '';
                if (newSummary && newSummary !== summaryBefore) {
                    await fetchData();
                    stopGenerating();
                    alert(`Le résumé a finalement été généré avec succès (après ${formatDuration(Math.floor((Date.now() - genStart) / 1000))}) malgré l'erreur réseau affichée précédemment.`);
                    return;
                }
            } catch (err) {
                console.error(err);
            }
            if (Date.now() - genStart > MAX_WAIT_MS) {
                stopGenerating();
                alert(`Toujours aucun résumé après ${formatDuration(Math.floor((Date.now() - genStart) / 1000))} — la génération a probablement réellement échoué cette fois (pas seulement une coupure réseau).`);
                return;
            }
            pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        };
        pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    };

    // Génération asynchrone (fix 504) : POST /summarize répond immédiatement avec
    // un jobId, on suit l'avancement en pollant /summarize-status/:jobId toutes les
    // 3 s — plus aucune connexion HTTP longue ne peut être coupée par un proxy
    // intermédiaire.
    const pollSummarizeJob = (jobId: string, genStart: number) => {
        const POLL_INTERVAL_MS = 3000;
        const MAX_WAIT_MS = 26 * 60 * 1000; // 26 min — borne APM de 20 min + marge
        const poll = async () => {
            if (!id || !token) { stopGenerating(); return; }
            try {
                const res = await axios.get(`/api/transcriptmanager/summarize-status/${jobId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    timeout: 10000
                });
                const job = res.data;
                if (job?.status === 'completed') {
                    await fetchData();
                    stopGenerating();
                    return;
                }
                if (job?.status === 'error') {
                    stopGenerating();
                    alert(`Erreur lors de la génération du résumé : ${job.error || 'erreur inconnue'}`);
                    return;
                }
            } catch (error: unknown) {
                // Job serveur perdu (restart) ou réseau : on bascule sur la
                // vérification directe du résumé enregistré, comme avant.
                const err = error as AxiosErrorLike;
                if (err?.response?.status === 404) {
                    setIsPollingAfterError(true);
                    pollForLateResult(meeting?.summary || '', genStart);
                    return;
                }
                console.error(error);
            }
            if (Date.now() - genStart > MAX_WAIT_MS) {
                stopGenerating();
                alert("Toujours aucun résumé après 26 min — la génération a probablement réellement échoué.");
                return;
            }
            pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        };
        pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    };

    const handleSummarize = async () => {
        if (!id || !token) return;
        if (!selectedModel) {
            alert("Choisissez un modèle IA avant de générer le résumé.");
            return;
        }
        // Le résumé a déjà été corrigé à la main : on demande confirmation avant
        // d'écraser cette modification par une regénération IA.
        const alreadyModified = !!(meeting?.summary_edited_by || meeting?.summary_edited_at);
        if (meeting?.summary && alreadyModified) {
            const who = meeting.summary_edited_by ? ` par ${meeting.summary_edited_by}` : '';
            const when = meeting.summary_edited_at ? ` le ${fmtDateTime(meeting.summary_edited_at)}` : '';
            const ok = window.confirm(
                `Le résumé de cette réunion a déjà fait l'objet d'une modification manuelle${who}${when}.\n\n` +
                `Voulez-vous vraiment régénérer un résumé IA ? La modification existante sera écrasée.`
            );
            if (!ok) return;
        }
        setIsGenerating(true);
        setIsPollingAfterError(false);
        setGenElapsed(0);
        const genStart = Date.now();
        const summaryBefore = meeting?.summary || '';
        if (genTimerRef.current) clearInterval(genTimerRef.current);
        genTimerRef.current = setInterval(() => setGenElapsed(Math.floor((Date.now() - genStart) / 1000)), 1000);
        try {
            const res = await axios.post(`/api/transcriptmanager/meeting/${id}/summarize`,
                { model: selectedModel },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const jobId = res.data?.jobId;
            if (!jobId) {
                // Ancien serveur (réponse synchrone) : résultat direct
                await fetchData();
                stopGenerating();
                return;
            }
            // Le POST renvoie quasi immédiatement ; le suivi du résumé passe par le job.
            await pollSummarizeJob(jobId, genStart);
        } catch (error: unknown) {
            const err = error as AxiosErrorLike;
            console.error(error);
            // err.response absent = aucune réponse HTTP reçue (coupure réseau/proxy
            // en cours de route, pas une erreur renvoyée par notre backend) : on
            // affiche le code/message axios (ex. ECONNABORTED, Network Error) pour
            // pouvoir distinguer un timeout d'une coupure de connexion sans avoir à
            // aller lire la console. La durée écoulée aide encore plus : ~60s pointe
            // vers un timeout de proxy (nginx par défaut), un échec quasi immédiat
            // vers un problème de config/réseau plutôt qu'un vrai timeout.
            const elapsed = Math.floor((Date.now() - genStart) / 1000);
            const status = err?.response?.status;
            const detail = err?.response?.data?.error
                || (err?.code ? `${err.code}${err.message ? ' — ' + err.message : ''}` : err?.message);
            // Forme typique d'une coupure par un proxy intermédiaire plutôt que
            // d'une vraie erreur applicative renvoyée par notre backend : pas de
            // réponse du tout, ou un 502/503/504.
            const looksLikeGatewayCutoff = !err?.response || (status !== undefined && [502, 503, 504].includes(status))
                || (err?.code ? ['ECONNABORTED', 'ERR_NETWORK', 'ERR_BAD_RESPONSE'].includes(err.code) : false);

            if (looksLikeGatewayCutoff) {
                alert(
                    `La connexion a été coupée après ${formatDuration(elapsed)} (probablement un proxy réseau intermédiaire)` +
                    (detail ? ` : ${detail}` : '.') +
                    `\nLe traitement continue peut-être en arrière-plan côté serveur — vérification automatique en cours (jusqu'à 10 min)...`
                );
                pollForLateResult(summaryBefore, genStart);
            } else {
                alert(
                    `Erreur lors de la génération du résumé (API IA Ville) après ${formatDuration(elapsed)}` +
                    (detail ? ` : ${detail}` : '.')
                );
                stopGenerating();
            }
        }
    };

    const handleToggleTask = async (taskId: number) => {
        try {
            await axios.post(`/api/transcriptmanager/task/${taskId}/toggle`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setTasks(tasks.map(t => t.id === taskId ? { ...t, is_completed: !t.is_completed } : t));
        } catch (err) {
            console.error(err);
        }
    };

    const handleSaveSummary = async () => {
        if (!id || !token || !meeting) return;
        setIsSaving(true);
        try {
            const summaryMd = htmlToMd(summaryDraft);
            const res = await axios.put(`/api/transcriptmanager/meeting/${id}`, {
                title: meeting.title,
                meeting_date: meeting.meeting_date || meeting.created_at,
                summary: summaryMd
            }, { headers: { Authorization: `Bearer ${token}` } });
            const savedSummary = res.data?.summary || summaryMd;
            setMeeting({ ...meeting, summary: savedSummary });
            setIsEditingSummary(false);
        } catch (err) { console.error(err); }
        finally { setIsSaving(false); }
    };

    // ===== Envoi du résumé IA par mail =====
    const openEmailModal = async () => {
        if (!id || !token) return;
        setEmailError('');
        setEmailResult(null);
        setEmailExtra('');
        setEmailMessage('');
        setEmailParticipants([]);
        setEmailSelected(new Set());
        setShowEmailModal(true);
        try {
            const res = await axios.get(`/api/transcriptmanager/meeting/${id}/participants`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const list = Array.isArray(res.data) ? res.data : [];
            setEmailParticipants(list);
            setEmailSelected(new Set(list.map((p: { email: string }) => p.email)));
        } catch (err) {
            const e = err as AxiosErrorLike;
            setEmailError(e?.response?.data?.error || e?.message || 'Erreur lors du chargement des participants');
        }
    };

    const updateParticipant = (email: string, patch: Partial<{ fonction: string; direction: string; service: string }>) => {
        setEmailParticipants(prev => prev.map(p => p.email === email ? { ...p, ...patch } : p));
    };

    const sendSummaryEmail = async () => {
        if (!id || !token) return;
        const recipients = emailParticipants.filter(p => emailSelected.has(p.email));
        if (recipients.length === 0 && !emailExtra.trim()) {
            alert('Sélectionnez au moins un destinataire (participant ou email libre).');
            return;
        }
        setEmailSending(true);
        setEmailError('');
        setEmailResult(null);
        try {
            const res = await axios.post(`/api/transcriptmanager/meeting/${id}/send-summary`, {
                recipients,
                participants: emailParticipants,
                extraEmails: emailExtra,
                message: emailMessage,
            }, { headers: { Authorization: `Bearer ${token}` } });
            const sent = res.data?.sent ?? 0;
            const failed = res.data?.failed ?? 0;
            setEmailResult({ sent, failed });
            // Envoi effectué : on ferme la modale et on rafraîchit la fiche pour
            // afficher la date/heure et les destinataires du dernier envoi.
            if (sent > 0) {
                setShowEmailModal(false);
                fetchData();
            }
        } catch (err) {
            const e = err as AxiosErrorLike;
            setEmailError(e?.response?.data?.error || e?.message || "Erreur lors de l'envoi");
        } finally {
            setEmailSending(false);
        }
    };

    const handleSaveTask = async (taskId: number) => {
        if (!token) return;
        try {
            await axios.put(`/api/transcriptmanager/task/${taskId}`, taskDraft, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setTasks(tasks.map(t => t.id === taskId ? { ...t, ...taskDraft } : t));
            setEditingTaskId(null);
        } catch (err) { console.error(err); }
    };

    const handleDeleteTask = async (taskId: number) => {
        if (!token || !window.confirm('Supprimer cette tâche ?')) return;
        try {
            await axios.delete(`/api/transcriptmanager/task/${taskId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setTasks(tasks.filter(t => t.id !== taskId));
            setDeletedTasks(null); // périmé — sera rechargé à la prochaine ouverture
        } catch (err) { console.error(err); }
    };

    // ===== Tâches manuelles (que l'IA n'aurait pas détectées) =====
    const handleCreateTask = async () => {
        if (!token || !id || !newTaskDraft.description.trim()) return;
        setIsAddingTask(true);
        try {
            const res = await axios.post(`/api/transcriptmanager/tasks`, { meeting_id: id, ...newTaskDraft }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setTasks(t => [...t, {
                id: res.data.id, description: newTaskDraft.description, assignee: newTaskDraft.assignee,
                requester: newTaskDraft.requester, deadline: newTaskDraft.deadline, is_completed: false,
                origin: 'manual', added_by_name: res.data.added_by_name, added_by_color: res.data.added_by_color,
            }]);
            setNewTaskDraft({ description: '', assignee: '', requester: '', deadline: '' });
            setShowAddTask(false);
        } catch (err) {
            console.error(err);
            alert("Erreur lors de l'ajout de la tâche");
        } finally { setIsAddingTask(false); }
    };

    const loadDeletedTasks = async () => {
        if (!token || !id) return;
        try {
            const res = await axios.get(`/api/transcriptmanager/tasks?meeting_id=${id}&include_deleted=1`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDeletedTasks((res.data || []).filter((t: Task) => !!t.deleted_at));
        } catch (err) { console.error(err); }
    };

    const handleToggleDeletedTasks = () => {
        const next = !showDeletedTasks;
        setShowDeletedTasks(next);
        if (next && deletedTasks === null) loadDeletedTasks();
    };

    const handleRestoreTask = async (taskId: number) => {
        if (!token) return;
        try {
            await axios.patch(`/api/transcriptmanager/task/${taskId}/restore`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDeletedTasks(prev => (prev || []).filter(t => t.id !== taskId));
            await fetchData();
        } catch (err) { console.error(err); }
    };

    // ===== Amendement du texte du résumé (destinataires internes) =====
    // Reprend le brouillon privé de l'utilisateur s'il en a laissé un (réponse
    // "non" à la confirmation d'envoi), sinon le texte propre actuel.
    const openAmendEditor = () => {
        const md = amendAccess.draft || stripSummaryMetaClient(meeting?.summary || '');
        setAmendEditorHtml(mdToHtml(md));
        setAmendMessage(amendAccess.draft ? 'Vous reprenez votre brouillon non envoyé.' : '');
        setIsEditingAmend(true);
    };

    const handleAmendValidateClick = async () => {
        setPendingAddRecipients([]);
        setPendingRemoveEmails(new Set());
        setManualRecipientEmail('');
        recipientAd.setQuery('');
        recipientAd.clearResults();
        // Rafraîchit la liste des destinataires (un autre amendement a pu
        // avoir lieu entre-temps) juste avant de l'afficher dans la modale.
        if (token && id) {
            try {
                const res = await axios.get(`/api/transcriptmanager/meeting/${id}/amend-access`, { headers: { Authorization: `Bearer ${token}` } });
                setAmendAccess(res.data || { allowed: false });
            } catch { /* on garde la dernière valeur connue */ }
        }
        setShowSendConfirmModal(true);
    };

    // Ajout d'un destinataire à la boucle (recherche AD ou email libre) —
    // ouvert à tout amendeur, juste en attente locale jusqu'à validation.
    const addPendingRecipient = (email: string, name: string) => {
        const clean = email.trim().toLowerCase();
        if (!clean || !clean.includes('@')) return;
        const already = (amendAccess.recipients || []).some(r => r.email.toLowerCase() === clean)
            || pendingAddRecipients.some(r => r.email.toLowerCase() === clean);
        if (already) return;
        setPendingAddRecipients(prev => [...prev, { email: clean, name: name || clean }]);
        setManualRecipientEmail('');
        recipientAd.setQuery('');
        recipientAd.clearResults();
    };

    const toggleRemoveRecipient = (email: string) => {
        setPendingRemoveEmails(prev => {
            const next = new Set(prev);
            if (next.has(email)) next.delete(email); else next.add(email);
            return next;
        });
    };

    const submitAmendment = async () => {
        if (!token || !id) return;
        setShowSendConfirmModal(false);
        setIsAmending(true);
        setAmendMessage('');
        try {
            const res = await axios.post(`/api/transcriptmanager/meeting/${id}/amend-summary`,
                {
                    newText: htmlToMd(amendEditorHtml),
                    addRecipients: pendingAddRecipients,
                    removeEmails: Array.from(pendingRemoveEmails),
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.data?.changed) {
                setAmendMessage('Aucune modification détectée.');
            } else {
                setAmendMessage(res.data?.broadcast
                    ? 'Vos amendements ont été validés et diffusés à tous les destinataires.'
                    : 'Vos amendements ont été validés (aucun envoi précédent à rediffuser).');
                await fetchData();
            }
            setIsEditingAmend(false);
        } catch (err) {
            const e = err as AxiosErrorLike;
            alert(e?.response?.data?.error || "Erreur lors de l'enregistrement des amendements");
        } finally { setIsAmending(false); }
    };

    const saveAmendDraft = async () => {
        if (!token || !id) return;
        setShowSendConfirmModal(false);
        setIsAmending(true);
        try {
            const draftMd = htmlToMd(amendEditorHtml);
            await axios.put(`/api/transcriptmanager/meeting/${id}/amend-draft`,
                { draftText: draftMd },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setAmendAccess(prev => ({ ...prev, draft: draftMd, draft_updated_at: new Date().toISOString() }));
            setAmendMessage('Vos amendements sont enregistrés en brouillon — non validés, non visibles par les autres.');
            setIsEditingAmend(false);
        } catch (err) {
            const e = err as AxiosErrorLike;
            alert(e?.response?.data?.error || "Erreur lors de l'enregistrement du brouillon");
        } finally { setIsAmending(false); }
    };

    // ===== Pièces jointes =====
    const handleUploadAttachment = async (files: FileList | null) => {
        if (!files || files.length === 0 || !token || !id) return;
        setIsUploadingAttachment(true);
        try {
            const formData = new FormData();
            Array.from(files).forEach(f => formData.append('files', f));
            await axios.post(`/api/transcriptmanager/meeting/${id}/attachments`, formData, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
            });
            const aRes = await axios.get(`/api/transcriptmanager/meeting/${id}/attachments`, { headers: { Authorization: `Bearer ${token}` } });
            setAttachments(aRes.data || []);
        } catch (err) {
            console.error(err);
            alert("Erreur lors de l'ajout des pièces jointes");
        } finally {
            setIsUploadingAttachment(false);
            if (attachmentInputRef.current) attachmentInputRef.current.value = '';
        }
    };

    const handleDeleteAttachment = async (attId: number) => {
        if (!token || !window.confirm('Supprimer cette pièce jointe ?')) return;
        try {
            await axios.delete(`/api/transcriptmanager/attachments/${attId}`, { headers: { Authorization: `Bearer ${token}` } });
            setAttachments(attachments.filter(a => a.id !== attId));
        } catch (err) { console.error(err); }
    };

    const scrollToCue = (seconds: number) => {
        const el = document.getElementById(`cue-${seconds}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('highlight');
            setTimeout(() => el.classList.remove('highlight'), 2000);
        }
    };

    if (loading) return (
        <div className="tm-loading-page">
            {user?.role === 'transcript_agent' || user?.role === 'transcript_guest' ? <TranscriptAgentHeader user={user} /> : <Header />}
            <div className="loading-content">
                <div className="spinner-orbit">
                    <div className="orbit-dot"></div>
                </div>
                <h2>Analyse du transcript en cours...</h2>
                <p>Veuillez patienter pendant que nous préparons votre réunion.</p>
            </div>
            <style>{`
                .tm-loading-page {
                    min-height: 100vh;
                    background: #F8FAFC;
                    display: flex;
                    flex-direction: column;
                }
                .loading-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    color: #1E293B;
                }
                .spinner-orbit {
                    width: 60px;
                    height: 60px;
                    border: 3px solid #E2E8F0;
                    border-radius: 50%;
                    position: relative;
                    margin-bottom: 1.5rem;
                    animation: spin 2s linear infinite;
                }
                .orbit-dot {
                    width: 10px;
                    height: 10px;
                    background: #DC2626;
                    border-radius: 50%;
                    position: absolute;
                    top: -6px;
                    left: 50%;
                    margin-left: -5px;
                }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .loading-content h2 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; }
                .loading-content p { color: #64748B; font-size: 0.875rem; }
            `}</style>
        </div>
    );
    if (!meeting) return <div className="tm-error-page">Réunion introuvable.</div>;

    const speakers = Array.from(new Set(meeting.cues?.map(c => c.speaker_name) || []));
    const pendingAiTasks = tasks.filter(t => t.origin === 'ai' && !t.app_task_id);
    const totalCues = meeting.cues?.length || 0;
    const searchLower = transcriptSearch.toLowerCase();
    const filteredCues = (meeting.cues || [])
        .filter(c => !speakerFilter || c.speaker_name === speakerFilter)
        .filter(c => !transcriptSearch
            || c.text.toLowerCase().includes(searchLower)
            || c.speaker_name.toLowerCase().includes(searchLower));

    return (
        <div className="md-page">
            {user?.role === 'transcript_agent' ? <TranscriptAgentHeader user={user} /> : <Header />}
            <div className="md-container">
                <div className="md-top-nav">
                    <button className="md-btn-back" onClick={() => navigate('/transcriptmanager')}>
                        <ArrowLeft size={18} /> Retour
                    </button>
                    <div className="md-actions">
                        {modelsError ? (
                            <span style={{ fontSize: '0.75rem', color: '#DC2626' }}>{modelsError}</span>
                        ) : (
                            <div className="md-generate-group">
                                <button
                                    className={`md-btn-generate ${isGenerating ? 'loading' : ''}`}
                                    onClick={handleSummarize}
                                    disabled={isGenerating || !selectedModel}
                                >
                                    {isGenerating ? <RefreshCw className="animate-spin" size={18} /> : <Bot size={18} />}
                                    {isGenerating ? 'Génération...' : 'Générer résumé IA'}
                                </button>
                                <select
                                    className="md-generate-model"
                                    value={selectedModel}
                                    onChange={e => setSelectedModel(e.target.value)}
                                    disabled={isGenerating || aiModels.length === 0 || aiSource === 'local'}
                                    title={aiSource === 'local' ? "IA locale AppDSI : un seul modèle configuré (changer dans /admin, section IA)" : "Modèle IA (APM) — LLAMA interne uniquement"}
                                >
                                    {aiModels.length === 0 && <option value="">…</option>}
                                    {aiModels.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        )}
                        {meeting.summary && (
                            <button
                                className="md-btn-email"
                                onClick={openEmailModal}
                                disabled={isGenerating}
                                title="Envoyer le résumé par mail aux participants"
                            >
                                <Mail size={18} />
                                Envoyer par mail
                            </button>
                        )}
                    </div>
                </div>

                <div className="md-header-card">
                    {isEditing ? (
                        <div className="md-edit-form">
                            <div className="form-group">
                                <label>Titre de la réunion</label>
                                <input 
                                    type="text" 
                                    value={editValues.title} 
                                    onChange={e => setEditValues({ ...editValues, title: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Date de la réunion</label>
                                <input 
                                    type="date" 
                                    value={editValues.meeting_date} 
                                    onChange={e => setEditValues({ ...editValues, meeting_date: e.target.value })}
                                />
                            </div>
                            <div className="form-actions">
                                <button className="btn-save" onClick={handleUpdateMeeting} disabled={isSaving}>
                                    {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                                </button>
                                <button className="btn-cancel" onClick={() => setIsEditing(false)}>Annuler</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <h1>{meeting.title}</h1>
                                <button className="md-btn-edit" onClick={() => setIsEditing(true)}>Modifier</button>
                            </div>
                            <div className="md-meta">
                                <span className="meta-item"><Calendar size={14} /> {fmtDate(meeting.meeting_date || meeting.created_at)}</span>
                                <span className="meta-item"><Clock size={14} /> {formatTime(meeting.cues?.[(meeting.cues?.length || 1) - 1]?.start_seconds || 0)}</span>
                                <span className="meta-item"><Users size={14} /> {speakers.length} Intervenants</span>
                            </div>
                        </>
                    )}
                </div>

                <div className="md-grid">
                    <div className="md-sidebar">
                        <div className="md-card speakers-card">
                            <div className="card-head">
                                <Users size={18} />
                                <h2>Intervenants</h2>
                            </div>
                            <div className="speaker-list">
                                {speakers
                                    .map(s => ({
                                        name: s,
                                        count: meeting.cues.filter(c => c.speaker_name === s).length,
                                        email: meeting.cues.find(c => c.speaker_name === s)?.speaker_email
                                    }))
                                    .sort((a, b) => b.count - a.count)
                                    .slice(0, showAllSpeakers ? undefined : 5)
                                    .map((speaker, idx) => {
                                        const pct = Math.round((speaker.count / totalCues) * 100);
                                        const color = `hsl(${(speakers.indexOf(speaker.name) * 137) % 360}, 65%, 50%)`;
                                        return (
                                            <div
                                                key={idx}
                                                className={`speaker-stat ${speakerFilter === speaker.name ? 'speaker-stat-active' : ''}`}
                                                onClick={() => setSpeakerFilter(prev => prev === speaker.name ? '' : speaker.name)}
                                                title="Cliquer pour isoler les interventions de cet intervenant"
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <div className="speaker-labels">
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span className="s-name" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                            {speaker.name}
                                                            <AgentPresenceBadge email={speaker.email} name={speaker.name} size={11} />
                                                        </span>
                                                        {speaker.email && (
                                                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{speaker.email}</span>
                                                        )}
                                                    </div>
                                                    <span className="s-pct">{pct}%</span>
                                                </div>
                                                <div className="s-progress">
                                                    <div className="s-bar" style={{ width: `${pct}%`, backgroundColor: color }}></div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                {speakers.length > 5 && (
                                    <button className="md-btn-more" onClick={() => setShowAllSpeakers(!showAllSpeakers)}>
                                        {showAllSpeakers ? 'Voir moins' : `Voir les ${speakers.length - 5} autres...`}
                                    </button>
                                )}
                            </div>
                        </div>

                        {isAdmin && (
                        <div className="md-card" style={{ padding: '1.25rem' }}>
                            <div className="card-head" style={{ marginBottom: '1rem' }}>
                                <Share2 size={18} />
                                <h2>Partager</h2>
                                {(meeting?.shared_with_direction || meeting?.shared_with_service) && (
                                    <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: 12 }}>
                                        Partagé
                                    </span>
                                )}
                            </div>

                            {/* Scope toggle */}
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                {(['', 'direction', 'service'] as const).map(mode => (
                                    <button key={mode} onClick={() => {
                                        setIsSharingMode(mode);
                                        setShareDirection('');
                                        setShareService('');
                                        setOrgServices([]);
                                        if (mode !== '' && orgDirections.length === 0) loadOrgDirections();
                                    }} style={{
                                        flex: 1, padding: '6px 0', borderRadius: 8, border: '1.5px solid',
                                        borderColor: isSharingMode === mode ? '#3b82f6' : '#e2e8f0',
                                        background: isSharingMode === mode ? '#eff6ff' : 'white',
                                        color: isSharingMode === mode ? '#1d4ed8' : '#64748b',
                                        fontWeight: 700, fontSize: 12, cursor: 'pointer'
                                    }}>
                                        {mode === '' ? 'Non partagé' : mode === 'direction' ? 'Direction' : 'Service'}
                                    </button>
                                ))}
                            </div>

                            {isSharingMode === 'direction' && (
                                <div style={{ marginBottom: 10 }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Direction</label>
                                    <select value={shareDirection} onChange={e => setShareDirection(e.target.value)}
                                        style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}>
                                        <option value="">-- Choisir une direction --</option>
                                        {orgDirections.map(d => <option key={d.code} value={d.label}>{d.label}</option>)}
                                    </select>
                                </div>
                            )}

                            {isSharingMode === 'service' && (
                                <>
                                    <div style={{ marginBottom: 8 }}>
                                        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Direction</label>
                                        <select value={shareDirection} onChange={e => {
                                            setShareDirection(e.target.value);
                                            setShareService('');
                                            loadOrgServices(e.target.value);
                                        }} style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}>
                                            <option value="">-- Choisir une direction --</option>
                                            {orgDirections.map(d => <option key={d.code} value={d.label}>{d.label}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ marginBottom: 10 }}>
                                        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Service</label>
                                        <select value={shareService} onChange={e => setShareService(e.target.value)}
                                            disabled={!shareDirection}
                                            style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', opacity: !shareDirection ? 0.5 : 1 }}>
                                            <option value="">-- Choisir un service --</option>
                                            {orgServices.map(s => <option key={s.code} value={s.label}>{s.label}</option>)}
                                        </select>
                                    </div>
                                </>
                            )}

                            <button onClick={handleSaveSharing} disabled={isSavingShare ||
                                (isSharingMode === 'direction' && !shareDirection) ||
                                (isSharingMode === 'service' && !shareService)}
                                style={{
                                    width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
                                    background: shareSaved ? '#16a34a' : '#3b82f6',
                                    color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    transition: 'background 0.3s', opacity: (isSavingShare) ? 0.7 : 1
                                }}>
                                {shareSaved ? <><CheckCircle size={14} /> Enregistré</> : isSavingShare ? 'Enregistrement...' : <><Building2 size={14} /> Appliquer le partage</>}
                            </button>

                            {(meeting?.shared_with_direction || meeting?.shared_with_service) && (
                                <p style={{ margin: '8px 0 0', fontSize: 11, color: '#64748b', textAlign: 'center' }}>
                                    Visible par : <strong style={{ color: '#1d4ed8' }}>
                                        {meeting.shared_with_service || meeting.shared_with_direction}
                                    </strong>
                                </p>
                            )}
                        </div>
                        )}

                        <div className="md-card">
                            <div className="card-head">
                                <Paperclip size={18} />
                                <h2>Pièces jointes</h2>
                                <span className="badge">{attachments.length}</span>
                                <input
                                    ref={attachmentInputRef}
                                    type="file"
                                    multiple
                                    style={{ display: 'none' }}
                                    onChange={(e) => handleUploadAttachment(e.target.files)}
                                />
                                <button className="md-btn-add-att" onClick={() => attachmentInputRef.current?.click()} disabled={isUploadingAttachment}>
                                    <Upload size={14} /> {isUploadingAttachment ? 'Ajout...' : 'Ajouter'}
                                </button>
                            </div>
                            {attachments.length === 0 ? (
                                <p className="no-tasks" style={{ padding: '1rem 1.5rem' }}>
                                    {isUploadingAttachment ? 'Ajout en cours...' : 'Aucune pièce jointe.'}
                                </p>
                            ) : (
                                <div style={{ padding: '0.5rem 1.5rem 1rem' }}>
                                    {attachments.map(att => (
                                        <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', borderBottom: '1px solid #F8FAFC' }}>
                                            <span style={{ fontSize: '1rem', flexShrink: 0 }}>
                                                {att.mimetype?.includes('pdf') ? '📄' : att.mimetype?.includes('image') ? '🖼️' : att.mimetype?.includes('sheet') || att.original_name.endsWith('.xlsx') || att.original_name.endsWith('.csv') ? '📊' : '📎'}
                                            </span>
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <a
                                                    href={`/api/transcriptmanager/attachments/${att.id}/file?mode=inline&token=${encodeURIComponent(token || '')}`}
                                                    target="_blank" rel="noopener noreferrer"
                                                    style={{ fontSize: '0.8rem', color: '#2563EB', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                    title={att.original_name}
                                                >
                                                    {att.original_name}
                                                </a>
                                                <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                                                    {att.size ? `${(att.size / 1024).toFixed(0)} Ko` : ''}
                                                    {att.uploaded_by ? `${att.size ? ' · ' : ''}${att.uploaded_by}` : ''}
                                                </span>
                                            </div>
                                            <button className="task-action-btn" title="Supprimer" onClick={() => handleDeleteAttachment(att.id)}>
                                                <Trash2 size={14} style={{ color: '#EF4444' }} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="md-card tasks-card">
                            <div className="card-head">
                                <ListTodo size={18} />
                                <h2>Plan d'Action</h2>
                                <span className="badge">{tasks.length}</span>
                                {amendAccess.allowed && (
                                    <button className="md-btn-add-att" onClick={() => setShowAddTask(v => !v)} title="Ajouter une tâche que l'IA n'aurait pas détectée">
                                        + Ajouter
                                    </button>
                                )}
                            </div>
                            {amendAccess.allowed && amendAccess.color && (
                                <div style={{ padding: '0.5rem 1.5rem 0', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: '#94A3B8' }}>
                                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: amendAccess.color, display: 'inline-block' }} />
                                    Vous : {amendAccess.name}
                                </div>
                            )}
                            {showAddTask && (
                                <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#F8FAFC' }}>
                                    <input className="task-edit-input" value={newTaskDraft.description} onChange={e => setNewTaskDraft({ ...newTaskDraft, description: e.target.value })} placeholder="Description de la tâche" autoFocus />
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                        <input className="task-edit-input" value={newTaskDraft.assignee} onChange={e => setNewTaskDraft({ ...newTaskDraft, assignee: e.target.value })} placeholder="Responsable" />
                                        <input className="task-edit-input" value={newTaskDraft.requester} onChange={e => setNewTaskDraft({ ...newTaskDraft, requester: e.target.value })} placeholder="Demandeur" />
                                        <input className="task-edit-input" value={newTaskDraft.deadline} onChange={e => setNewTaskDraft({ ...newTaskDraft, deadline: e.target.value })} placeholder="Échéance" />
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button className="btn-save" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }} disabled={isAddingTask || !newTaskDraft.description.trim()} onClick={handleCreateTask}>
                                            {isAddingTask ? 'Ajout...' : 'Ajouter'}
                                        </button>
                                        <button className="btn-cancel" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }} onClick={() => setShowAddTask(false)}>Annuler</button>
                                    </div>
                                </div>
                            )}
                            {pendingAiTasks.length > 0 && (
                                <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #F1F5F9', background: '#FFFBEB' }}>
                                    <button className="md-btn-propose" onClick={() => setShowTaskValidation(true)}>
                                        <UserCheck size={14} /> Proposer {pendingAiTasks.length} tâche{pendingAiTasks.length > 1 ? 's' : ''} identifiée{pendingAiTasks.length > 1 ? 's' : ''} à l'application
                                    </button>
                                </div>
                            )}
                            <div className="tasks-list">
                                {tasks.length > 0 ? tasks.map(task => {
                                    const agent = task.assignee_username ? dsiAgents.find(a => a.username === task.assignee_username) : null;
                                    return (
                                    <div key={task.id} className={`task-item ${task.is_completed ? 'done' : ''}`}>
                                        {editingTaskId === task.id ? (
                                            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.25rem 0' }}>
                                                <input className="task-edit-input" value={taskDraft.description} onChange={e => setTaskDraft({ ...taskDraft, description: e.target.value })} placeholder="Description" autoFocus />
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                                    <input className="task-edit-input" value={taskDraft.assignee} onChange={e => setTaskDraft({ ...taskDraft, assignee: e.target.value })} placeholder="Responsable" />
                                                    <input className="task-edit-input" value={taskDraft.requester} onChange={e => setTaskDraft({ ...taskDraft, requester: e.target.value })} placeholder="Demandeur" />
                                                    <input className="task-edit-input" value={taskDraft.deadline} onChange={e => setTaskDraft({ ...taskDraft, deadline: e.target.value })} placeholder="Échéance" />
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button className="btn-save" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }} onClick={() => handleSaveTask(task.id)}>Enregistrer</button>
                                                    <button className="btn-cancel" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }} onClick={() => setEditingTaskId(null)}>Annuler</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <button className="task-toggle" onClick={() => handleToggleTask(task.id)}>
                                                    {task.is_completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                                                </button>
                                                <div className="task-body">
                                                    <p>
                                                        {task.description}
                                                        {task.added_by_color && (
                                                            <span
                                                                title={`Ajoutée par ${task.added_by_name}`}
                                                                style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: task.added_by_color, marginLeft: 6, verticalAlign: 'middle' }}
                                                            />
                                                        )}
                                                    </p>
                                                    <div className="task-foot">
                                                        {agent ? (
                                                            <span className="who" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                                @{agent.nom}
                                                                <AgentPresenceBadge email={agent.email} name={agent.nom} size={11} />
                                                                {typeof task.assignee_match_score === 'number' && task.assignee_match_score < 1 && (
                                                                    <span title="Correspondance approximative" style={{ color: '#D97706' }}>~{Math.round(task.assignee_match_score * 100)}%</span>
                                                                )}
                                                            </span>
                                                        ) : task.assignee ? (
                                                            <span className="who unmatched" title="Aucun agent DSI correspondant trouvé automatiquement">@{task.assignee} ?</span>
                                                        ) : null}
                                                        {task.deadline && <span className="deadline">{task.deadline}</span>}
                                                        {task.app_task_id && <span className="linked-badge"><CheckCircle size={11} /> Tâche créée</span>}
                                                        {task.start_seconds !== undefined && (
                                                            <button className="ts" onClick={() => scrollToCue(task.start_seconds!)}>
                                                                {formatTime(task.start_seconds)}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="task-actions">
                                                    <button className="task-action-btn" title="Modifier" onClick={() => {
                                                        setTaskDraft({ description: task.description, assignee: task.assignee || '', requester: task.requester || '', deadline: task.deadline || '' });
                                                        setEditingTaskId(task.id);
                                                    }}>✏️</button>
                                                    <button className="task-action-btn" title="Supprimer" onClick={() => handleDeleteTask(task.id)}>🗑️</button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    );
                                }) : <p className="no-tasks">Aucune tâche.</p>}
                            </div>
                            {amendAccess.allowed && (
                                <div style={{ borderTop: '1px solid #F1F5F9' }}>
                                    <button
                                        onClick={handleToggleDeletedTasks}
                                        style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '0.6rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8', cursor: 'pointer' }}
                                    >
                                        {showDeletedTasks ? '▾' : '▸'} Tâches supprimées{deletedTasks ? ` (${deletedTasks.length})` : ''}
                                    </button>
                                    {showDeletedTasks && (
                                        <div style={{ padding: '0 1.5rem 0.75rem' }}>
                                            {deletedTasks === null ? (
                                                <p style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Chargement...</p>
                                            ) : deletedTasks.length === 0 ? (
                                                <p style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Aucune tâche supprimée.</p>
                                            ) : deletedTasks.map(t => (
                                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.4rem 0', fontSize: '0.8rem', borderBottom: '1px solid #F8FAFC' }}>
                                                    <span style={{ flex: 1, textDecoration: 'line-through', color: '#94A3B8' }}>{t.description}</span>
                                                    <span style={{ fontSize: '0.68rem', color: t.deleted_by_color || '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                        {t.deleted_by_name ? `supprimée par ${t.deleted_by_name}` : ''}
                                                    </span>
                                                    {isAdmin && (
                                                        <button className="task-action-btn" title="Restaurer" onClick={() => handleRestoreTask(t.id)}>↩️</button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="md-main">
                        <div className="md-card transcript-card">
                            <div className="card-head">
                                <FileText size={18} />
                                <h2>Transcription</h2>
                                {speakerFilter && (
                                    <span className="speaker-filter-chip" title="Interventions isolées">
                                        🎙️ {speakerFilter}
                                        <button className="search-clear" onClick={() => setSpeakerFilter("")} title="Retirer le filtre intervenant">✕</button>
                                    </span>
                                )}
                                {(transcriptSearch || speakerFilter) && (
                                    <span className="search-count">
                                        {filteredCues.length} résultat{filteredCues.length !== 1 ? 's' : ''}
                                    </span>
                                )}
                                <div className="transcript-search">
                                    <Search size={14} />
                                    <input
                                        type="text"
                                        placeholder="Rechercher..."
                                        value={transcriptSearch}
                                        onChange={e => setTranscriptSearch(e.target.value)}
                                    />
                                    {transcriptSearch && (
                                        <button className="search-clear" onClick={() => setTranscriptSearch("")}>✕</button>
                                    )}
                                </div>
                            </div>
                            <div className="transcript-body" ref={transcriptRef}>
                                {filteredCues.length > 0 ? filteredCues.map((cue, idx) => (
                                    <div key={idx} id={`cue-${cue.start_seconds}`} className="cue-row">
                                        <span className="cue-time" onClick={() => scrollToCue(cue.start_seconds)}>
                                            {formatTime(cue.start_seconds)}
                                        </span>
                                        <div
                                            className="cue-speaker-block"
                                            style={{ color: `hsl(${(speakers.indexOf(cue.speaker_name) * 137) % 360}, 65%, 40%)`, cursor: 'pointer' }}
                                            onClick={() => setSpeakerFilter(prev => prev === cue.speaker_name ? '' : cue.speaker_name)}
                                            title="Isoler les interventions de cet intervenant"
                                        >
                                            <span className="cue-speaker">{cue.speaker_name}</span>
                                            {cue.speaker_email && <span className="cue-email">{cue.speaker_email}</span>}
                                        </div>
                                        <div
                                            className="cue-text"
                                            dangerouslySetInnerHTML={{ __html: highlightText(cue.text, transcriptSearch) }}
                                        />
                                    </div>
                                )) : <p className="no-data">{(transcriptSearch || speakerFilter) ? 'Aucun résultat.' : 'Aucune transcription disponible.'}</p>}
                            </div>
                        </div>

                        <div className="md-card summary-card">
                            <div className="card-head">
                                <MessageSquare size={18} />
                                <h2>Résumé Exécutif</h2>
                                {!isGenerating && !isEditingSummary && !isEditingAmend && (
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {amendAccess.allowed && (
                                            <button className="md-btn-edit" onClick={openAmendEditor} title="Ajouter/retirer du texte — vos modifications seront tracées et diffusées à tous">
                                                ✏️ Amender le texte
                                            </button>
                                        )}
                                        {!meeting.summary_last_send && (
                                            <button className="md-btn-edit" onClick={() => {
                                                setSummaryDraft(mdToHtml(stripSummaryMetaClient(meeting.summary || '')));
                                                setIsEditingSummary(true);
                                            }} title="Réécriture libre — possible uniquement avant le premier envoi. Ensuite, les corrections passent par l'amendement (tracé).">Modifier</button>
                                        )}
                                    </div>
                                )}
                            </div>
                            {meeting.summary_last_send && (
                                <div style={{ margin: '0 1.5rem 0.5rem', padding: '8px 12px', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, fontSize: '0.78rem', color: '#0369A1', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                    <Mail size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                                    <span>
                                        Compte rendu envoyé
                                        {meeting.summary_last_send.sent_at ? ` le ${fmtDateTime(meeting.summary_last_send.sent_at)}` : ''}
                                        {meeting.summary_last_send.sent_by ? ` par ${meeting.summary_last_send.sent_by}` : ''}
                                        {' '}à {(meeting.summary_last_send.recipients || '').split(/[,;]/).map(r => r.trim()).filter(Boolean).join(' ; ') || '—'}
                                        {meeting.summary_last_send.failed_count ? ` (${meeting.summary_last_send.failed_count} échec(s))` : ''}.
                                    </span>
                                </div>
                            )}
                            {meeting.summary && (
                                <div style={{ margin: '0 1.5rem 0.75rem', padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: '0.78rem', color: '#92400E', lineHeight: 1.5 }}>
                                    <strong>⚠️ À lire — compte rendu généré par Intelligence Artificielle</strong>
                                    <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                                        {(meeting.summary_notice || '').split('\n').map(l => l.trim()).filter(Boolean).map((line, i) => (
                                            <li key={i}>{line}</li>
                                        ))}
                                    </ol>
                                </div>
                            )}
                            {amendMessage && (
                                <div style={{ margin: '0 1.5rem 0.5rem', padding: '8px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: '0.78rem', color: '#15803D', fontWeight: 600 }}>
                                    {amendMessage}
                                </div>
                            )}
                            {!isEditingAmend && amendAccess.allowed && amendAccess.draft && (
                                <div style={{ margin: '0 1.5rem 0.5rem', padding: '8px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: '0.78rem', color: '#92400E', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                    <span>📝 Vous avez un brouillon d'amendement non envoyé{amendAccess.draft_updated_at ? ` (${fmtDateTime(amendAccess.draft_updated_at)})` : ''} — non visible par les autres.</span>
                                    <button className="md-btn-edit" onClick={openAmendEditor}>Reprendre</button>
                                </div>
                            )}
                            <div className="summary-content">
                                {isGenerating ? (
                                    <div className="stream-box">
                                        {getGenerationPhase(genElapsed, aiSource, selectedModel, isPollingAfterError)}
                                        <span className="gen-counter"> ({formatDuration(genElapsed)})</span>
                                    </div>
                                ) : (
                                    <div className="md-formatted">
                                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} urlTransform={markdownUrlTransform}>
                                            {meeting.summary || "Aucun résumé généré."}
                                        </ReactMarkdown>
                                    </div>
                                )}
                            </div>
                            {!!meeting.summary && (
                                <div style={{ margin: '0 1.5rem 1.5rem', paddingTop: '1rem', borderTop: '1px solid #F1F5F9' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#334155', marginBottom: 14 }}>
                                        🕘 Historique des amendements ({(meeting.summary_amendments || []).length})
                                    </div>
                                    <div style={{ position: 'relative', paddingLeft: 22 }}>
                                        {((meeting.summary_amendments || []).length > 0) && (
                                            <div style={{ position: 'absolute', left: 5, top: 8, bottom: 8, width: 2, background: '#E2E8F0' }} />
                                        )}
                                        {/* Version originale — point de départ de la timeline */}
                                        <div style={{ position: 'relative', marginBottom: 16 }}>
                                            <span style={{ position: 'absolute', left: -22, top: 2, width: 12, height: 12, borderRadius: '50%', background: '#CBD5E1', border: '2px solid white', boxShadow: '0 0 0 1px #CBD5E1' }} />
                                            <div style={{ fontSize: '0.72rem', color: '#64748B', marginBottom: 2 }}>
                                                <strong style={{ color: '#475569' }}>Version originale</strong>
                                                {' — '}{fmtDateTime(meeting.summary_requested_at || meeting.created_at)}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                                                {meeting.summary_requester ? `Générée par ${meeting.summary_requester}` : 'Résumé initial'}
                                                {meeting.summary_model ? ` — modèle ${meeting.summary_model}` : ''}
                                            </div>
                                        </div>
                                        {(meeting.summary_amendments || []).map((a, i) => (
                                            <div key={a.id} style={{ position: 'relative', marginBottom: i === (meeting.summary_amendments!.length - 1) ? 0 : 10 }}>
                                                <span style={{ position: 'absolute', left: -22, top: 2, width: 12, height: 12, borderRadius: '50%', background: a.color, border: '2px solid white', boxShadow: `0 0 0 1px ${a.color}` }} />
                                                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                                    <strong style={{ color: a.color }}>{a.name || a.username}</strong> — {fmtDateTime(a.created_at)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Contenu de tous les amendements fusionnés en un seul rendu Markdown —
                                        chaque portion garde la couleur de son auteur (cf. summary_amended_markdown).
                                        Masqué par défaut : affiché uniquement sur demande. */}
                                    {meeting.summary_amended_markdown && (
                                        <div style={{ marginTop: 12 }}>
                                            <button
                                                className="md-btn-edit"
                                                onClick={() => setShowAmendedContent(v => !v)}
                                            >
                                                {showAmendedContent ? 'Masquer' : 'Afficher'} le contenu des amendements
                                            </button>
                                            {showAmendedContent && (
                                                <div style={{ marginTop: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 14px' }}>
                                                    <div className="md-formatted amended-content" style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.6 }}>
                                                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeRaw]} urlTransform={markdownUrlTransform}>
                                                            {meeting.summary_amended_markdown}
                                                        </ReactMarkdown>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {isGenerating && (() => {
                const stepIndex = isPollingAfterError ? 3 : (genElapsed < 2 ? 0 : genElapsed < 5 ? 1 : 2);
                const steps = [
                    `Connexion à ${aiSource === 'local' ? "l'IA locale AppDSI" : "l'API IA Ville (APM)"}`,
                    `Envoi du prompt (modèle ${selectedModel})`,
                    'Génération de la réponse...',
                    ...(isPollingAfterError ? ['⚠️ Connexion coupée — vérification en arrière-plan...'] : []),
                ];
                return (
                    <div className="gen-modal-overlay">
                        <div className={`gen-modal ${isPollingAfterError ? 'gen-modal-warning' : ''}`}>
                            <div className="gen-modal-header">
                                <img src="/img/Ivry.png" alt="Ville d'Ivry-sur-Seine" className="gen-logo" />
                                <RefreshCw className="animate-spin" size={20} />
                                <h3>{isPollingAfterError ? 'Connexion coupée — vérification en cours...' : "L'Intelligence Artificielle travaille..."}</h3>
                                <span className="gen-timer">{formatDuration(genElapsed)}</span>
                            </div>
                            <div className="gen-modal-body">
                                <p className="gen-subtitle">
                                    {isPollingAfterError
                                        ? "Un proxy réseau a coupé la connexion, mais le serveur continue peut-être de travailler en arrière-plan (déjà constaté). Vérification automatique toutes les 15 s, jusqu'à 10 min."
                                        : 'Génération du résumé et extraction des tâches en cours. Veuillez patienter.'}
                                </p>
                                <ul className="gen-steps">
                                    {steps.map((label, i) => (
                                        <li key={i} className={i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'pending'}>
                                            <span className="gen-step-icon">{i < stepIndex ? '✓' : i === stepIndex ? '●' : '○'}</span>
                                            {label}
                                        </li>
                                    ))}
                                </ul>
                                <div className="stream-box-modal">
                                    {getGenerationPhase(genElapsed, aiSource, selectedModel, isPollingAfterError)}
                                </div>
                                {meeting?.summary_notice && (
                                    <div className="gen-notice">
                                        {(meeting.summary_notice || '').split('\n').map(l => l.trim()).filter(Boolean).map((line, i) => (
                                            <p key={i}>{line}</p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {showTaskValidation && meeting && (
                <TaskValidationModal
                    meetingId={meeting.id}
                    meetingTitle={meeting.title}
                    tasks={pendingAiTasks}
                    agents={dsiAgents}
                    token={token || ''}
                    isGuest={user?.role === 'transcript_guest' || user?.role === 'transcript_agent'}
                    onClose={() => setShowTaskValidation(false)}
                    onValidated={() => { fetchData(); }}
                />
            )}

            {showEmailModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
                    <div style={{ background: 'white', borderRadius: 16, width: '90%', maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem 0.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Envoyer le résumé par mail</h3>
                            <button onClick={() => setShowEmailModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}><X size={18} /></button>
                        </div>
                        <div style={{ padding: '0.5rem 1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#334155', marginBottom: 6 }}>
                                    Participants {emailParticipants.length > 0 ? `(${emailSelected.size}/${emailParticipants.length} sélectionné${emailSelected.size > 1 ? 's' : ''})` : ''}
                                </div>
                                {emailParticipants.length === 0 && <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: 0 }}>Aucun participant connu pour cette réunion.</p>}
                                {emailParticipants.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8, padding: 8 }}>
                                        {emailParticipants.map(p => (
                                            <div key={p.email} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', padding: '3px 4px', borderRadius: 6 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={emailSelected.has(p.email)}
                                                    onChange={e => setEmailSelected(prev => {
                                                        const n = new Set(prev);
                                                        if (e.target.checked) n.add(p.email); else n.delete(p.email);
                                                        return n;
                                                    })}
                                                    style={{ flexShrink: 0 }}
                                                />
                                                <div style={{ display: 'flex', flexDirection: 'column', flex: '0 0 auto', maxWidth: 150, minWidth: 0 }}>
                                                    <span style={{ fontWeight: 600, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                                    {p.internal && p.service && (
                                                        <span style={{ color: '#94A3B8', fontSize: '0.68rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.service}</span>
                                                    )}
                                                </div>
                                                <span style={{ color: '#64748B', fontSize: '0.72rem', flex: '0 0 auto', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</span>
                                                {p.internal ? (
                                                    <div style={{ display: 'flex', gap: 4, flex: 1, minWidth: 0 }}>
                                                        <input
                                                            value={p.fonction || ''}
                                                            onChange={e => updateParticipant(p.email, { fonction: e.target.value })}
                                                            placeholder="Fonction"
                                                            title="Fonction (RH Studio) — modifiable"
                                                            style={participantInputStyle}
                                                        />
                                                        <input
                                                            value={p.service || ''}
                                                            onChange={e => updateParticipant(p.email, { service: e.target.value })}
                                                            placeholder="Service"
                                                            title="Service (RH Studio) — modifiable"
                                                            style={participantInputStyle}
                                                        />
                                                        <input
                                                            value={p.direction || ''}
                                                            onChange={e => updateParticipant(p.email, { direction: e.target.value })}
                                                            placeholder="Direction"
                                                            title="Direction (RH Studio) — modifiable"
                                                            style={participantInputStyle}
                                                        />
                                                    </div>
                                                ) : (
                                                    <span style={{ flex: 1 }} />
                                                )}
                                                <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: p.internal ? '#DCFCE7' : '#FEF3C7', color: p.internal ? '#15803D' : '#B45309' }}>
                                                    {p.internal ? 'interne' : 'externe'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#334155', marginBottom: 6 }}>Destinataires supplémentaires (emails séparés par ; ou ,)</div>
                                <input
                                    type="text"
                                    value={emailExtra}
                                    onChange={e => setEmailExtra(e.target.value)}
                                    placeholder="prenom.nom@exemple.fr ; autre@exemple.fr"
                                    style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#334155', marginBottom: 6 }}>Message d'accompagnement (optionnel)</div>
                                <textarea
                                    value={emailMessage}
                                    onChange={e => setEmailMessage(e.target.value)}
                                    rows={3}
                                    placeholder="Texte libre..."
                                    style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                                />
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                Les participants <strong>internes</strong> recevront en plus un encart indiquant que le transcript complet et le résumé sont accessibles via le magasin d'applications.
                            </div>
                            {emailError && <div style={{ color: '#B91C1C', fontSize: '0.85rem' }}>{emailError}</div>}
                            {emailResult && (
                                <div style={{ color: emailResult.failed ? '#B91C1C' : '#15803D', fontSize: '0.85rem' }}>
                                    {emailResult.sent} mail(s) envoyé(s){emailResult.failed ? `, ${emailResult.failed} échec(s)` : ''}.
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid #F1F5F9' }}>
                            <button onClick={() => setShowEmailModal(false)} style={{ background: '#F1F5F9', color: '#64748B', border: 'none', padding: '0.6rem 1.25rem', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Fermer</button>
                            <button onClick={sendSummaryEmail} disabled={emailSending} style={{ background: '#DC2626', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: 8, fontWeight: 600, cursor: emailSending ? 'default' : 'pointer', opacity: emailSending ? 0.7 : 1 }}>
                                <Send size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{emailSending ? 'Envoi…' : 'Envoyer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {(isEditingAmend || isEditingSummary) && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1150 }}>
                    <div style={{ background: 'white', borderRadius: 16, width: '94%', maxWidth: 1100, height: '90vh', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem 0.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {isEditingAmend ? '✏️ Amender le compte rendu' : '✏️ Modifier le compte rendu'}
                                {isEditingAmend && amendAccess.color && (
                                    <span title={`Vous : ${amendAccess.name}`} style={{ width: 10, height: 10, borderRadius: '50%', background: amendAccess.color, display: 'inline-block' }} />
                                )}
                            </h3>
                            <button onClick={() => { setIsEditingAmend(false); setIsEditingSummary(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}><X size={18} /></button>
                        </div>
                        <div style={{ padding: '0.5rem 1.5rem', overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                            <div className="amend-quill-wrap" style={{ border: `1.5px solid ${isEditingAmend ? (amendAccess.color || '#E2E8F0') : '#E2E8F0'}`, borderRadius: 8, overflow: 'hidden', background: '#fff', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                                {isEditingAmend ? (
                                    <ReactQuill
                                        ref={amendQuillRef}
                                        value={amendEditorHtml}
                                        onChange={setAmendEditorHtml}
                                        modules={AMEND_QUILL_MODULES}
                                        placeholder="Corrigez ou complétez le compte rendu..."
                                        style={{ fontFamily: 'inherit', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
                                    />
                                ) : (
                                    <ReactQuill
                                        ref={summaryQuillRef}
                                        value={summaryDraft}
                                        onChange={setSummaryDraft}
                                        modules={AMEND_QUILL_MODULES}
                                        placeholder="Résumé de la réunion..."
                                        style={{ fontFamily: 'inherit', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
                                    />
                                )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.5rem', flexShrink: 0 }}>
                                {isEditingAmend
                                    ? 'ℹ️ Vos ajouts/suppressions seront tracés (attribués à vous, en couleur) et le compte rendu mis à jour sera automatiquement renvoyé à tous les destinataires du dernier envoi.'
                                    : "ℹ️ Réécriture libre, sans suivi des modifications — ce texte deviendra la version 1 du compte rendu au moment de son premier envoi. Les informations META (demandeur, modèle, date, IA locale et frugale / statut de modification) sont appliquées automatiquement et ne se modifient pas ici."}
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid #F1F5F9' }}>
                            <button className="btn-cancel" onClick={() => { setIsEditingAmend(false); setIsEditingSummary(false); }}>Annuler</button>
                            {isEditingAmend ? (
                                <button className="btn-save" onClick={handleAmendValidateClick} disabled={isAmending}>{isAmending ? 'Enregistrement...' : 'Valider mes amendements'}</button>
                            ) : (
                                <button className="btn-save" onClick={handleSaveSummary} disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showSendConfirmModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
                    <div style={{ background: 'white', borderRadius: 16, width: '90%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)' }}>
                        <div style={{ padding: '1.5rem 1.5rem 0.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1E293B' }}>Envoyer vos amendements ?</h3>
                        </div>
                        <div style={{ padding: '0.5rem 1.5rem 1.25rem', color: '#475569', fontSize: '0.85rem', lineHeight: 1.6 }}>
                            Si vous ne les envoyez pas maintenant, ils resteront dans votre <strong>brouillon</strong> — non validés, non visibles par les autres.
                        </div>

                        <div style={{ margin: '0 1.5rem 1.25rem', padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#334155', marginBottom: 8 }}>
                                📧 Le compte rendu mis à jour sera renvoyé à ({(amendAccess.recipients || []).length + pendingAddRecipients.length - pendingRemoveEmails.size}) :
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                                {(amendAccess.recipients || []).map(r => {
                                    const removed = pendingRemoveEmails.has(r.email);
                                    return (
                                        <div key={r.email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: '0.78rem', color: removed ? '#94A3B8' : '#334155', textDecoration: removed ? 'line-through' : 'none' }}>
                                            <span>{r.name || r.email} {r.name && r.name !== r.email ? <span style={{ color: '#94A3B8' }}>&lt;{r.email}&gt;</span> : null}{!r.internal && <span style={{ color: '#94A3B8' }}> (externe)</span>}</span>
                                            {amendAccess.isAdmin && (
                                                <button onClick={() => toggleRemoveRecipient(r.email)} title={removed ? 'Annuler le retrait' : 'Retirer de la boucle'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: removed ? '#0078A4' : '#DC2626', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>
                                                    {removed ? 'Annuler' : '× Retirer'}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                                {pendingAddRecipients.map(r => (
                                    <div key={r.email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: '0.78rem', color: '#15803D' }}>
                                        <span>+ {r.name || r.email} {r.name && r.name !== r.email ? <span style={{ color: '#86EFAC' }}>&lt;{r.email}&gt;</span> : null}</span>
                                        <button onClick={() => setPendingAddRecipients(prev => prev.filter(p => p.email !== r.email))} title="Annuler l'ajout" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>
                                        × Annuler
                                        </button>
                                    </div>
                                ))}
                            </div>
                            {!amendAccess.isAdmin && (
                                <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: 6 }}>
                                    Vous pouvez ajouter des personnes à la boucle, mais pas en retirer — seul un administrateur le peut.
                                </div>
                            )}
                            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #E2E8F0' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>+ Ajouter une personne à la boucle</div>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="text"
                                        placeholder="Rechercher un agent (AD)..."
                                        value={recipientAd.query}
                                        onChange={e => recipientAd.setQuery(e.target.value)}
                                        style={{ width: '100%', padding: '6px 10px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: '0.78rem', boxSizing: 'border-box' }}
                                    />
                                    {recipientAd.searching && <span style={{ position: 'absolute', right: 8, top: 6, fontSize: '0.7rem', color: '#94A3B8' }}>...</span>}
                                    {recipientAd.results.length > 0 && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #CBD5E1', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 140, overflowY: 'auto' }}>
                                            {recipientAd.results.map(u => (
                                                <div key={u.username} onClick={() => addPendingRecipient(u.email, u.displayName)}
                                                    style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9', fontSize: '0.78rem' }}
                                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#EFF6FF'}
                                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}
                                                >
                                                    <div style={{ fontWeight: 600, color: '#1E293B' }}>{u.displayName}</div>
                                                    <div style={{ color: '#64748B', fontSize: '0.72rem' }}>{u.email || "Pas d'email AD"}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                    <input
                                        type="email"
                                        placeholder="ou email externe : prenom.nom@domaine.fr"
                                        value={manualRecipientEmail}
                                        onChange={e => setManualRecipientEmail(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') addPendingRecipient(manualRecipientEmail, manualRecipientEmail); }}
                                        style={{ flex: 1, padding: '6px 10px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: '0.78rem', boxSizing: 'border-box' }}
                                    />
                                    <button
                                        onClick={() => addPendingRecipient(manualRecipientEmail, manualRecipientEmail)}
                                        disabled={!manualRecipientEmail.includes('@')}
                                        style={{ padding: '6px 12px', background: '#0078A4', color: 'white', border: 'none', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', opacity: manualRecipientEmail.includes('@') ? 1 : 0.5, whiteSpace: 'nowrap' }}
                                    >
                                        + Ajouter
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0 1.5rem 1.5rem' }}>
                            <button
                                onClick={submitAmendment}
                                disabled={isAmending}
                                style={{ background: '#0078A4', color: 'white', border: 'none', padding: '0.7rem 1.25rem', borderRadius: 8, fontWeight: 700, cursor: isAmending ? 'default' : 'pointer', opacity: isAmending ? 0.7 : 1 }}
                            >
                                {isAmending ? 'Envoi...' : 'Oui, envoyer mes amendements'}
                            </button>
                            <button
                                onClick={saveAmendDraft}
                                disabled={isAmending}
                                style={{ background: '#F1F5F9', color: '#334155', border: 'none', padding: '0.7rem 1.25rem', borderRadius: 8, fontWeight: 600, cursor: isAmending ? 'default' : 'pointer' }}
                            >
                                Non, garder en brouillon
                            </button>
                            <button
                                onClick={() => setShowSendConfirmModal(false)}
                                disabled={isAmending}
                                style={{ background: 'none', color: '#94A3B8', border: 'none', padding: '0.4rem', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                                Retour à l'édition
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .md-page {
                    background-color: #F8FAFC;
                    min-height: 100vh;
                    font-family: 'Inter', sans-serif;
                }
                .md-container {
                    max-width: 1400px;
                    margin: 0 auto;
                    padding: 2rem;
                }
                .md-top-nav {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 1.5rem;
                }
                .md-btn-back {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    background: white;
                    border: 1px solid #E2E8F0;
                    padding: 0.5rem 1rem;
                    border-radius: 8px;
                    font-weight: 600;
                    color: #64748B;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .md-btn-back:hover {
                    border-color: #CBD5E1;
                    color: #1E293B;
                }
                .md-btn-generate {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    background: #DC2626;
                    color: white;
                    border: none;
                    padding: 0.6rem 1.25rem;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 4px 6px -1px rgba(220, 38, 38, 0.2);
                }
                .md-btn-generate:hover {
                    background: #B91C1C;
                    transform: translateY(-1px);
                }
                /* Gros bouton « Envoyer par mail » (à côté de Générer résumé IA) */
                .md-btn-email {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    background: #0078A4;
                    color: white;
                    border: none;
                    padding: 0.6rem 1.25rem;
                    border-radius: 8px;
                    font-weight: 600;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 4px 6px -1px rgba(0, 120, 164, 0.25);
                }
                .md-btn-email:hover:not(:disabled) {
                    background: #006287;
                    transform: translateY(-1px);
                }
                .md-btn-email:disabled { opacity: 0.6; cursor: not-allowed; }
                /* Bouton « Générer résumé IA » avec le choix du modèle intégré à droite */
                .md-generate-group {
                    display: inline-flex;
                    align-items: stretch;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 4px 6px -1px rgba(220, 38, 38, 0.2);
                }
                .md-generate-group .md-btn-generate {
                    border-radius: 0;
                    box-shadow: none;
                }
                .md-generate-group .md-btn-generate:hover { transform: none; }
                .md-generate-model {
                    border: none;
                    border-left: 1px solid rgba(255,255,255,0.35);
                    background: #DC2626;
                    color: #fff;
                    font-size: 0.78rem;
                    font-weight: 600;
                    padding: 0 1.6rem 0 0.6rem;
                    max-width: 170px;
                    outline: none;
                    cursor: pointer;
                    appearance: none;
                    -webkit-appearance: none;
                    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
                    background-repeat: no-repeat;
                    background-position: right 0.5rem center;
                }
                .md-generate-model:hover:not(:disabled) { background: #B91C1C; }
                .md-generate-model:disabled { opacity: 0.75; cursor: default; }
                .md-generate-model option { color: #1E293B; background: #fff; }
                .md-actions {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .md-model-select {
                    padding: 0.55rem 0.75rem;
                    border: 1px solid #E2E8F0;
                    border-radius: 8px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #334155;
                    background: white;
                    outline: none;
                    min-width: 160px;
                }
                .md-model-select:focus { border-color: #DC2626; }

                .md-header-card {
                    background: white;
                    padding: 2rem;
                    border-radius: 16px;
                    margin-bottom: 2rem;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .md-header-card h1 {
                    font-size: 2rem;
                    font-weight: 800;
                    color: #111827;
                    margin: 0 0 1rem 0;
                }
                .md-meta {
                    display: flex;
                    gap: 1.5rem;
                    color: #64748B;
                    font-size: 0.875rem;
                }
                .meta-item {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                }
                .md-btn-edit {
                    background: #F1F5F9;
                    border: none;
                    padding: 0.4rem 0.8rem;
                    border-radius: 6px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: #64748B;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .md-btn-edit:hover {
                    background: #E2E8F0;
                    color: #1E293B;
                }
                .md-edit-form {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }
                .md-edit-form .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                .md-edit-form label {
                    font-size: 0.875rem;
                    font-weight: 600;
                    color: #64748B;
                }
                .md-edit-form input {
                    padding: 0.75rem;
                    border: 1px solid #E2E8F0;
                    border-radius: 8px;
                    font-size: 1rem;
                    outline: none;
                }
                .md-edit-form input:focus {
                    border-color: #DC2626;
                }
                .md-edit-form .form-actions {
                    display: flex;
                    gap: 1rem;
                }
                .btn-save {
                    background: #DC2626;
                    color: white;
                    border: none;
                    padding: 0.6rem 1.25rem;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                }
                .btn-cancel {
                    background: #F1F5F9;
                    color: #64748B;
                    border: none;
                    padding: 0.6rem 1.25rem;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                }

                .md-grid {
                    display: grid;
                    grid-template-columns: 380px 1fr;
                    gap: 2rem;
                }
                /* Sans min-width:0, un enfant de grille ne peut jamais devenir plus
                   étroit que son contenu le plus large (ex. une ligne de résumé sans
                   césure) — ça élargissait toute la page au lieu de faire retourner
                   le texte à la ligne. */
                .md-sidebar, .md-main { min-width: 0; }

                .md-card {
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    margin-bottom: 2rem;
                    overflow: hidden;
                }
                .card-head {
                    padding: 1.25rem 1.5rem;
                    border-bottom: 1px solid #F1F5F9;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .card-head h2 {
                    font-size: 1rem;
                    font-weight: 700;
                    color: #334155;
                    margin: 0;
                    flex: 1;
                }

                .speaker-list { padding: 1.5rem; }
                .speaker-stat { margin-bottom: 1.25rem; padding: 0.35rem 0.5rem; margin-left: -0.5rem; margin-right: -0.5rem; border-radius: 8px; transition: background 0.15s, box-shadow 0.15s; }
                .speaker-stat:hover { background: #F1F5F9; }
                .speaker-stat-active { background: #EFF6FF; box-shadow: inset 0 0 0 1.5px #2563EB; }
                .speaker-stat-active .s-name { color: #1D4ED8; }
                .speaker-filter-chip {
                    display: inline-flex; align-items: center; gap: 0.35rem;
                    background: #EFF6FF; border: 1px solid #BFDBFE; color: #1D4ED8;
                    font-size: 0.75rem; font-weight: 700;
                    padding: 2px 4px 2px 10px; border-radius: 999px;
                }
                .speaker-filter-chip .search-clear { color: #1D4ED8; font-size: 0.7rem; }
                .speaker-labels {
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.875rem;
                    margin-bottom: 0.5rem;
                }
                .s-name { font-weight: 600; color: #475569; }
                .s-pct { color: #94A3B8; font-weight: 500; }
                .s-progress {
                    height: 6px;
                    background: #F1F5F9;
                    border-radius: 3px;
                    overflow: hidden;
                }
                .s-bar { height: 100%; transition: width 0.4s ease; }
                .md-btn-more {
                    width: 100%;
                    padding: 0.5rem;
                    background: #F8FAFC;
                    border: 1px dashed #E2E8F0;
                    border-radius: 8px;
                    color: #64748B;
                    font-size: 0.75rem;
                    font-weight: 600;
                    cursor: pointer;
                    margin-top: 0.5rem;
                    transition: all 0.2s;
                }
                .md-btn-more:hover {
                    background: #F1F5F9;
                    color: #1E293B;
                    border-color: #CBD5E1;
                }

                .summary-content { padding: 1.5rem; font-size: 0.9375rem; line-height: 1.7; color: #475569; overflow-wrap: anywhere; }
                .md-formatted, .amended-content, .ql-editor { overflow-wrap: anywhere; }
                .ql-editor table { border-collapse: collapse; width: 100%; }
                .ql-editor table td { border: 1px solid #E2E8F0; padding: 0.3rem 0.5rem; }
                /* Mêmes espacements que .md-formatted (affichage final) — sans
                   ça l'éditeur montrait tout collé alors que le résultat envoyé
                   a un vrai espacement entre paragraphes, ce qui ne correspond
                   pas à ce que l'amendeur voit en train d'écrire. */
                .ql-editor p { margin: 0 0 0.85rem; }
                .ql-editor h1, .ql-editor h2, .ql-editor h3 { margin: 1.5rem 0 0.6rem; }
                .ql-editor h1:first-child, .ql-editor h2:first-child, .ql-editor h3:first-child { margin-top: 0; }
                .ql-editor li { margin-bottom: 0.3rem; }
                /* Modale d'amendement : la zone d'édition doit occuper tout
                   l'espace disponible dans la modale, pas seulement une
                   petite zone par défaut. */
                .amend-quill-wrap .ql-container { flex: 1; min-height: 0; position: relative; }
                .amend-quill-wrap .ql-toolbar { flex-shrink: 0; }
                /* .ql-container est déjà position:relative (CSS Quill) : on sort
                   .ql-editor du flux et on le cale exactement sur ses 4 bords —
                   plus fiable qu'un 3e niveau de flex imbriqué (qui laissait une
                   zone blanche vide sous une petite case d'édition figée). */
                .amend-quill-wrap .ql-editor { position: absolute; inset: 0; overflow-y: auto; max-height: none; min-height: 0; }
                .stream-box { white-space: pre-wrap; color: #1D4ED8; font-weight: 500; }
                .md-formatted h1, .md-formatted h2, .md-formatted h3 {
                    color: #111827; font-weight: 700; line-height: 1.3;
                    margin: 1.5rem 0 0.6rem;
                }
                .md-formatted h1 { font-size: 1.3rem; }
                .md-formatted h2 { font-size: 1.1rem; }
                .md-formatted h3 { font-size: 1rem; }
                .md-formatted h1:first-child, .md-formatted h2:first-child, .md-formatted h3:first-child { margin-top: 0; }
                .md-formatted p { margin: 0 0 0.85rem; }
                .md-formatted p:last-child { margin-bottom: 0; }
                .md-formatted ul, .md-formatted ol { padding-left: 1.4rem; margin: 0 0 1rem; }
                .md-formatted li { margin-bottom: 0.3rem; }
                .md-formatted li > ul, .md-formatted li > ol { margin-top: 0.3rem; }
                .md-formatted table { border-collapse: collapse; width: 100%; margin: 0 0 1rem; font-size: 0.85rem; display: block; overflow-x: auto; }
                .md-formatted th, .md-formatted td { border: 1px solid #E2E8F0; padding: 0.4rem 0.6rem; text-align: left; }
                .md-formatted th { background: #F8FAFC; font-weight: 700; color: #334155; }
                .md-formatted strong { color: #1E293B; font-weight: 700; }
                .md-formatted code {
                    background: #F1F5F9; color: #BE185D; padding: 0.1rem 0.35rem;
                    border-radius: 4px; font-size: 0.85em; font-family: 'Fira Code', monospace;
                }
                .md-formatted blockquote {
                    border-left: 3px solid #E2E8F0; margin: 0 0 1rem; padding: 0.25rem 0 0.25rem 1rem;
                    color: #64748B; font-style: italic;
                }
                .md-formatted hr { border: none; border-top: 1px solid #E2E8F0; margin: 1.25rem 0; }
                .md-formatted table {
                    width: 100%; border-collapse: collapse; margin: 0 0 1.25rem;
                    font-size: 0.875rem;
                }
                .md-formatted th, .md-formatted td {
                    border: 1px solid #E2E8F0; padding: 0.5rem 0.75rem; text-align: left;
                }
                .md-formatted th { background: #F8FAFC; color: #334155; font-weight: 700; }
                .md-formatted tr:nth-child(even) td { background: #FBFDFF; }

                .tasks-list { padding: 0; }
                .task-item {
                    display: flex;
                    gap: 1rem;
                    padding: 1rem 1.5rem;
                    border-bottom: 1px solid #F1F5F9;
                    transition: background 0.2s;
                }
                .task-item:hover { background: #FBFBFF; }
                .task-item.done { opacity: 0.6; }
                .task-toggle {
                    background: none;
                    border: none;
                    padding: 0;
                    color: #CBD5E1;
                    cursor: pointer;
                    transition: color 0.2s;
                }
                .task-item.done .task-toggle { color: #10B981; }
                .task-body p { margin: 0; font-size: 0.875rem; color: #334155; font-weight: 500; }
                .task-foot { display: flex; gap: 1rem; margin-top: 0.4rem; font-size: 0.75rem; flex-wrap: wrap; }
                .who { color: #2563EB; font-weight: 600; }
                .who.unmatched { color: #D97706; }
                .deadline { color: #64748B; font-style: italic; }
                .linked-badge {
                    display: inline-flex; align-items: center; gap: 4px;
                    color: #15803D; background: #F0FDF4; font-weight: 600;
                    padding: 1px 8px; border-radius: 10px; font-size: 0.7rem;
                }
                .md-btn-propose {
                    display: inline-flex; align-items: center; gap: 0.4rem;
                    background: #F59E0B; color: white; border: none;
                    padding: 0.5rem 1rem; border-radius: 8px; font-weight: 700;
                    font-size: 0.8rem; cursor: pointer; transition: background 0.2s;
                }
                .md-btn-propose:hover { background: #D97706; }
                .md-btn-add-att {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                    background: #3B82F6;
                    color: white;
                    border: none;
                    padding: 0.4rem 0.8rem;
                    border-radius: 8px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: background 0.2s;
                    white-space: nowrap;
                    margin-left: auto;
                }
                .md-btn-add-att:hover { background: #2563EB; }
                .md-btn-add-att:disabled { opacity: 0.6; cursor: not-allowed; }
                .ts {
                    background: #F1F5F9;
                    border: none;
                    padding: 0.1rem 0.4rem;
                    border-radius: 4px;
                    color: #64748B;
                    cursor: pointer;
                    font-family: monospace;
                }
                .task-actions {
                    display: flex;
                    gap: 0.25rem;
                    opacity: 0;
                    transition: opacity 0.15s;
                    flex-shrink: 0;
                    align-self: center;
                }
                .task-item:hover .task-actions { opacity: 1; }
                .task-action-btn {
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 0.85rem;
                    padding: 0.2rem 0.3rem;
                    border-radius: 4px;
                    line-height: 1;
                    transition: background 0.15s;
                }
                .task-action-btn:hover { background: #F1F5F9; }
                .task-edit-input {
                    width: 100%;
                    border: 1px solid #E2E8F0;
                    border-radius: 6px;
                    padding: 0.4rem 0.6rem;
                    font-size: 0.85rem;
                    outline: none;
                    font-family: inherit;
                }
                .task-edit-input:focus { border-color: #DC2626; }

                .transcript-card {
                    display: flex;
                    flex-direction: column;
                    max-height: calc(100vh - 250px);
                }
                .transcript-body {
                    padding: 1.5rem;
                    overflow-y: auto;
                    flex: 1;
                }
                .transcript-search {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    background: #F1F5F9;
                    padding: 0.4rem 0.75rem;
                    border-radius: 20px;
                }
                .transcript-search input {
                    border: none;
                    background: transparent;
                    font-size: 0.8rem;
                    outline: none;
                    width: 140px;
                }
                .search-clear {
                    background: none;
                    border: none;
                    color: #94A3B8;
                    cursor: pointer;
                    padding: 0;
                    font-size: 0.75rem;
                    line-height: 1;
                }
                .search-clear:hover { color: #475569; }
                .search-count {
                    font-size: 0.75rem;
                    color: #2563EB;
                    font-weight: 600;
                    background: #EFF6FF;
                    padding: 0.2rem 0.6rem;
                    border-radius: 20px;
                }
                mark.hl {
                    background: #FEF08A;
                    color: inherit;
                    border-radius: 2px;
                    padding: 0 1px;
                }
                .cue-row {
                    display: grid;
                    grid-template-columns: 80px 180px 1fr;
                    gap: 1rem;
                    padding: 0.875rem 0;
                    border-bottom: 1px solid #F8FAFC;
                    transition: background 0.2s;
                }
                .cue-row:hover { background: #FBFDFF; }
                .cue-row.highlight { background: #FEF9C3; }
                
                .cue-time {
                    font-family: monospace;
                    font-size: 0.8rem;
                    color: #94A3B8;
                    cursor: pointer;
                    padding-top: 0.1rem;
                }
                .cue-time:hover { color: #2563EB; text-decoration: underline; }
                .cue-speaker-block {
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                .cue-speaker {
                    font-weight: 700;
                    font-size: 0.9375rem;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .cue-email {
                    font-size: 0.75rem;
                    color: #94A3B8;
                    font-weight: 400;
                }
                .cue-text {
                    font-size: 0.9375rem;
                    line-height: 1.6;
                    color: #1E293B;
                    overflow-wrap: anywhere;
                }

                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

                .stream-box-modal {
                    background: #1E293B;
                    color: #E2E8F0;
                    padding: 1rem 1.25rem;
                    border-radius: 8px;
                    font-family: 'Fira Code', monospace;
                    font-size: 0.85rem;
                    white-space: pre-wrap;
                    overflow-y: auto;
                    min-height: 64px;
                    max-height: 130px;
                    box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
                    line-height: 1.6;
                }
                /* Avertissement (IA locale/souveraine, vérification, responsabilité)
                   affiché en gros et en couleur vive pendant la génération. */
                .gen-notice {
                    margin-top: 1rem;
                    padding: 1rem 1.1rem;
                    background: #FEF08A;
                    border: 2px solid #F59E0B;
                    border-radius: 10px;
                    color: #B91C1C;
                    font-weight: 800;
                    font-size: 1.05rem;
                    line-height: 1.5;
                    text-align: left;
                }
                .gen-notice p { margin: 0.35rem 0; }
                .gen-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(15, 23, 42, 0.75);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                .gen-modal {
                    background: white;
                    border-radius: 16px;
                    width: 90%;
                    max-width: 800px;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                    overflow: hidden;
                    animation: modalPop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    border-top: 4px solid transparent;
                }
                .gen-modal-warning { border-top-color: #F59E0B; }
                .gen-modal-warning .gen-modal-header { color: #D97706; }
                .gen-modal-warning .gen-timer { background: #FFFBEB; color: #D97706; }
                @keyframes modalPop {
                    from { opacity: 0; transform: scale(0.95) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                .gen-modal-header {
                    background: #F8FAFC;
                    padding: 1.25rem 2rem;
                    border-bottom: 1px solid #E2E8F0;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    color: #2563EB;
                }
                .gen-logo {
                    height: 38px;
                    width: auto;
                    flex-shrink: 0;
                    margin-right: 0.25rem;
                }
                .gen-modal-header h3 {
                    margin: 0;
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: #1E293B;
                    flex: 1;
                }
                .gen-timer {
                    font-family: 'Fira Code', monospace;
                    font-size: 0.95rem;
                    font-weight: 700;
                    color: #2563EB;
                    background: #EFF6FF;
                    padding: 0.25rem 0.7rem;
                    border-radius: 20px;
                }
                .gen-modal-body {
                    padding: 2rem;
                }
                .gen-subtitle {
                    color: #64748B;
                    margin-top: 0;
                    margin-bottom: 1.5rem;
                    font-size: 0.95rem;
                }
                .gen-steps {
                    list-style: none;
                    margin: 0 0 1.25rem;
                    padding: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 0.6rem;
                }
                .gen-steps li {
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    font-size: 0.9rem;
                    color: #94A3B8;
                }
                .gen-steps li.done { color: #16A34A; }
                .gen-steps li.active { color: #1E293B; font-weight: 700; }
                .gen-step-icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    font-size: 0.75rem;
                    flex-shrink: 0;
                }
                .gen-steps li.done .gen-step-icon { background: #DCFCE7; color: #16A34A; }
                .gen-steps li.active .gen-step-icon { background: #DBEAFE; color: #2563EB; animation: pulse 1.4s ease-in-out infinite; }
                .gen-steps li.pending .gen-step-icon { background: #F1F5F9; color: #CBD5E1; }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
                .gen-counter {
                    font-family: 'Fira Code', monospace;
                    font-size: 0.85em;
                    color: #64748B;
                }
            `}</style>
        </div>
    );
};

function highlightText(text: string, search: string): string {
    if (!search) return text;
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="hl">$1</mark>');
}

function formatTime(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** "45 s", "2 min 03 s" — pour le compteur et les messages d'erreur de génération. */
function formatDuration(totalSec: number): string {
    if (totalSec < 60) return `${totalSec} s`;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m} min ${s.toString().padStart(2, '0')} s`;
}

/**
 * Phase affichée pendant la génération — approximative (l'appel est un seul
 * POST bloquant, pas un flux d'événements serveur) mais donne un repère utile
 * sur ce qui se passe, et au-delà d'un certain temps un indice diagnostique :
 * une coupure aux alentours de 60s pointe vers un timeout de proxy (défaut
 * nginx), au-delà de plusieurs minutes vers l'attente réelle du modèle.
 * isPolling : la connexion a déjà été coupée une fois ; on revérifie
 * périodiquement en arrière-plan si le résultat finit par arriver quand même.
 */
function getGenerationPhase(elapsedSec: number, aiSource: 'apm' | 'local', selectedModel: string, isPolling: boolean): string {
    if (isPolling) return 'Connexion réseau coupée — vérification périodique en arrière-plan (le serveur continue peut-être de travailler)...';
    if (elapsedSec < 2) return `Connexion à ${aiSource === 'local' ? "l'IA locale AppDSI" : "l'API IA Ville (APM)"}...`;
    if (elapsedSec < 5) return `Envoi du prompt (modèle ${selectedModel})...`;
    if (elapsedSec < 55) return 'Génération en cours...';
    if (elapsedSec < 90) return 'Toujours en attente — au-delà d\'une minute, un proxy réseau intermédiaire pourrait couper la connexion.';
    return 'Toujours en attente — la génération peut prendre plusieurs minutes selon le modèle.';
}

export default MeetingDetail;
