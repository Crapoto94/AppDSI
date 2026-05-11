import React, { useEffect, useState, useRef } from 'react';
import Header from '../../components/Header';
import { 
    ArrowLeft, Calendar, Clock, Send, 
    CheckCircle2, Circle, RefreshCw, 
    MessageSquare, ListTodo, FileText, Search, Users
} from 'lucide-react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

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
}

interface Task {
    id: number;
    description: string;
    assignee: string;
    requester: string;
    deadline: string;
    is_completed: boolean;
    start_seconds?: number;
}

const MeetingDetail: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth();
    const [meeting, setMeeting] = useState<Meeting | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editValues, setEditValues] = useState({ title: '', meeting_date: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [showAllSpeakers, setShowAllSpeakers] = useState(false);
    const [streamText, setStreamText] = useState("");
    const [transcriptSearch, setTranscriptSearch] = useState("");
    const [isEditingSummary, setIsEditingSummary] = useState(false);
    const [summaryDraft, setSummaryDraft] = useState("");
    const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
    const [taskDraft, setTaskDraft] = useState({ description: '', assignee: '', requester: '', deadline: '' });
    const transcriptRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchData();
    }, [id, token]);

    const fetchData = async () => {
        if (!token || !id) return;
        try {
            const [mRes, tRes] = await Promise.all([
                axios.get(`/api/transcriptmanager/meeting/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`/api/transcriptmanager/tasks?meeting_id=${id}`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            setMeeting(mRes.data);
            setEditValues({
                title: mRes.data.title || '',
                meeting_date: mRes.data.meeting_date ? new Date(mRes.data.meeting_date).toISOString().split('T')[0] : new Date(mRes.data.created_at).toISOString().split('T')[0]
            });
            setTasks(tRes.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
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

    const handleSummarize = async () => {
        if (!id || !token) return;
        setIsGenerating(true);
        setStreamText("");
        
        try {
            const response = await fetch(`/api/transcriptmanager/meeting/${id}/summarize`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                alert(errData.error || "Une erreur est survenue lors de la connexion au modèle.");
                setIsGenerating(false);
                return;
            }

            if (!response.body) return;
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = "";

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const content = line.slice(6).replace(/\\n/g, '\n');
                        fullText += content;
                        // Strip JSON part for display
                        setStreamText(fullText.split(/##\s*(?:Plan d'action|Tâches|Actions)|```json/i)[0]);
                    } else if (line.startsWith('event: done')) {
                        setIsGenerating(false);
                        fetchData();
                        return;
                    } else if (line.startsWith('event: error')) {
                        try {
                            const errDataLine = line.split('\n').find(l => l.startsWith('data: '));
                            if (errDataLine) {
                                const errJson = JSON.parse(errDataLine.slice(6));
                                alert(errJson.error || "Erreur de génération du résumé.");
                            } else {
                                alert("Erreur de génération du résumé.");
                            }
                        } catch (e) {
                            alert("Erreur de génération du résumé.");
                        }
                        setIsGenerating(false);
                        return;
                    }
                }
            }
            
            setIsGenerating(false);
            fetchData();
        } catch (err) {
            console.error(err);
            setIsGenerating(false);
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
            await axios.put(`/api/transcriptmanager/meeting/${id}`, {
                title: meeting.title,
                meeting_date: meeting.meeting_date || meeting.created_at,
                summary: summaryDraft
            }, { headers: { Authorization: `Bearer ${token}` } });
            setMeeting({ ...meeting, summary: summaryDraft });
            setIsEditingSummary(false);
        } catch (err) { console.error(err); }
        finally { setIsSaving(false); }
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
            <Header />
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
    const totalCues = meeting.cues?.length || 0;
    const searchLower = transcriptSearch.toLowerCase();
    const filteredCues = transcriptSearch
        ? (meeting.cues || []).filter(c =>
            c.text.toLowerCase().includes(searchLower) ||
            c.speaker_name.toLowerCase().includes(searchLower))
        : (meeting.cues || []);

    return (
        <div className="md-page">
            <Header />
            <div className="md-container">
                <div className="md-top-nav">
                    <button className="md-btn-back" onClick={() => navigate('/transcriptmanager')}>
                        <ArrowLeft size={18} /> Retour
                    </button>
                    <div className="md-actions">
                        <button 
                            className={`md-btn-generate ${isGenerating ? 'loading' : ''}`}
                            onClick={handleSummarize}
                            disabled={isGenerating}
                        >
                            {isGenerating ? <RefreshCw className="animate-spin" size={18} /> : <Send size={18} />}
                            {isGenerating ? 'Génération...' : 'Générer le résumé'}
                        </button>
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
                                <span className="meta-item"><Calendar size={14} /> {new Date(meeting.meeting_date || meeting.created_at).toLocaleDateString('fr-FR')}</span>
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
                                            <div key={idx} className="speaker-stat">
                                                <div className="speaker-labels">
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span className="s-name">{speaker.name}</span>
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

                        <div className="md-card summary-card">
                            <div className="card-head">
                                <MessageSquare size={18} />
                                <h2>Résumé Exécutif</h2>
                                {!isGenerating && !isEditingSummary && (
                                    <button className="md-btn-edit" onClick={() => {
                                        setSummaryDraft(meeting.summary || '');
                                        setIsEditingSummary(true);
                                    }}>Modifier</button>
                                )}
                            </div>
                            <div className="summary-content">
                                {isGenerating ? (
                                    <div className="stream-box">{streamText}</div>
                                ) : isEditingSummary ? (
                                    <div>
                                        <textarea
                                            style={{ width: '100%', minHeight: '220px', fontFamily: 'inherit', fontSize: '0.9rem', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0.75rem', resize: 'vertical', outline: 'none', lineHeight: 1.6 }}
                                            value={summaryDraft}
                                            onChange={e => setSummaryDraft(e.target.value)}
                                            autoFocus
                                        />
                                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                                            <button className="btn-save" onClick={handleSaveSummary} disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</button>
                                            <button className="btn-cancel" onClick={() => setIsEditingSummary(false)}>Annuler</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="md-formatted" dangerouslySetInnerHTML={{ __html: formatMarkdown(meeting.summary || "Aucun résumé généré.") }} />
                                )}
                            </div>
                        </div>

                        <div className="md-card tasks-card">
                            <div className="card-head">
                                <ListTodo size={18} />
                                <h2>Plan d'Action</h2>
                                <span className="badge">{tasks.length}</span>
                            </div>
                            <div className="tasks-list">
                                {tasks.length > 0 ? tasks.map(task => (
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
                                                    <p>{task.description}</p>
                                                    <div className="task-foot">
                                                        {task.assignee && <span className="who">@{task.assignee}</span>}
                                                        {task.deadline && <span className="deadline">{task.deadline}</span>}
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
                                )) : <p className="no-tasks">Aucune tâche.</p>}
                            </div>
                        </div>
                    </div>

                    <div className="md-main">
                        <div className="md-card transcript-card">
                            <div className="card-head">
                                <FileText size={18} />
                                <h2>Transcription</h2>
                                {transcriptSearch && (
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
                                        <div className="cue-speaker-block" style={{ color: `hsl(${(speakers.indexOf(cue.speaker_name) * 137) % 360}, 65%, 40%)` }}>
                                            <span className="cue-speaker">{cue.speaker_name}</span>
                                            {cue.speaker_email && <span className="cue-email">{cue.speaker_email}</span>}
                                        </div>
                                        <div
                                            className="cue-text"
                                            dangerouslySetInnerHTML={{ __html: highlightText(cue.text, transcriptSearch) }}
                                        />
                                    </div>
                                )) : <p className="no-data">{transcriptSearch ? 'Aucun résultat.' : 'Aucune transcription disponible.'}</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {isGenerating && (
                <div className="gen-modal-overlay">
                    <div className="gen-modal">
                        <div className="gen-modal-header">
                            <RefreshCw className="animate-spin" size={20} />
                            <h3>L'Intelligence Artificielle travaille...</h3>
                        </div>
                        <div className="gen-modal-body">
                            <p className="gen-subtitle">Génération du résumé et extraction des tâches en cours. Veuillez patienter.</p>
                            <div className="stream-box-modal">
                                {streamText || "Connexion au modèle d'IA..."}
                            </div>
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
                .speaker-stat { margin-bottom: 1.25rem; }
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

                .summary-content { padding: 1.5rem; font-size: 0.9375rem; line-height: 1.7; color: #475569; }
                .stream-box { white-space: pre-wrap; color: #1D4ED8; font-weight: 500; }
                .md-formatted h2 { font-size: 1.1rem; color: #111827; margin: 1.5rem 0 0.5rem; }
                .md-formatted h2:first-child { margin-top: 0; }
                .md-formatted ul { padding-left: 1.25rem; margin-bottom: 1rem; }

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
                .deadline { color: #64748B; font-style: italic; }
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
                }

                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

                .stream-box-modal {
                    background: #1E293B;
                    color: #E2E8F0;
                    padding: 1.5rem;
                    border-radius: 8px;
                    font-family: 'Fira Code', monospace;
                    font-size: 0.85rem;
                    white-space: pre-wrap;
                    overflow-y: auto;
                    height: 400px;
                    box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
                    line-height: 1.6;
                }
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
                }
                @keyframes modalPop {
                    from { opacity: 0; transform: scale(0.95) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                .gen-modal-header {
                    background: #F8FAFC;
                    padding: 1.5rem 2rem;
                    border-bottom: 1px solid #E2E8F0;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    color: #2563EB;
                }
                .gen-modal-header h3 {
                    margin: 0;
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: #1E293B;
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

function formatMarkdown(text: string) {
    if (!text) return "";
    return text
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>')
        .replace(/<\/ul>\s*<ul>/g, "")
        .replace(/\n/g, '<br/>');
}

export default MeetingDetail;
