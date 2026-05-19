import { useState, useEffect, useCallback, useRef } from 'react';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Plus, X, Trash2, Users, Check, RefreshCw, Link2, Unlink, Database } from 'lucide-react';

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const JOURS_COURT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

const SERVICE_COLORS = [
  '#e17055', '#00b894', '#0984e3', '#6c5ce7', '#fdcb6e',
  '#00cec9', '#e84393', '#636e72', '#55a3e8', '#a29bfe',
  '#fd79a8', '#74b9ff', '#f8a5c2', '#81ecec', '#ffb347',
];

const SERVICE_COLOR_MAP: Record<string, string> = {
  'Bureau Des Projets': '#e17055',
  'Service Infrastructure Reseaux Systemes': '#27ae60',
  'Service Support Déploiement': '#3498db',
  'Direction des Systemes d\'Information': '#6c5ce7',
  'Tous': '#636e72'
};

function getServiceColor(service: string): string {
  if (!service) return '#666';
  if (SERVICE_COLOR_MAP[service]) {
    return SERVICE_COLOR_MAP[service];
  }
  let hash = 0;
  for (let i = 0; i < service.length; i++) {
    hash = service.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SERVICE_COLORS[Math.abs(hash) % SERVICE_COLORS.length];
}

function getInitials(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[1][0] + parts[0][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

interface AbsencePermanente {
  id: number;
  jour_semaine: number;
  periode: string;
}

interface AgentDSI {
  username: string;
  nom: string;
  email: string;
  service: string;
  matricule?: string;
  tt_fixed_days: number[];
  created_by: string;
  created_at: string;
  absences: AbsencePermanente[];
}

interface ADUser {
  username: string;
  displayName: string;
  email: string;
  service?: string;
  direction?: string;
}

interface MatriculeResult {
  matricule: string;
  nom: string;
  prenom: string;
  full_name: string;
  nb_absences: number;
  date_debut_min: string | null;
  date_fin_max: string | null;
}

interface DemabsSyncInfo {
  stats: { total: number; agents_count: number; date_min: string | null; date_max: string | null };
  lastSync: string | null;
  linkedAgents: { username: string; nom: string; matricule: string; demabs_count: number }[];
}

export default function AgentsDSI() {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [agents, setAgents] = useState<AgentDSI[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add agent modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [adQuery, setAdQuery] = useState('');
  const [adResults, setAdResults] = useState<ADUser[]>([]);
  const [searchingAD, setSearchingAD] = useState(false);
  const [selectedADUser, setSelectedADUser] = useState<ADUser | null>(null);
  const adTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchAD = useCallback((q: string) => {
    setAdQuery(q);
    if (adTimerRef.current !== null) clearTimeout(adTimerRef.current);
    if (q.length < 2) { setAdResults([]); return; }
    setSearchingAD(true);
    adTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ad/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setAdResults(Array.isArray(data) ? data : []);
      } catch { setAdResults([]); }
      setSearchingAD(false);
    }, 400);
  }, [token]);


  // Absence modal per agent
  const [absenceAgent, setAbsenceAgent] = useState<string | null>(null);
  const [absJour, setAbsJour] = useState(1);
  const [absPeriode, setAbsPeriode] = useState('journee');

  // Matricule modal
  const [showMatriculeModal, setShowMatriculeModal] = useState(false);
  const [matriculeAgent, setMatriculeAgent] = useState<string | null>(null);
  const [matriculeQuery, setMatriculeQuery] = useState('');
  const [matriculeResults, setMatriculeResults] = useState<MatriculeResult[]>([]);
  const [searchingMatricule, setSearchingMatricule] = useState(false);
  const [selectedMatricule, setSelectedMatricule] = useState<MatriculeResult | null>(null);
  const [manualMatricule, setManualMatricule] = useState('');
  const [useManualMatricule, setUseManualMatricule] = useState(false);
  const [linking, setLinking] = useState(false);
  const matriculeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Demabs sync
  const [syncingDemabs, setSyncingDemabs] = useState(false);
  const [demabsInfo, setDemabsInfo] = useState<DemabsSyncInfo | null>(null);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/calendrier-dsi/agents', { headers });
      if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
      const data = await res.json();
      setAgents(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchAgents();
  }, [token, fetchAgents]);

  const fetchDemabsInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/calendrier-dsi/demabs-sync-info', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setDemabsInfo(data);
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    if (token) fetchDemabsInfo();
  }, [token, fetchDemabsInfo]);


  const addAgent = async () => {
    if (!selectedADUser) return;
    setError(null);
    try {
      const res = await fetch('/api/calendrier-dsi/agents', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          username: selectedADUser.username,
          nom: selectedADUser.displayName,
          email: selectedADUser.email,
          service: selectedADUser.service || ''
        })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `Erreur HTTP ${res.status}`);
      }
      setShowAddModal(false);
      setAdQuery('');
      setSelectedADUser(null);
      setAdResults([]);
      await fetchAgents();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleTTDay = async (username: string, day: number, currentDays: number[]) => {
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day].sort();
    try {
      const res = await fetch(`/api/calendrier-dsi/agents/${encodeURIComponent(username)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ tt_fixed_days: newDays })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `Erreur HTTP ${res.status}`);
      }
      setAgents(prev => prev.map(a => a.username === username ? { ...a, tt_fixed_days: newDays } : a));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const deleteAgent = async (username: string) => {
    if (!confirm(`Supprimer ${agents.find(a => a.username === username)?.nom} ?`)) return;
    try {
      const res = await fetch(`/api/calendrier-dsi/agents/${encodeURIComponent(username)}`, {
        method: 'DELETE',
        headers
      });
      if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
      setAgents(prev => prev.filter(a => a.username !== username));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const addAbsence = async () => {
    if (!absenceAgent) return;
    try {
      const res = await fetch(`/api/calendrier-dsi/agents/${encodeURIComponent(absenceAgent)}/absences`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jour_semaine: absJour, periode: absPeriode })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `Erreur HTTP ${res.status}`);
      }
      setAbsenceAgent(null);
      await fetchAgents();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const deleteAbsence = async (id: number) => {
    try {
      const res = await fetch(`/api/calendrier-dsi/agents/absences/${id}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
      setAgents(prev => prev.map(a => ({ ...a, absences: a.absences.filter(ap => ap.id !== id) })));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const syncServices = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/calendrier-dsi/agents/sync-services', { method: 'POST', headers });
      if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
      const result = await res.json();
      setError(`${result.updated}/${result.total} services mis à jour${result.errors.length ? ` (${result.errors.length} erreurs)` : ''}`);
      await fetchAgents();
    } catch (e: any) {
      setError(e.message || 'Erreur synchro services');
    } finally {
      setSyncing(false);
    }
  };

  // Matricule search
  const searchMatricule = useCallback((q: string) => {
    setMatriculeQuery(q);
    if (matriculeTimerRef.current !== null) clearTimeout(matriculeTimerRef.current);
    if (q.length < 2) { setMatriculeResults([]); return; }
    setSearchingMatricule(true);
    matriculeTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/calendrier-dsi/agents/search-matricule?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setMatriculeResults(Array.isArray(data) ? data : []);
        } else {
          setMatriculeResults([]);
        }
      } catch {
        setMatriculeResults([]);
      }
      setSearchingMatricule(false);
    }, 300);
  }, [token]);

  const linkMatricule = async () => {
    if (!matriculeAgent) return;
    const matriculeValue = useManualMatricule ? manualMatricule.trim() : (selectedMatricule?.matricule || '');
    if (!matriculeValue) return;
    setLinking(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendrier-dsi/agents/${encodeURIComponent(matriculeAgent)}/matricule`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ matricule: matriculeValue })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `Erreur HTTP ${res.status}`);
      }
      setShowMatriculeModal(false);
      setSelectedMatricule(null);
      setMatriculeQuery('');
      setMatriculeResults([]);
      setManualMatricule('');
      setUseManualMatricule(false);
      await fetchAgents();
      await fetchDemabsInfo();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLinking(false);
    }
  };

  const unlinkMatricule = async (username: string) => {
    try {
      const res = await fetch(`/api/calendrier-dsi/agents/${encodeURIComponent(username)}/matricule`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ matricule: '' })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `Erreur HTTP ${res.status}`);
      }
      await fetchAgents();
      await fetchDemabsInfo();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const syncDemabs = async () => {
    setSyncingDemabs(true);
    setError(null);
    try {
      const res = await fetch('/api/calendrier-dsi/sync-demabs', { method: 'POST', headers });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `Erreur HTTP ${res.status}`);
      }
      const result = await res.json();
      setError(result.message);
      await fetchDemabsInfo();
    } catch (e: any) {
      setError(e.message || 'Erreur sync demabs');
    } finally {
      setSyncingDemabs(false);
    }
  };

  const openMatriculeModal = (username: string) => {
    setMatriculeAgent(username);
    setMatriculeQuery('');
    setMatriculeResults([]);
    setSelectedMatricule(null);
    setManualMatricule('');
    setUseManualMatricule(false);
    setShowMatriculeModal(true);
  };

  const periodeLabel = (p: string) => {
    if (p === 'matin') return 'Matin';
    if (p === 'apres-midi') return 'Après-midi';
    return 'Journée';
  };

  return (
    <div>
      <Header />
      <style>{`
        .agents-container { padding: 24px 32px; max-width: 1200px; margin: 0 auto; }
        .agents-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
        .agents-header h1 { margin: 0; font-size: 1.4rem; color: #1a1a2e; display: flex; align-items: center; gap: 10px; font-weight: 700; }
        .btn-back { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 7px 14px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: #555; text-decoration: none; transition: all 0.15s; }
        .btn-back:hover { background: #f5f5f5; border-color: #ccc; }
        .btn-primary { background: #1a1a2e; color: #fff; border: none; border-radius: 8px; padding: 9px 18px; cursor: pointer; display: flex; align-items: center; gap: 7px; font-size: 0.85rem; font-weight: 600; transition: background 0.15s; }
        .btn-primary:hover { background: #2d2d4e; }
        .btn-primary:disabled { opacity: 0.5; cursor: default; }
        .btn-outline { background: #fff; color: #1a1a2e; border: 1.5px solid #1a1a2e; border-radius: 8px; padding: 7px 16px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 0.85rem; font-weight: 600; transition: all 0.15s; }
        .btn-outline:hover { background: #f0f0f8; }
        .btn-orange { background: #fff; color: #E30613; border: 1.5px solid #E30613; border-radius: 8px; padding: 7px 16px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 0.85rem; font-weight: 600; transition: all 0.15s; }
        .btn-orange:hover { background: #fff5f5; }

        .service-section { margin-bottom: 16px; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); border: 1px solid #e8e8e8; }
        .service-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; font-weight: 700; font-size: 0.85rem; letter-spacing: 0.02em; }
        .service-count { font-weight: 400; opacity: 0.7; font-size: 0.8rem; }

        .agent-card { display: flex; align-items: center; gap: 14px; padding: 10px 18px; border-bottom: 1px solid #f0f0f0; transition: background 0.1s; }
        .agent-card:last-child { border-bottom: none; }
        .agent-card:hover { background: #fafafe; }
        .agent-avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 0.75rem; font-weight: 700; flex-shrink: 0; }
        .agent-info { flex: 1; min-width: 0; }
        .agent-name { font-weight: 600; font-size: 0.9rem; color: #1a1a2e; }
        .agent-detail { font-size: 0.78rem; color: #888; display: flex; align-items: center; gap: 6px; margin-top: 1px; flex-wrap: wrap; }
        .agent-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

        .tt-days { display: flex; gap: 4px; }
        .tt-day-btn { width: 32px; height: 32px; border-radius: 50%; border: 1.5px solid #d0d0d0; background: #fff; font-size: 0.65rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #888; transition: all 0.12s; }
        .tt-day-btn:hover { border-color: #1a1a2e; color: #1a1a2e; }
        .tt-day-btn.on { background: #1a1a2e; color: #fff; border-color: #1a1a2e; }

        .badge { display: inline-flex; align-items: center; gap: 5px; background: #f0f4ff; border: 1px solid #c8d6e5; border-radius: 20px; padding: 3px 10px; font-size: 0.75rem; color: #2d3436; margin: 1px; }
        .badge .remove { cursor: pointer; color: #e17055; font-weight: 700; margin-left: 2px; font-size: 0.8rem; line-height: 1; }
        .badge .remove:hover { color: #d63031; }
        .badge-matricule { background: #fff3e0; border-color: #ffb74d; color: #e65100; font-weight: 600; }

        .btn-icon { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e0e0e0; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #888; transition: all 0.12s; }
        .btn-icon:hover { background: #f5f5f5; color: #e17055; border-color: #e17055; }
        .btn-icon-matricule { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #ffb74d; background: #fff8f0; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #e65100; transition: all 0.12s; }
        .btn-icon-matricule:hover { background: #fff3e0; border-color: #e65100; }

        .empty-state { text-align: center; padding: 60px 20px; color: #888; }
        .empty-state p { margin: 0 0 6px; }

        .sync-info { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 10px; padding: 14px 18px; margin-bottom: 18px; font-size: 0.82rem; color: #555; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .sync-info strong { color: #1a1a2e; }
        .sync-badge { background: #e8f5e9; color: #2e7d32; border-radius: 12px; padding: 2px 10px; font-size: 0.75rem; font-weight: 600; }
        .sync-badge.no-data { background: #fff3e0; color: #e65100; }

        /* Modal */
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(2px); }
        .modal-content { background: #fff; border-radius: 14px; padding: 28px; width: 460px; max-width: 90vw; max-height: 85vh; overflow-y: auto; box-shadow: 0 12px 40px rgba(0,0,0,0.15); }
        .modal-content h2 { margin: 0 0 18px; font-size: 1.15rem; color: #1a1a2e; font-weight: 700; }
        .modal-content label { display: block; font-size: 0.82rem; font-weight: 600; color: #555; margin-bottom: 5px; margin-top: 14px; }
        .modal-content input, .modal-content select { width: 100%; padding: 9px 12px; border: 1.5px solid #ddd; border-radius: 8px; font-size: 0.9rem; box-sizing: border-box; transition: border-color 0.12s; }
        .modal-content input:focus, .modal-content select:focus { border-color: #1a1a2e; outline: none; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
        .modal-actions button { padding: 9px 22px; border-radius: 8px; cursor: pointer; font-size: 0.88rem; border: none; font-weight: 600; transition: all 0.12s; }
        .modal-actions .btn-cancel { background: #f0f0f0; color: #555; }
        .modal-actions .btn-cancel:hover { background: #e0e0e0; }
        .modal-actions .btn-save { background: #1a1a2e; color: #fff; }
        .modal-actions .btn-save:hover { background: #2d2d4e; }
        .modal-actions .btn-save:disabled { opacity: 0.5; cursor: default; }

        .ad-search-wrapper { position: relative; }
        .ad-results { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #ddd; border-radius: 0 0 10px 10px; max-height: 220px; overflow-y: auto; z-index: 10; box-shadow: 0 8px 20px rgba(0,0,0,0.1); }
        .ad-result-item { padding: 10px 14px; cursor: pointer; font-size: 0.85rem; border-bottom: 1px solid #f3f3f3; transition: background 0.08s; }
        .ad-result-item:last-child { border-bottom: none; }
        .ad-result-item:hover { background: #f0f4ff; }
        .ad-result-item .ad-name { font-weight: 600; color: #1a1a2e; }
        .ad-result-item .ad-detail { font-size: 0.75rem; color: #999; margin-top: 1px; }
        .ad-selected { display: inline-flex; align-items: center; gap: 8px; background: #f0f4ff; border: 1.5px solid #1a1a2e; border-radius: 20px; padding: 5px 14px; font-size: 0.85rem; margin-top: 6px; font-weight: 600; color: #1a1a2e; }
        .ad-selected .remove { cursor: pointer; color: #e17055; font-weight: 700; margin-left: 2px; font-size: 1rem; }
        .ad-selected .remove:hover { color: #d63031; }

        .matricule-result-item { padding: 10px 14px; cursor: pointer; font-size: 0.85rem; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 6px; transition: all 0.12s; }
        .matricule-result-item:hover { background: #fff3e0; border-color: #ffb74d; }
        .matricule-result-item.selected { background: #fff3e0; border-color: #e65100; }
        .matricule-result-item .mr-name { font-weight: 600; color: #1a1a2e; }
        .matricule-result-item .mr-detail { font-size: 0.75rem; color: #999; margin-top: 2px; }

        .absences-inline { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
        .absence-form { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
        .absence-form select { padding: 4px 8px; border: 1.5px solid #ddd; border-radius: 6px; font-size: 0.8rem; }
        .absence-form button { padding: 4px 12px; }

        .error-bar { background: #fff5f5; border: 1px solid #ffcccc; border-radius: 10px; padding: 12px 18px; margin-bottom: 18px; color: #c0392b; font-size: 0.88rem; display: flex; align-items: center; justify-content: space-between; }
        .error-bar button { background: none; border: none; cursor: pointer; color: #c0392b; font-weight: 700; font-size: 1.1rem; }
        .success-bar { background: #e8f5e9; border: 1px solid #a5d6a7; border-radius: 10px; padding: 12px 18px; margin-bottom: 18px; color: #2e7d32; font-size: 0.88rem; }
      `}</style>

      <div className="agents-container">
        <div className="agents-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <a href="/calendrier-dsi" className="btn-back"><ArrowLeft size={16} /> Retour</a>
            <h1><Users size={20} /> Agents DSI {!loading && <span style={{ fontSize: '0.9rem', fontWeight: 400, color: '#999' }}>({agents.length})</span>}</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-orange" onClick={syncDemabs} disabled={syncingDemabs}>
              <Database size={14} /> {syncingDemabs ? 'Sync...' : 'Sync Absences RH'}
            </button>
            <button className="btn-outline" onClick={syncServices} disabled={syncing}>
              <RefreshCw size={14} /> {syncing ? 'Synchro...' : 'Sync AD'}
            </button>
            <button className="btn-primary" onClick={() => { setSelectedADUser(null); setAdQuery(''); setAdResults([]); setShowAddModal(true); }}>
              <Plus size={16} /> Ajouter
            </button>
          </div>
        </div>

        {/* Demabs sync info bar */}
        {demabsInfo && demabsInfo.stats.total > 0 && (
          <div className="sync-info">
            <span><strong>Absences RH :</strong> {demabsInfo.stats.total} enregistrements</span>
            <span><strong>Agents liés :</strong> {demabsInfo.linkedAgents.length}</span>
            <span><strong>Période :</strong> {demabsInfo.stats.date_min || '?'} → {demabsInfo.stats.date_max || '?'}</span>
            {demabsInfo.lastSync && <span className="sync-badge">Dernière sync : {new Date(demabsInfo.lastSync).toLocaleString('fr-FR')}</span>}
          </div>
        )}
        {demabsInfo && demabsInfo.stats.total === 0 && (
          <div className="sync-info">
            <span className="sync-badge no-data">Aucune donnée d'absence RH</span>
            <span>Cliquez sur « Sync Absences RH » pour importer les absences depuis Oracle</span>
          </div>
        )}

        {error && (
          <div className={error.includes('import') || error.includes('Sync') || error.includes('sync') || error.includes('mis à jour') ? 'success-bar' : 'error-bar'}>
            <span>{error}</span>
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {loading ? (
          <div className="empty-state">Chargement…</div>
        ) : agents.length === 0 ? (
          <div className="empty-state">
            <p style={{ fontSize: '1rem', marginBottom: 8 }}>Aucun agent DSI configuré</p>
            <p style={{ fontSize: '0.85rem', color: '#aaa' }}>Cliquez sur « Ajouter » pour commencer</p>
          </div>
        ) : (
          (() => {
            const grouped: Record<string, AgentDSI[]> = {};
            for (const a of agents) {
              const s = a.service || 'Sans service';
              if (!grouped[s]) grouped[s] = [];
              grouped[s].push(a);
            }
            const serviceKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
            return serviceKeys.map((svc, _idx) => {
              const svcColor = '#1a1a2e';
              return (
                <div key={svc} className="service-section">
                  <div className="service-header" style={{ background: svcColor, color: '#fff' }}>
                    <span>{svc}</span>
                    <span className="service-count">{grouped[svc].length} agent{grouped[svc].length > 1 ? 's' : ''}</span>
                  </div>
                  {grouped[svc].map(agent => {
                    const svcColor = agent.service ? getServiceColor(agent.service) : '#666';
                    return (
                      <div key={agent.username} className="agent-card">
                        <div className="agent-avatar" style={{ background: svcColor }}>
                          {getInitials(agent.nom)}
                        </div>
                        <div className="agent-info">
                          <div className="agent-name">{agent.nom}</div>
                          <div className="agent-detail">
                            <span>{agent.username}</span>
                            {agent.email && <><span>·</span><span>{agent.email}</span></>}
                            {agent.matricule && <><span>·</span><span className="badge badge-matricule">Matr: {agent.matricule}</span></>}
                          </div>
                        </div>
                        <div className="agent-actions">
                          <button
                            className="btn-icon-matricule"
                            onClick={() => agent.matricule ? unlinkMatricule(agent.username) : openMatriculeModal(agent.username)}
                            title={agent.matricule ? `Délier le matricule ${agent.matricule}` : 'Lier à un matricule RH'}
                          >
                            {agent.matricule ? <Unlink size={14} /> : <Link2 size={14} />}
                          </button>
                          <div className="tt-days" title="Jours de TT fixes">
                            {[1, 2, 3, 4, 5].map(day => (
                              <button
                                key={day}
                                className={`tt-day-btn${(agent.tt_fixed_days || []).includes(day) ? ' on' : ''}`}
                                onClick={() => toggleTTDay(agent.username, day, agent.tt_fixed_days || [])}
                                title={JOURS[day]}
                              >
                                {JOURS_COURT[day]}
                              </button>
                            ))}
                          </div>
                          <span style={{ width: 1, height: 28, background: '#e8e8e8', margin: '0 4px' }} />
                          <div className="absences-inline" title="Absences permanentes">
                            {agent.absences.map(ap => (
                              <span key={ap.id} className="badge">
                                {JOURS[ap.jour_semaine]} ({periodeLabel(ap.periode)})
                                <span className="remove" onClick={() => deleteAbsence(ap.id)}>✕</span>
                              </span>
                            ))}
                            {absenceAgent === agent.username ? (
                              <div className="absence-form">
                                <select value={absJour} onChange={e => setAbsJour(parseInt(e.target.value))}>
                                  {JOURS.slice(1).map((jour, i) => (
                                    <option key={i + 1} value={i + 1}>{jour}</option>
                                  ))}
                                </select>
                                <select value={absPeriode} onChange={e => setAbsPeriode(e.target.value)}>
                                  <option value="journee">Journée</option>
                                  <option value="matin">Matin</option>
                                  <option value="apres-midi">Après-midi</option>
                                </select>
                                <button className="btn-icon" style={{ color: '#1a1a2e', borderColor: '#1a1a2e' }} onClick={addAbsence}><Check size={14} /></button>
                                <button className="btn-icon" onClick={() => setAbsenceAgent(null)}><X size={14} /></button>
                              </div>
                            ) : (
                              <button className="btn-icon" style={{ color: '#1a1a2e', borderColor: '#1a1a2e' }} onClick={() => { setAbsenceAgent(agent.username); setAbsJour(1); setAbsPeriode('journee'); }} title="Ajouter une absence permanente">
                                <Plus size={14} />
                              </button>
                            )}
                          </div>
                          <span style={{ width: 1, height: 28, background: '#e8e8e8', margin: '0 4px' }} />
                          <button className="btn-icon" onClick={() => deleteAgent(agent.username)} title="Supprimer l'agent"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            });
          })()
        )}
      </div>

      {/* Add Agent Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Ajouter un agent DSI</h2>
            <label>Recherche dans l'annuaire AD</label>
            <div className="ad-search-wrapper">
              <input
                placeholder="Tapez au moins 2 caractères…"
                value={adQuery}
                onChange={e => { searchAD(e.target.value); setError(null); }}
              />
              {searchingAD && <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 4 }}>Recherche…</div>}
              {adResults.length > 0 && (
                <div className="ad-results">
                  {adResults.map(u => (
                    <div key={u.username} className="ad-result-item" onClick={() => setSelectedADUser(u)}>
                      <div className="ad-name">{u.displayName}</div>
                      <div className="ad-detail">{u.email || u.username}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {selectedADUser && (
              <div className="ad-selected">
                <span>{selectedADUser.displayName}</span>
                <span className="remove" onClick={() => setSelectedADUser(null)}>✕</span>
              </div>
            )}
            {error && !error.includes('import') && <p style={{ color: '#E30613', fontSize: '0.85rem', marginTop: 8 }}>{error}</p>}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowAddModal(false)}>Annuler</button>
              <button className="btn-save" onClick={addAgent} disabled={!selectedADUser}>Ajouter</button>
            </div>
          </div>
        </div>
      )}

      {/* Matricule Link Modal */}
      {showMatriculeModal && (
        <div className="modal-overlay" onClick={() => setShowMatriculeModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>🔗 Lier le matricule RH</h2>
            <p style={{ fontSize: '0.82rem', color: '#888', margin: '0 0 14px' }}>
              Recherchez l'agent dans la table Oracle RH pour lier son matricule. Les absences seront ensuite affichées dans le calendrier.
            </p>

            {/* Mode switcher */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
                  border: useManualMatricule ? '1.5px solid #d0d0d0' : '1.5px solid #1a1a2e',
                  background: useManualMatricule ? '#fff' : '#1a1a2e', color: useManualMatricule ? '#555' : '#fff',
                  cursor: 'pointer'
                }}
                onClick={() => { setUseManualMatricule(false); setSelectedMatricule(null); }}
              >
                🔍 Rechercher
              </button>
              <button
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
                  border: useManualMatricule ? '1.5px solid #1a1a2e' : '1.5px solid #d0d0d0',
                  background: useManualMatricule ? '#1a1a2e' : '#fff', color: useManualMatricule ? '#fff' : '#555',
                  cursor: 'pointer'
                }}
                onClick={() => { setUseManualMatricule(true); setSelectedMatricule(null); setMatriculeResults([]); }}
              >
                ✏️ Saisie manuelle
              </button>
            </div>

            {!useManualMatricule ? (
              <>
                <label>Rechercher dans les absences RH synchronisées</label>
                <div className="ad-search-wrapper">
                  <input
                    placeholder="Nom, prénom ou matricule…"
                    value={matriculeQuery}
                    onChange={e => searchMatricule(e.target.value)}
                    autoFocus
                  />
                  {searchingMatricule && <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 4 }}>Recherche…</div>}
                </div>
                {matriculeResults.length > 0 && (
                  <div style={{ marginTop: 10, maxHeight: 240, overflowY: 'auto' }}>
                    {matriculeResults.map(m => (
                      <div
                        key={m.matricule}
                        className={`matricule-result-item${selectedMatricule?.matricule === m.matricule ? ' selected' : ''}`}
                        onClick={() => setSelectedMatricule(m)}
                      >
                        <div className="mr-name">{m.full_name || m.matricule}</div>
                        <div className="mr-detail">
                          <span>Matricule : <strong>{m.matricule}</strong></span>
                          {m.nb_absences > 0 && <><span> · </span><span>{m.nb_absences} absence{m.nb_absences > 1 ? 's' : ''}</span></>}
                          {m.date_debut_min && <><span> · </span><span>{m.date_debut_min}{m.date_fin_max ? ` → ${m.date_fin_max}` : ''}</span></>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {matriculeQuery.length >= 2 && !searchingMatricule && matriculeResults.length === 0 && (
                  <div style={{ marginTop: 10, padding: '12px 16px', background: '#fff5f5', borderRadius: 8, border: '1px solid #ffcccc', fontSize: '0.82rem', color: '#c0392b' }}>
                    Aucun résultat. Vérifiez l'orthographe ou essayez avec le matricule directement, ou utilisez la saisie manuelle.
                  </div>
                )}
                {selectedMatricule && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff3e0', borderRadius: 8, border: '1.5px solid #ffb74d' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selectedMatricule.full_name || selectedMatricule.matricule}</div>
                    <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 2 }}>Matricule : <strong style={{ color: '#e65100' }}>{selectedMatricule.matricule}</strong>
                      {selectedMatricule.nb_absences > 0 && <> · {selectedMatricule.nb_absences} absence{selectedMatricule.nb_absences > 1 ? 's' : ''} RH</>}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <label>Saisir le matricule RH</label>
                <input
                  placeholder="Ex : 901234"
                  value={manualMatricule}
                  onChange={e => setManualMatricule(e.target.value)}
                  autoFocus
                  style={{ marginTop: 4 }}
                />
                <p style={{ fontSize: '0.78rem', color: '#999', marginTop: 6 }}>
                  Trouvez le matricule dans votre espace RH ou demandez-le à l'agent.
                </p>
              </>
            )}

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowMatriculeModal(false)}>Annuler</button>
              <button className="btn-save" onClick={linkMatricule} disabled={useManualMatricule ? !manualMatricule.trim() : !selectedMatricule || linking}>
                {linking ? 'Liaison…' : 'Lier le matricule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}