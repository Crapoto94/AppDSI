import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Users, ArrowLeft, Eye, Plus } from 'lucide-react';
import Header from '../components/Header';
import CreateReunionModal from '../components/CreateReunionModal';
import ReunionDetailModal from '../components/ReunionDetailModal';
import { useAuth } from '../contexts/AuthContext';

interface Reunion {
  id: number;
  titre: string;
  date_reunion: string;
  annee: number;
  lieu?: string;
  description?: string;
  statut: string;
  participant_count: number;
  attachment_count: number;
}

const MesReunions: React.FC = () => {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [reunions, setReunions] = useState<Reunion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detailReunionId, setDetailReunionId] = useState<number | null>(null);

  const fetchReunions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/mes-reunions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) setReunions(data);
    } catch (e) {
      console.error('Erreur chargement réunions:', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchReunions(); }, [fetchReunions]);

  return (
    <div style={{minHeight: '100vh', background: '#f8fafc'}}>
      <Header />
      <div className="container" style={{padding: '24px', maxWidth: '1000px', margin: '0 auto'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px'}}>
          <button onClick={() => navigate('/')} style={{background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b'}}>
            <ArrowLeft size={20} />
          </button>
          <h1 style={{margin: 0, fontSize: '22px', fontWeight: '800', color: '#1e293b', flex: 1}}>📅 Mes Réunions</h1>
          <button onClick={() => setShowCreateModal(true)} style={{padding: '10px 18px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px'}}>
            <Plus size={18} /> Ajouter une réunion
          </button>
        </div>

        {loading ? (
          <p style={{color: '#94a3b8', textAlign: 'center', padding: '40px'}}>Chargement...</p>
        ) : reunions.length === 0 ? (
          <div style={{textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0'}}>
            <Users size={48} color="#cbd5e1" style={{marginBottom: '16px'}} />
            <p style={{color: '#94a3b8', fontSize: '16px'}}>Vous n'êtes inscrit à aucune réunion.</p>
          </div>
        ) : (
          <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
            {reunions.map(reunion => (
              <div key={reunion.id} style={{background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', cursor: 'pointer'}} onClick={() => setDetailReunionId(reunion.id)}>
                <div style={{padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: '14px', flex: 1}}>
                    <div style={{width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
                      <Calendar size={20} color="#2563eb" />
                    </div>
                    <div style={{flex: 1}}>
                      <h3 style={{margin: '0 0 4px', fontSize: '15px', fontWeight: '700', color: '#1e293b'}}>{reunion.titre}</h3>
                      <div style={{display: 'flex', gap: '12px', fontSize: '12px', color: '#64748b'}}>
                        <span>{reunion.date_reunion ? new Date(reunion.date_reunion).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'}) : 'Date inconnue'}</span>
                        {reunion.lieu && <span>📍 {reunion.lieu}</span>}
                        <span>👥 {reunion.participant_count} participant{reunion.participant_count > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                    <span style={{padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', background: reunion.statut === 'effectuée' ? '#dcfce7' : '#fef3c7', color: reunion.statut === 'effectuée' ? '#16a34a' : '#92400e'}}>{reunion.statut}</span>
                    <Eye size={16} color="#94a3b8" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateReunionModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={(created) => { setShowCreateModal(false); setDetailReunionId(created.id); }}
        token={token}
        source="mes_reunions"
      />

      <ReunionDetailModal
        isOpen={detailReunionId !== null}
        reunionId={detailReunionId}
        token={token}
        userRole={user?.role}
        currentUsername={user?.username}
        onClose={() => setDetailReunionId(null)}
        onUpdated={() => fetchReunions()}
        onDemandeCreated={() => fetchReunions()}
        onDeleted={() => { setDetailReunionId(null); fetchReunions(); }}
      />
    </div>
  );
};

export default MesReunions;
