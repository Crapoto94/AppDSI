import React, { useEffect, useState } from 'react';
import Header from '../../components/Header';
import { 
    Calendar, FileText, Plus, Search, Trash2, 
    ArrowRight, Users, RefreshCw, UserCheck
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
}

const TranscriptManager: React.FC = () => {
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
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
                                placeholder="Rechercher une réunion..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <input 
                            type="file" 
                            id="tm-upload" 
                            accept=".vtt,.txt" 
                            style={{ display: 'none' }}
                            onChange={handleFileUpload}
                        />
                        <label htmlFor="tm-upload" className="tm-btn-primary">
                            <Plus size={20} />
                            Importer un transcript
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
                                        <th className="text-center">Intervenants</th>
                                        <th className="text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMeetings.length > 0 ? filteredMeetings.map(meeting => (
                                        <tr key={meeting.id} onClick={() => navigate(`/transcriptmanager/meeting/${meeting.id}`)}>
                                            <td className="date-cell">
                                                <div className="date-badge">
                                                    <Calendar size={14} />
                                                    {new Date(meeting.meeting_date || meeting.created_at).toLocaleDateString('fr-FR')}
                                                </div>
                                            </td>
                                            <td className="title-cell">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <span className="meeting-title">{meeting.title}</span>
                                                    {meeting.speaker_emails?.split(',').map(e => e.trim().toLowerCase()).includes(user?.email?.toLowerCase() || '') && (
                                                        <div className="presence-badge" title="Vous étiez présent">
                                                            <UserCheck size={14} />
                                                            <span>PRÉSENT</span>
                                                        </div>
                                                    )}
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
                                                    <button className="btn-icon">
                                                        <ArrowRight size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={4} className="no-data">
                                                {loading ? "Chargement..." : "Aucune réunion trouvée."}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
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
                }
                .tm-table tr:hover td {
                    background: #FBFDFF;
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

                .text-center { text-align: center; }
                .text-right { text-align: right; }
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

export default TranscriptManager;
