import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Users, ArrowLeft, Eye, Plus, Trash2, AlertTriangle } from 'lucide-react';
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
  projet_lie_id?: number;
  projet_lie_code?: string;
  projet_lie_titre?: string;
  transcript_id?: number | null;
}

const MesReunions: React.FC = () => {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [reunions, setReunions] = useState<Reunion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detailReunionId, setDetailReunionId] = useState<number | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const isSuperAdmin = user?.role === 'superadmin'
    || user?.username?.toLowerCase() === 'admin'
    || user?.username?.toLowerCase() === 'adminhub';

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

  const handleDeleteAllReunions = async () => {
    setDeletingAll(true);
    setActionMsg(null);
    try {
      const res = await fetch('/api/rencontres-reunions', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setActionMsg({ ok: true, text: `${data.deleted ?? 0} réunion(s) supprimée(s).` });
        setReunions([]);
        fetchReunions();
      } else {
        setActionMsg({ ok: false, text: data.error || 'Erreur lors de la suppression.' });
      }
    } catch (e) {
      setActionMsg({ ok: false, text: 'Erreur réseau lors de la suppression.' });
    } finally {
      setDeletingAll(false);
      setConfirmDeleteAll(false);
    }
  };

  return (
    <div style={{minHeight: '100vh', background: '#f8fafc'}}>
      <Header />
      <div className="container" style={{padding: '24px', maxWidth: '1000px', margin: '0 auto'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px'}}>
          <button onClick={() => navigate('/')} style={{background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b'}}>
            <ArrowLeft size={20} />
          </button>
          <h1 style={{margin: 0, fontSize: '22px', fontWeight: '800', color: '#1e293b', flex: 1}}>📅 {isSuperAdmin ? 'Réunions' : 'Mes Réunions'}</h1>
          {isSuperAdmin && reunions.length > 0 && (
            <button onClick={() => setConfirmDeleteAll(true)} style={{padding: '10px 18px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px'}}>
              <Trash2 size={18} /> Supprimer toutes les réunions
            </button>
          )}
          <button onClick={() => setShowCreateModal(true)} style={{padding: '10px 18px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px'}}>
            <Plus size={18} /> Ajouter une réunion
          </button>
        </div>

        {actionMsg && (
          <div style={{marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, background: actionMsg.ok ? '#dcfce7' : '#fee2e2', color: actionMsg.ok ? '#16a34a' : '#dc2626', border: `1px solid ${actionMsg.ok ? '#bbf7d0' : '#fecaca'}`}}>
            {actionMsg.text}
          </div>
        )}

        {loading ? (
          <p style={{color: '#94a3b8', textAlign: 'center', padding: '40px'}}>Chargement...</p>
        ) : reunions.length === 0 ? (
          <div style={{textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0'}}>
            <Users size={48} color="#cbd5e1" style={{marginBottom: '16px'}} />
            <p style={{color: '#94a3b8', fontSize: '16px'}}>{isSuperAdmin ? 'Aucune réunion enregistrée.' : "Vous n'êtes inscrit à aucune réunion."}</p>
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
                      {reunion.projet_lie_code && (
                        <div style={{fontSize: '11px', color: '#2563eb', fontWeight: '600', marginBottom: '2px'}}>
                          📁 {reunion.projet_lie_code} — {reunion.projet_lie_titre}
                        </div>
                      )}
                      <div style={{display: 'flex', gap: '12px', fontSize: '12px', color: '#64748b'}}>
                        <span>{reunion.date_reunion ? new Date(reunion.date_reunion).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'}) : 'Date inconnue'}</span>
                        {reunion.lieu && <span>📍 {reunion.lieu}</span>}
                        <span>👥 {reunion.participant_count} participant{reunion.participant_count > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
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
        onTranscriptSuccess={() => fetchReunions()}
      />

      {confirmDeleteAll && (
        <div style={{position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)'}}>
          <div style={{background: 'white', borderRadius: '16px', maxWidth: '440px', width: '100%', padding: '28px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px'}}>
              <div style={{width: '44px', height: '44px', borderRadius: '12px', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
                <AlertTriangle size={24} />
              </div>
              <h2 style={{margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b'}}>Supprimer toutes les réunions</h2>
            </div>
            <p style={{margin: '0 0 24px', color: '#475569', fontSize: '14px', lineHeight: 1.6}}>
              Êtes-vous sûr de vouloir supprimer <strong>toutes les réunions</strong> ? Les participants, pièces jointes,
              associations aux projets et tâches dépendantes seront également supprimés. Cette action est irréversible.
            </p>
            <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px'}}>
              <button onClick={() => setConfirmDeleteAll(false)} disabled={deletingAll} style={{padding: '10px 18px', background: 'white', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '14px'}}>
                Annuler
              </button>
              <button onClick={handleDeleteAllReunions} disabled={deletingAll} style={{padding: '10px 18px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', cursor: deletingAll ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px', opacity: deletingAll ? 0.7 : 1}}>
                {deletingAll ? 'Suppression…' : 'Tout supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MesReunions;
