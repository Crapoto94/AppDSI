import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Lock, UserPlus, LogOut } from 'lucide-react';

const AccessRequestOverlay: React.FC = () => {
    const { pendingApproval, logout } = useAuth();
    const [message, setMessage] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        if (pendingApproval) {
            axios.get('/api/messages/code/nologin')
                .then(res => setMessage(res.data.content))
                .catch(err => console.error(err));
        }
    }, [pendingApproval]);

    if (!pendingApproval) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(12px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', maxWidth: '520px', width: '100%', padding: '48px 40px', textAlign: 'center' }}>
                <div style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #fef3c7, #fef9c3)', color: '#d97706', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 32px', boxShadow: '0 8px 24px rgba(217, 119, 6, 0.15)' }}>
                    <Lock size={40} strokeWidth={1.8} />
                </div>
                
                <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', marginBottom: '12px', letterSpacing: '-0.02em' }}>Accès restreint</h2>
                <p style={{ color: '#94a3b8', fontSize: '1rem', fontWeight: 500, marginBottom: '32px', margin: '0 0 32px 0' }}>Votre compte n'est pas encore créé dans l'application.</p>
                
                <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '24px 32px', marginBottom: '32px', color: '#475569', lineHeight: 1.7, fontSize: '0.95rem', whiteSpace: 'pre-wrap', textAlign: 'left', border: '1px solid #f1f5f9' }}>
                    {message || 'Chargement du message...'}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <button 
                        type="button"
                        onClick={() => navigate(`/request-access?username=${pendingApproval.username}`)}
                        style={{ width: '100%', background: '#2563eb', color: 'white', padding: '16px', borderRadius: '16px', fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', cursor: 'pointer', border: 'none', boxShadow: '0 8px 24px rgba(37, 99, 235, 0.25)', transition: 'all 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
                        onMouseLeave={e => e.currentTarget.style.background = '#2563eb'}
                    >
                        <UserPlus size={22} /> Demander un accès
                    </button>
                    
                    <button 
                        type="button"
                        onClick={() => { logout(); navigate('/login'); }}
                        style={{ width: '100%', background: 'white', color: '#64748b', padding: '14px', borderRadius: '16px', fontWeight: 600, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', border: '1px solid #e2e8f0', transition: 'all 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                    >
                        <LogOut size={18} /> Se déconnecter
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AccessRequestOverlay;
