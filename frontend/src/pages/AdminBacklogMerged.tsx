import React, { useState } from 'react';
import { Inbox, Lightbulb } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import AdminBacklog from './AdminBacklog';
import AdminIdeas from './AdminIdeas';

type BacklogTab = 'backlog' | 'magapp';

const TABS: { id: BacklogTab; label: string; Icon: React.ElementType }[] = [
  { id: 'backlog', label: 'BackLog DSIHUB', Icon: Inbox      },
  { id: 'magapp', label: 'BackLog Magapp',  Icon: Lightbulb  },
];

const AdminBacklogMerged: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initial: BacklogTab = searchParams.get('tab') === 'magapp' ? 'magapp' : 'backlog';
  const [tab, setTab] = useState<BacklogTab>(initial);

  return (
    <div className="abm-root">
      <div className="abm-header">
        <span className="abm-header-icon">
          <Inbox size={16} />
        </span>
        <div>
          <h1 className="abm-title">Backlog &amp; Idées</h1>
          <p className="abm-desc">Demandes de fonctionnalités et idées d'améliorations DSI Hub et MagApp</p>
        </div>
      </div>

      <nav className="abm-tabs">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`abm-tab${tab === id ? ' abm-tab--on' : ''}`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </nav>

      <div className="abm-body">
        {tab === 'backlog' && <AdminBacklog />}
        {tab === 'magapp'  && <AdminIdeas />}
      </div>

      <style>{`
        .abm-root { display:flex; flex-direction:column; min-height:0; }

        .abm-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 18px;
          border-bottom: 1px solid #e8edf3;
          margin-bottom: 0;
        }

        .abm-header-icon {
          width: 34px; height: 34px;
          border-radius: 7px;
          background: #fefce8;
          color: #a16207;
          border: 1px solid #fde68a;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        .abm-title {
          font-size: 0.9375rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 2px 0;
          line-height: 1.3;
        }

        .abm-desc {
          font-size: 0.78rem;
          color: #94a3b8;
          margin: 0;
          line-height: 1.4;
        }

        .abm-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid #e8edf3;
          margin-bottom: 24px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .abm-tabs::-webkit-scrollbar { display: none; }

        .abm-tab {
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
        .abm-tab:hover { color: #1e293b; }
        .abm-tab--on {
          color: #a16207;
          border-bottom-color: #a16207;
          font-weight: 600;
        }

        .abm-body { min-height: 0; }
      `}</style>
    </div>
  );
};

export default AdminBacklogMerged;
