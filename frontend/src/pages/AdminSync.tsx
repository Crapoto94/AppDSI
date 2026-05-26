import React, { useState } from 'react';
import { Monitor, Cloud } from 'lucide-react';
import Admin from './Admin';

type SyncTab = 'ad' | 'azure';

const TABS: { id: SyncTab; label: string; Icon: React.ElementType }[] = [
  { id: 'ad',    label: 'Active Directory', Icon: Monitor },
  { id: 'azure', label: 'Azure AD (Entra)', Icon: Cloud   },
];

const AdminSync: React.FC = () => {
  const [tab, setTab] = useState<SyncTab>('ad');

  return (
    <div className="asc-root">
      <div className="asc-header">
        <span className="asc-header-icon">
          <Monitor size={16} />
        </span>
        <div>
          <h1 className="asc-title">Synchronisations AD</h1>
          <p className="asc-desc">Liaison LDAP Active Directory et authentification Azure AD / Entra ID</p>
        </div>
      </div>

      <nav className="asc-tabs">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`asc-tab${tab === id ? ' asc-tab--on' : ''}`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </nav>

      <div className="asc-body">
        {tab === 'ad'    && <Admin section="ad" />}
        {tab === 'azure' && <Admin section="azure-ad" />}
      </div>

      <style>{`
        .asc-root { display:flex; flex-direction:column; min-height:0; }

        .asc-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 18px;
          border-bottom: 1px solid #e8edf3;
          margin-bottom: 0;
        }

        .asc-header-icon {
          width: 34px; height: 34px;
          border-radius: 7px;
          background: #eef2ff;
          color: #4338ca;
          border: 1px solid #c7d2fe;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        .asc-title {
          font-size: 0.9375rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 2px 0;
          line-height: 1.3;
        }

        .asc-desc {
          font-size: 0.78rem;
          color: #94a3b8;
          margin: 0;
          line-height: 1.4;
        }

        .asc-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid #e8edf3;
          margin-bottom: 24px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .asc-tabs::-webkit-scrollbar { display: none; }

        .asc-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 14px;
          border: none;
          border-bottom: 2px solid transparent;
          background: transparent;
          color: #64748b;
          font-size: 0.8125rem;
          font-weight: 500;
          cursor: pointer;
          transition: color .15s, border-color .15s;
          white-space: nowrap;
          margin-bottom: -1px;
          border-radius: 0;
          letter-spacing: 0.01em;
        }
        .asc-tab:hover { color: #1e293b; }
        .asc-tab--on {
          color: #4338ca;
          border-bottom-color: #4338ca;
          font-weight: 600;
        }

        .asc-body { min-height: 0; }
      `}</style>
    </div>
  );
};

export default AdminSync;
