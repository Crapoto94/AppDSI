import React, { useEffect, useState } from 'react';
import { X, FileText, MessageSquare, ListTodo, ExternalLink } from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

interface TranscriptViewModalProps {
    isOpen: boolean;
    onClose: () => void;
    transcriptId: number | null;
    token: string | null;
}

const TranscriptViewModal: React.FC<TranscriptViewModalProps> = ({ isOpen, onClose, transcriptId, token }) => {
    const [meeting, setMeeting] = useState<any>(null);
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (isOpen && transcriptId && token) {
            fetchTranscript();
        }
    }, [isOpen, transcriptId, token]);

    const fetchTranscript = async () => {
        setLoading(true);
        try {
            const [mRes, tRes] = await Promise.all([
                axios.get(`/api/transcriptmanager/meeting/${transcriptId}`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`/api/transcriptmanager/tasks?meeting_id=${transcriptId}`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            setMeeting(mRes.data);
            setTasks(tRes.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2><FileText size={20} /> Transcript : {meeting?.title || "Chargement..."}</h2>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {transcriptId && (
                            <button 
                                onClick={() => navigate(`/transcriptmanager/meeting/${transcriptId}`)} 
                                className="full-view-btn"
                                title="Voir la transcription complète"
                            >
                                <ExternalLink size={18} />
                            </button>
                        )}
                        <button onClick={onClose} className="close-btn"><X size={20} /></button>
                    </div>
                </div>
                
                <div className="modal-body">
                    {loading ? (
                        <p className="loading">Chargement du résumé...</p>
                    ) : meeting ? (
                        <div className="transcript-preview">
                            <div className="preview-section">
                                <h3><MessageSquare size={16} /> Résumé Exécutif</h3>
                                <div 
                                    className="summary-text" 
                                    dangerouslySetInnerHTML={{ __html: formatMarkdown(meeting.summary || "Aucun résumé disponible.") }} 
                                />
                            </div>

                            {tasks.length > 0 && (
                                <div className="preview-section">
                                    <h3><ListTodo size={16} /> Plan d'Action</h3>
                                    <div className="tasks-mini-list">
                                        {tasks.map(t => (
                                            <div key={t.id} className="task-mini-item">
                                                <span className={`status-dot ${t.is_completed ? 'done' : ''}`}></span>
                                                <p>{t.description}</p>
                                                {t.assignee && <span className="assignee">@{t.assignee}</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="error">Impossible de charger le transcript.</p>
                    )}
                </div>
            </div>

            <style>{`
                .modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(15, 23, 42, 0.7);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 2000;
                }
                .modal-content {
                    background: white;
                    width: 100%;
                    max-width: 800px;
                    max-height: 85vh;
                    border-radius: 16px;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                }
                .modal-header {
                    padding: 16px 20px;
                    border-bottom: 1px solid #f1f5f9;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #F8FAFC;
                }
                .modal-header h2 {
                    margin: 0; font-size: 1.1rem; font-weight: 800; color: #1e293b;
                    display: flex; align-items: center; gap: 10px;
                }
                .full-view-btn {
                    background: #f1f5f9; border: none; color: #2563eb; padding: 6px; 
                    border-radius: 8px; cursor: pointer; transition: all 0.2s;
                }
                .full-view-btn:hover { background: #e2e8f0; }
                .close-btn {
                    background: none; border: none; color: #94a3b8; cursor: pointer;
                }
                .modal-body { 
                    padding: 24px; 
                    overflow-y: auto;
                }
                
                .transcript-preview { display: flex; flex-direction: column; gap: 24px; }
                .preview-section h3 {
                    display: flex; align-items: center; gap: 8px;
                    font-size: 0.95rem; font-weight: 700; color: #334155; margin: 0 0 12px 0;
                    padding-bottom: 8px; border-bottom: 2px solid #f1f5f9;
                }
                .summary-text { font-size: 0.95rem; color: #475569; line-height: 1.6; }
                .summary-text h2 { font-size: 1.05rem; color: #1e293b; margin: 1rem 0 0.5rem; }
                
                .tasks-mini-list { display: flex; flex-direction: column; gap: 10px; }
                .task-mini-item {
                    display: flex; align-items: center; gap: 12px;
                    background: #F8FAFC; padding: 10px 14px; border-radius: 10px;
                }
                .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #cbd5e1; }
                .status-dot.done { background: #10b981; }
                .task-mini-item p { margin: 0; font-size: 0.85rem; color: #334155; flex: 1; }
                .assignee { font-size: 0.75rem; color: #2563eb; font-weight: 600; }

                .loading { text-align: center; color: #64748b; padding: 40px; }
            `}</style>
        </div>
    );
};

function formatMarkdown(text: string) {
    if (!text) return "";
    return text
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>')
        .replace(/<\/ul>\s*<ul>/g, "")
        .replace(/\n/g, '<br/>');
}

export default TranscriptViewModal;
