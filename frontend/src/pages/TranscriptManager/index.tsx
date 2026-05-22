import React, { useEffect, useState, useRef } from 'react';
import Header from '../../components/Header';
import {
    Calendar, FileText, Plus, Search, Trash2,
    ArrowRight, Users, RefreshCw, UserCheck, Clock, Sparkles
} from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import ReunionDetailModal from '../../components/ReunionDetailModal';
import { useAuth } from '../../contexts/AuthContext';

interface Meeting {
    id: number;
    title: string;
    meeting_date: string;
    summary: string;
    created_at: string;
    speaker_count?: number;
    speaker_emails?: string;
    reunion_id?: number | null;
    duration_seconds?: number;
    char_count?: number;
    shared_with_direction?: string | null;
    shared_with_service?: string | null;
}

interface SearchMatch {
    cue_id: number;
    speaker_name: string;
    text: string;
    start_seconds: number;
}

interface SearchResult {
    meeting_id: number;
    meeting_title: string;
    meeting_date: string;
    created_at: string;
    matches: SearchMatch[];
}

const formatTime = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const TranscriptManager: React.FC = () => {
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [globalQuery, setGlobalQuery] = useState("");
    const [globalResults, setGlobalResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState("");
    const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchVersion = useRef(0);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [importStatus, setImportStatus] = useState("");
    const [selectedReunionId, setSelectedReunionId] = useState<number | null>(null);
    const { token, user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        console.log("Current user email:", user?.email);
        fetchData();
    }, [token, user]);

    const fetchData = async () => {
        if (!token) return;
        try {
            const mRes = await axios.get('/api/transcriptmanager/meetings', { headers: { Authorization: `Bearer ${token}` } });
            setMeetings(mRes.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !token) return;

        const formData = new FormData();
        formData.append('file', file);

        setIsUploading(true);
        setUploadProgress(0);
        setImportStatus("Téléchargement...");

        try {
            const res = await axios.post('/api/transcriptmanager/upload', formData, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress: (p) => {
                    const pct = Math.round((p.loaded * 100) / (p.total || 100));
                    setUploadProgress(Math.min(10, Math.round(pct / 10)));
                }
            });

            const jobId = res.data.jobId;
            
            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await axios.get(`/api/transcriptmanager/upload-status/${jobId}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    
                    const { progress, status, meetingId } = statusRes.data;
                    setUploadProgress(progress);
                    setImportStatus(status);

                    if (status === 'completed') {
                        clearInterval(pollInterval);
                        setIsUploading(false);
                        navigate(`/transcriptmanager/meeting/${meetingId}`);
                    } else if (status === 'error') {
                        clearInterval(pollInterval);
                        setIsUploading(false);
                        alert(statusRes.data.message || "Une erreur est survenue");
                    }
                } catch (err) {
                    clearInterval(pollInterval);
                    setIsUploading(false);
                    console.error(err);
                }
            }, 1500);

        } catch (err) {
            setIsUploading(false);
            console.error(err);
        }
    };

    const handleDeleteMeeting = async (id: number) => {
        if (!window.confirm("Supprimer cette réunion et toutes les données associées ?")) return;
        try {
            await axios.delete(`/api/transcriptmanager/meeting/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMeetings(meetings.filter(m => m.id !== id));
        } catch (err) {
            alert("Erreur lors de la suppression");
        }
    };

    const filteredMeetings = meetings.filter(m =>
        m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.summary?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleGlobalSearch = (q: string) => {
        setGlobalQuery(q);
        setSearchError("");
        if (searchDebounce.current) clearTimeout(searchDebounce.current);
        if (q.trim().length < 2) {
            setGlobalResults([]);
            setIsSearching(false);
            return;
        }
        setIsSearching(true);
        const version = ++searchVersion.current;
        searchDebounce.current = setTimeout(async () => {
            try {
                const res = await axios.get(`/api/transcriptmanager/search?q=${encodeURIComponent(q.trim())}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (version === searchVersion.current) {
                    setGlobalResults(res.data);
                }
            } catch (err: any) {
                if (version === searchVersion.current) {
                    const status = err.response?.status;
                    const msg = err.response?.data?.error || err.response?.data || err.message || "Erreur inconnue";
                    setSearchError(`Erreur ${status || ''}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
                    setGlobalResults([]);
                }
            } finally {
                if (version === searchVersion.current) setIsSearching(false);
            }
        }, 350);
    };

    return (
        <div className="tm-page">
            <Header />
            <div className="tm-container">
                <div className="tm-top-bar">
                    <div className="tm-title-section">
                        <h1>Transcript Manager</h1>
                        <p>{meetings.length} Réunions traitées par l'Intelligence Artificielle</p>
                    </div>
                    <div className="tm-actions">
                        <div className="tm-search-box">
                            <Search size={18} />
                            <input
                                type="text"
                                placeholder="Filtrer par titre..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button className="tm-btn-search" onClick={() => { setIsSearchModalOpen(true); setGlobalQuery(""); setGlobalResults([]); setSearchError(""); setIsSearching(false); }}>
                            <Search size={18} />
                            Recherche dans les contenus
                        </button>
                        <input
                            type="file"
                            id="tm-upload"
                            accept=".vtt,.txt"
                            style={{ display: 'none' }}
                            onChange={handleFileUpload}
                        />
                        <label htmlFor="tm-upload" className="tm-btn-primary">
                            <Plus size={20} />
                            Importer
                        </label>
                    </div>
                </div>

                {isUploading && (
                    <div className="tm-upload-progress">
                        <div className="progress-header">
                            <div className="status-badge">
                                <RefreshCw className="animate-spin" size={14} />
                                <span>{importStatus}...</span>
                            </div>
                            <span className="pct">{uploadProgress}%</span>
                        </div>
                        <div className="progress-bar-container">
                            <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                    </div>
                )}

                <div className="tm-grid">
                    <div className="tm-main">
                        <div className="tm-card">
                            <div className="card-header">
                                <FileText size={18} />
                                <h2>Réunions Récentes</h2>
                            </div>
                            <table className="tm-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Réunion</th>
                                        <th className="text-center">Durée</th>
                                        <th className="text-center">Intervenants</th>
                                        <th className="text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMeetings.length > 0 ? filteredMeetings.map(meeting => (
                                        <tr key={meeting.id} className="tm-row" onClick={() => navigate(`/transcriptmanager/meeting/${meeting.id}`)}>
                                            <td className="date-cell">
                                                <div className="date-badge">
                                                    <Calendar size={14} />
                                                    {new Date(meeting.meeting_date || meeting.created_at).toLocaleDateString('fr-FR')}
                                                </div>
                                            </td>
                                            <td className="title-cell">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                                    <span className="meeting-title">{meeting.title}</span>
                                                    {(meeting.shared_with_direction || meeting.shared_with_service) && (
                                                        <span title={`Partagé avec : ${meeting.shared_with_service || meeting.shared_with_direction}`}
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: 12, border: '1px solid #bfdbfe', whiteSpace: 'nowrap' }}>
                                                            🔗 {meeting.shared_with_service || meeting.shared_with_direction}
                                                        </span>
                                                    )}
                                                    {meeting.summary && (
                                                        <span className="summary-badge" title="Résumé IA disponible">
                                                            <Sparkles size={12} />
                                                            Résumé
                                                        </span>
                                                    )}
                                                    {meeting.speaker_emails?.split(',').map(e => e.trim().toLowerCase()).includes(user?.email?.toLowerCase() || '') && (
                                                        <div className="presence-badge" title="Vous étiez présent">
                                                            <UserCheck size={14} />
                                                            <span>PRÉSENT</span>
                                                        </div>
                                                    )}
                                                </div>
                                                {(meeting.char_count ?? 0) > 0 && (
                                                    <div className="char-count-label">
                                                        {formatCharCount(meeting.char_count!)}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="text-center">
                                                <div className="speaker-count">
                                                    <Clock size={14} />
                                                    {formatTime(meeting.duration_seconds)}
                                                </div>
                                            </td>
                                            <td className="text-center">
                                                <div className="speaker-count">
                                                    <Users size={14} />
                                                    {meeting.speaker_count || 0}
                                                </div>
                                            </td>
                                            <td className="text-right">
                                                <div className="action-btns" onClick={e => e.stopPropagation()}>
                                                    {meeting.reunion_id && (
                                                        <button
                                                            className="btn-view-reunion"
                                                            onClick={() => setSelectedReunionId(meeting.reunion_id!)}
                                                            title="Voir la réunion associée"
                                                        >
                                                            <Calendar size={14} />
                                                            <span>Réunion</span>
                                                        </button>
                                                    )}
                                                    <button className="btn-icon" onClick={() => handleDeleteMeeting(meeting.id)}>
                                                        <Trash2 size={18} />
                                                    </button>
                                                    <button className="btn-icon btn-arrow">
                                                        <ArrowRight size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={5} className="no-data">
                                                {loading ? "Chargement..." : "Aucune réunion trouvée."}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            {isSearchModalOpen && (
                <div className="gs-overlay" onClick={() => setIsSearchModalOpen(false)}>
                    <div className="gs-modal" onClick={e => e.stopPropagation()}>
                        <div className="gs-header">
                            <Search size={20} />
                            <h3>Recherche dans tous les transcripts</h3>
                            <button className="gs-close" onClick={() => setIsSearchModalOpen(false)}>✕</button>
                        </div>
                        <div className="gs-search-row">
                            <input
                                autoFocus
                                type="text"
                                className="gs-input"
                                placeholder="Rechercher un mot, une phrase..."
                                value={globalQuery}
                                onChange={e => handleGlobalSearch(e.target.value)}
                            />
                            {isSearching && <RefreshCw className="animate-spin" size={18} style={{ color: '#2563EB', flexShrink: 0 }} />}
                        </div>
                        <div className="gs-body">
                            {searchError && (
                                <p className="gs-error">{searchError}</p>
                            )}
                            {!searchError && globalQuery.trim().length >= 2 && !isSearching && globalResults.length === 0 && (
                                <p className="gs-empty">Aucun résultat pour « {globalQuery} »</p>
                            )}
                            {globalResults.map(r => (
                                <div key={r.meeting_id} className="gs-group">
                                    <div className="gs-group-header" onClick={() => { navigate(`/transcriptmanager/meeting/${r.meeting_id}`); setIsSearchModalOpen(false); }}>
                                        <FileText size={14} />
                                        <span className="gs-meeting-title">{r.meeting_title}</span>
                                        <span className="gs-match-count">{r.matches.length} occurrence{r.matches.length > 1 ? 's' : ''}</span>
                                        <ArrowRight size={14} className="gs-arrow" />
                                    </div>
                                    <div className="gs-matches">
                                        {r.matches.slice(0, 3).map((m, i) => (
                                            <div key={i} className="gs-match" onClick={() => { navigate(`/transcriptmanager/meeting/${r.meeting_id}`); setIsSearchModalOpen(false); }}>
                                                <span className="gs-ts">{formatTimeFull(m.start_seconds)}</span>
                                                <span className="gs-speaker">{m.speaker_name}</span>
                                                <span className="gs-excerpt" dangerouslySetInnerHTML={{ __html: highlightExcerpt(m.text, globalQuery) }} />
                                            </div>
                                        ))}
                                        {r.matches.length > 3 && (
                                            <div className="gs-more">+{r.matches.length - 3} autre{r.matches.length - 3 > 1 ? 's' : ''}</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

             <ReunionDetailModal
                isOpen={selectedReunionId !== null}
                reunionId={selectedReunionId}
                token={token}
                onClose={() => setSelectedReunionId(null)}
                userRole={user?.role}
                currentUsername={user?.username}
            />

            <style>{`
                .tm-page {
                    background-color: #F8FAFC;
                    min-height: 100vh;
                    font-family: 'Inter', sans-serif;
                }
                .tm-container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 2rem;
                }
                .tm-top-bar {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    margin-bottom: 2.5rem;
                }
                .tm-title-section h1 {
                    font-size: 2.25rem;
                    font-weight: 800;
                    color: #111827;
                    margin: 0 0 0.5rem 0;
                    letter-spacing: -0.025em;
                }
                .tm-title-section p {
                    color: #64748B;
                    font-size: 1rem;
                    margin: 0;
                }
                .tm-actions {
                    display: flex;
                    gap: 1rem;
                    align-items: center;
                }
                .tm-search-box {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    background: white;
                    border: 1px solid #E2E8F0;
                    padding: 0.6rem 1rem;
                    border-radius: 12px;
                    width: 300px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }
                .tm-search-box input {
                    border: none;
                    outline: none;
                    font-size: 0.9rem;
                    width: 100%;
                    color: #1E293B;
                }
                .tm-btn-primary {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    background: #DC2626;
                    color: white;
                    padding: 0.75rem 1.25rem;
                    border-radius: 12px;
                    font-weight: 700;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 4px 6px -1px rgba(220, 38, 38, 0.2);
                }
                .tm-btn-primary:hover {
                    background: #B91C1C;
                    transform: translateY(-1px);
                }

                .tm-upload-progress {
                    background: white;
                    padding: 1.5rem;
                    border-radius: 16px;
                    margin-bottom: 2rem;
                    border: 1px solid #E2E8F0;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                }
                .progress-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1rem;
                }
                .status-badge {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    background: #EFF6FF;
                    color: #2563EB;
                    padding: 0.4rem 0.8rem;
                    border-radius: 20px;
                    font-size: 0.8rem;
                    font-weight: 600;
                }
                .progress-header .pct {
                    font-weight: 800;
                    color: #1E293B;
                }
                .progress-bar-container {
                    height: 8px;
                    background: #F1F5F9;
                    border-radius: 4px;
                    overflow: hidden;
                }
                .progress-bar {
                    height: 100%;
                    background: #2563EB;
                    transition: width 0.3s ease;
                }

                .tm-card {
                    background: white;
                    border-radius: 16px;
                    border: 1px solid #E2E8F0;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    overflow: hidden;
                }
                .card-header {
                    padding: 1.25rem 1.5rem;
                    border-bottom: 1px solid #F1F5F9;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .card-header h2 {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: #1E293B;
                    margin: 0;
                }

                .tm-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .tm-table th {
                    text-align: left;
                    padding: 1rem 1.5rem;
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #64748B;
                    background: #F8FAFC;
                    font-weight: 700;
                }
                .tm-table td {
                    padding: 1.25rem 1.5rem;
                    border-bottom: 1px solid #F1F5F9;
                    vertical-align: middle;
                }
                .tm-row {
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .tm-row:hover td {
                    background: #EFF6FF;
                }
                .tm-row:hover .btn-arrow {
                    color: #2563EB;
                }

                .date-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    background: #F1F5F9;
                    color: #475569;
                    padding: 0.35rem 0.7rem;
                    border-radius: 8px;
                    font-size: 0.8rem;
                    font-weight: 600;
                }
                .meeting-title {
                    font-weight: 700;
                    color: #111827;
                    font-size: 0.95rem;
                }
                .presence-badge {
                    display: flex;
                    align-items: center;
                    gap: 0.3rem;
                    background: #DCFCE7;
                    color: #16A34A;
                    padding: 0.2rem 0.5rem;
                    border-radius: 6px;
                    font-size: 0.7rem;
                    font-weight: 800;
                }
                .speaker-count {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.4rem;
                    color: #64748B;
                    font-weight: 600;
                    font-size: 0.85rem;
                }

                .action-btns {
                    display: flex;
                    justify-content: flex-end;
                    gap: 0.75rem;
                }
                .btn-view-reunion {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    background: #F0F9FF;
                    color: #0369A1;
                    border: 1px solid #BAE6FD;
                    padding: 0.4rem 0.8rem;
                    border-radius: 8px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-view-reunion:hover {
                    background: #E0F2FE;
                    border-color: #7DD3FC;
                }
                .btn-icon {
                    background: none;
                    border: none;
                    color: #CBD5E1;
                    padding: 0.4rem;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-icon:hover {
                    background: #F1F5F9;
                    color: #64748B;
                }

                .summary-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.25rem;
                    background: #F5F3FF;
                    color: #7C3AED;
                    padding: 0.15rem 0.45rem;
                    border-radius: 6px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    white-space: nowrap;
                }
                .char-count-label {
                    margin-top: 0.25rem;
                    font-size: 0.75rem;
                    color: #94A3B8;
                    font-weight: 500;
                }
                .btn-arrow {
                    color: #CBD5E1;
                    transition: color 0.2s, transform 0.2s;
                }
                .tm-row:hover .btn-arrow {
                    transform: translateX(3px);
                }

                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .tm-btn-search {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    background: white;
                    border: 1px solid #E2E8F0;
                    padding: 0.75rem 1.1rem;
                    border-radius: 12px;
                    font-weight: 600;
                    font-size: 0.85rem;
                    color: #475569;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                    white-space: nowrap;
                }
                .tm-btn-search:hover { background: #F1F5F9; color: #1E293B; border-color: #CBD5E1; }

                .gs-overlay {
                    position: fixed; inset: 0;
                    background: rgba(15,23,42,0.6);
                    backdrop-filter: blur(4px);
                    z-index: 1000;
                    display: flex; align-items: flex-start; justify-content: center;
                    padding-top: 5vh;
                }
                .gs-modal {
                    background: white;
                    border-radius: 16px;
                    width: 90%; max-width: 760px;
                    max-height: 80vh;
                    display: flex; flex-direction: column;
                    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
                    animation: modalPop 0.2s ease;
                    overflow: hidden;
                }
                @keyframes modalPop { from { opacity:0; transform: scale(0.96) translateY(-8px); } to { opacity:1; transform: scale(1) translateY(0); } }
                .gs-header {
                    display: flex; align-items: center; gap: 0.75rem;
                    padding: 1.25rem 1.5rem;
                    border-bottom: 1px solid #F1F5F9;
                    color: #2563EB;
                }
                .gs-header h3 { margin: 0; font-size: 1rem; font-weight: 700; color: #1E293B; flex: 1; }
                .gs-close {
                    background: none; border: none; color: #94A3B8;
                    font-size: 1.1rem; cursor: pointer; padding: 0.25rem 0.5rem;
                    border-radius: 6px; transition: all 0.2s;
                }
                .gs-close:hover { background: #F1F5F9; color: #475569; }
                .gs-search-row {
                    display: flex; align-items: center; gap: 1rem;
                    padding: 1rem 1.5rem;
                    border-bottom: 1px solid #F1F5F9;
                }
                .gs-input {
                    flex: 1; border: 1px solid #E2E8F0; border-radius: 10px;
                    padding: 0.75rem 1rem; font-size: 1rem; outline: none;
                    transition: border-color 0.2s;
                }
                .gs-input:focus { border-color: #2563EB; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
                .gs-body { overflow-y: auto; padding: 0.75rem; flex: 1; }
                .gs-empty { text-align: center; color: #94A3B8; padding: 2rem; font-style: italic; }
                .gs-error { text-align: center; color: #DC2626; padding: 2rem; font-size: 0.9rem; background: #FEF2F2; border-radius: 8px; margin: 0.5rem; }
                .gs-group {
                    border: 1px solid #E2E8F0; border-radius: 12px;
                    margin-bottom: 0.75rem; overflow: hidden;
                }
                .gs-group-header {
                    display: flex; align-items: center; gap: 0.6rem;
                    padding: 0.75rem 1rem;
                    background: #F8FAFC; cursor: pointer;
                    transition: background 0.15s;
                    color: #1E293B;
                }
                .gs-group-header:hover { background: #EFF6FF; }
                .gs-meeting-title { font-weight: 700; font-size: 0.9rem; flex: 1; }
                .gs-match-count {
                    font-size: 0.75rem; font-weight: 700;
                    background: #DBEAFE; color: #1D4ED8;
                    padding: 0.15rem 0.5rem; border-radius: 20px;
                }
                .gs-arrow { color: #94A3B8; flex-shrink: 0; }
                .gs-matches { padding: 0.5rem 0; }
                .gs-match {
                    display: grid; grid-template-columns: 70px 130px 1fr;
                    gap: 0.75rem; align-items: baseline;
                    padding: 0.5rem 1rem; cursor: pointer;
                    transition: background 0.15s; font-size: 0.85rem;
                }
                .gs-match:hover { background: #FBFDFF; }
                .gs-ts { font-family: monospace; font-size: 0.75rem; color: #94A3B8; }
                .gs-speaker { font-weight: 700; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .gs-excerpt { color: #64748B; line-height: 1.4; }
                mark.gs-hl { background: #FEF08A; color: inherit; border-radius: 2px; padding: 0 1px; }
                .gs-more {
                    text-align: center; font-size: 0.75rem; color: #94A3B8;
                    padding: 0.25rem; font-style: italic;
                }

                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

                .no-data {
                    padding: 4rem;
                    text-align: center;
                    color: #94A3B8;
                    font-style: italic;
                }
            `}</style>
        </div>
    </div>
    );
};

function formatCharCount(n: number): string {
    if (n >= 1000) {
        return (n / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'k car.';
    }
    return n + ' car.';
}

function formatTimeFull(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function highlightExcerpt(text: string, query: string): string {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    let excerpt = text;
    if (text.length > 120) {
        const start = Math.max(0, idx - 40);
        excerpt = (start > 0 ? '…' : '') + text.substring(start, start + 120) + (start + 120 < text.length ? '…' : '');
    }
    return excerpt.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="gs-hl">$1</mark>');
}

export default TranscriptManager;
