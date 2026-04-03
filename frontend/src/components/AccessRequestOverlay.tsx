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
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 text-center animate-in fade-in zoom-in duration-300">
                <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Lock size={40} />
                </div>
                
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Accès restreint</h2>
                
                <div className="bg-slate-50 rounded-2xl p-6 mb-8 text-gray-600 leading-relaxed whitespace-pre-wrap">
                    {message || 'Chargement du message...'}
                </div>

                <div className="flex flex-col gap-3">
                    <button 
                        onClick={() => navigate(`/request-access?username=${pendingApproval.username}`)}
                        className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95"
                    >
                        <UserPlus size={22} /> Demander un accès
                    </button>
                    
                    <button 
                        onClick={logout}
                        className="w-full bg-white text-gray-500 py-3 rounded-2xl font-medium flex items-center justify-center gap-2 hover:bg-gray-50 transition-all"
                    >
                        <LogOut size={18} /> Se déconnecter
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AccessRequestOverlay;
