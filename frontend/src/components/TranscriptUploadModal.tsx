import React, { useState } from 'react';
import { X, Upload, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import axios from 'axios';

interface TranscriptUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (meetingId: number) => void;
    reunionId?: number;
    token: string | null;
}

const TranscriptUploadModal: React.FC<TranscriptUploadModalProps> = ({ isOpen, onClose, onSuccess, reunionId, token }) => {
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState("");
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleUpload = async () => {
        if (!file || !token) return;

        setIsUploading(true);
        setProgress(0);
        setStatus("Envoi du fichier...");
        setError(null);

        const formData = new FormData();
        formData.append('file', file);
        if (reunionId) {
            formData.append('reunion_id', reunionId.toString());
        }

        try {
            const res = await axios.post('/api/transcriptmanager/upload', formData, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            const jobId = res.data.jobId;
            pollStatus(jobId);
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
            setIsUploading(false);
        }
    };

    const pollStatus = async (jobId: string) => {
        try {
            const res = await axios.get(`/api/transcriptmanager/upload-status/${jobId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const { progress, status, meetingId } = res.data;
            setProgress(progress);
            setStatus(status);

            if (status === 'completed') {
                setIsUploading(false);
                onSuccess(meetingId);
            } else if (status === 'error') {
                setError(res.data.message || "Une erreur est survenue");
                setIsUploading(false);
            } else {
                setTimeout(() => pollStatus(jobId), 1000);
            }
        } catch (err) {
            setError("Erreur lors du suivi de l'import");
            setIsUploading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2><Upload size={20} /> Ajouter un Transcript</h2>
                    <button onClick={onClose} className="close-btn"><X size={20} /></button>
                </div>
                
                <div className="modal-body">
                    {!isUploading ? (
                        <div className="upload-zone">
                            <input 
                                type="file" 
                                accept=".vtt,.txt" 
                                id="transcript-file" 
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />
                            <label htmlFor="transcript-file" className="file-label">
                                <Upload size={40} color="#94a3b8" />
                                <span>{file ? file.name : "Cliquez pour choisir un fichier (.vtt, .txt)"}</span>
                            </label>

                            {error && (
                                <div className="error-msg">
                                    <AlertCircle size={16} /> {error}
                                </div>
                            )}

                            <button 
                                className="upload-btn" 
                                disabled={!file} 
                                onClick={handleUpload}
                            >
                                Commencer l'importation
                            </button>
                        </div>
                    ) : (
                        <div className="progress-zone">
                            <div className="spinner">
                                <RefreshCw className="animate-spin" size={32} color="#2563eb" />
                            </div>
                            <h3>{status}</h3>
                            <div className="progress-bar-container">
                                <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                            </div>
                            <span className="pct">{progress}%</span>
                        </div>
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
                    max-width: 500px;
                    border-radius: 16px;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                }
                .modal-header {
                    padding: 20px;
                    border-bottom: 1px solid #f1f5f9;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .modal-header h2 {
                    margin: 0; font-size: 1.25rem; font-weight: 800; color: #1e293b;
                    display: flex; align-items: center; gap: 10px;
                }
                .close-btn {
                    background: none; border: none; color: #94a3b8; cursor: pointer;
                }
                .modal-body { padding: 30px; }
                
                .upload-zone { display: flex; flex-direction: column; gap: 20px; }
                .file-label {
                    border: 2px dashed #e2e8f0;
                    border-radius: 12px;
                    padding: 40px 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 15px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .file-label:hover { border-color: #2563eb; background: #f8fafc; }
                .file-label span { font-size: 0.9rem; color: #64748b; text-align: center; }
                
                .upload-btn {
                    background: #2563eb; color: white; border: none; padding: 12px;
                    border-radius: 8px; font-weight: 700; cursor: pointer;
                }
                .upload-btn:disabled { background: #cbd5e1; cursor: not-allowed; }
                
                .error-msg {
                    background: #fef2f2; color: #dc2626; padding: 12px; border-radius: 8px;
                    font-size: 0.85rem; display: flex; align-items: center; gap: 8px;
                }

                .progress-zone {
                    display: flex; flex-direction: column; align-items: center; gap: 20px;
                }
                .progress-bar-container {
                    width: 100%; height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden;
                }
                .progress-bar {
                    height: 100%; background: #2563eb; transition: width 0.3s ease;
                }
                .pct { font-size: 0.8rem; font-weight: 700; color: #2563eb; }
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

export default TranscriptUploadModal;
