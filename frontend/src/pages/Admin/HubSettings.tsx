import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Users, LayoutGrid, Sliders, ShieldCheck, HelpCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Admin from '../Admin';
import AdminSettings from '../AdminSettings';
import AdminAccessRequests from '../AdminAccessRequests';
import PageHelpAdmin from './PageHelpAdmin';

type TabKey = 'users' | 'tiles' | 'settings' | 'help' | 'access-requests';

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  superadminOnly?: boolean;
}

const TABS: TabDef[] = [
  { key: 'users', label: 'Utilisateurs', icon: Users },
  { key: 'tiles', label: 'Configuration Hub', icon: LayoutGrid },
  { key: 'settings', label: 'Paramètres', icon: Sliders },
  { key: 'help', label: 'Aide', icon: HelpCircle },
  { key: 'access-requests', label: "Demandes d'accès", icon: ShieldCheck, superadminOnly: true },
];

const HubSettings: React.FC = () => {
  const { token, user } = useAuth();
  const isSuperAdmin = user?.role === 'superadmin' || ['admin', 'adminhub'].includes(user?.username?.toLowerCase() || '');
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingCount, setPendingCount] = useState(0);

  const visibleTabs = TABS.filter(t => !t.superadminOnly || isSuperAdmin);

  // Onglet actif déduit de l'URL (?tab=...), défaut : premier onglet visible.
  const requested = (searchParams.get('tab') || '') as TabKey;
  const activeTab: TabKey = visibleTabs.some(t => t.key === requested) ? requested : 'users';

  const setActiveTab = (key: TabKey) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', key);
      return next;
    }, { replace: true });
  };

  // Badge « demandes d'accès » (superadmin uniquement)
  useEffect(() => {
    if (!token || !isSuperAdmin) return;
    const fetchPending = async () => {
      try {
        const res = await axios.get('/api/admin/access-requests', { headers: { Authorization: `Bearer ${token}` } });
        setPendingCount(Array.isArray(res.data) ? res.data.length : 0);
      } catch { /* silencieux */ }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, [token, isSuperAdmin]);

  return (
    <div className="hub-settings">
      <div className="hub-settings-head">
        <h1 className="hub-settings-title">Paramétrage Hub</h1>
        <p className="hub-settings-subtitle">Utilisateurs, configuration des tuiles, paramètres généraux et demandes d'accès</p>
      </div>

      <div className="hub-tabs" role="tablist">
        {visibleTabs.map(tab => {
          const Icon = tab.icon;
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={active}
              className={`hub-tab ${active ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon size={17} />
              <span>{tab.label}</span>
              {tab.key === 'access-requests' && pendingCount > 0 && (
                <span className="hub-tab-badge">{pendingCount}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="hub-tab-panel">
        {activeTab === 'users' && <Admin section="users" />}
        {activeTab === 'tiles' && <Admin section="tiles" />}
        {activeTab === 'settings' && <AdminSettings />}
        {activeTab === 'help' && <PageHelpAdmin />}
        {activeTab === 'access-requests' && isSuperAdmin && <AdminAccessRequests />}
      </div>

      <style>{`
        .hub-settings { display: flex; flex-direction: column; }
        .hub-settings-head { margin-bottom: 20px; }
        .hub-settings-title { font-size: 1.6rem; font-weight: 800; color: #0f172a; margin: 0 0 4px 0; }
        .hub-settings-subtitle { font-size: 0.9rem; color: #94a3b8; margin: 0; font-weight: 500; }

        .hub-tabs {
          display: flex; gap: 6px; flex-wrap: wrap;
          background: #fff; padding: 8px; border-radius: 16px;
          border: 1px solid #e9eef5; box-shadow: 0 1px 3px rgba(15,23,42,0.04);
          margin-bottom: 24px;
        }
        .hub-tab {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 11px 18px; border: none; border-radius: 11px;
          background: transparent; color: #64748b; font-weight: 700; font-size: 0.9rem;
          cursor: pointer; transition: all .18s ease; white-space: nowrap;
        }
        .hub-tab:hover { background: #f1f5f9; color: #334155; }
        .hub-tab.active {
          background: linear-gradient(135deg, #2563eb, #4f46e5); color: #fff;
          box-shadow: 0 8px 18px -8px rgba(37,99,235,0.55);
        }
        .hub-tab-badge {
          background: #ef4444; color: #fff; font-size: 11px; font-weight: 800;
          min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .hub-tab.active .hub-tab-badge { background: rgba(255,255,255,0.25); }

        .hub-tab-panel { animation: hubFade .25s ease; }
        @keyframes hubFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default HubSettings;
