import React, { useState } from 'react';
import { Mail, Settings, Zap, Inbox } from 'lucide-react';
import MailSettings from './MailSettings';
import EmailTemplates from './EmailTemplates';
import EmailAutomation from './EmailAutomation';
import O365MailSettings from './O365MailSettings';

type MailTab = 'configuration' | 'templates' | 'automation' | 'o365';

const TABS: { id: MailTab; label: string; Icon: React.ElementType }[] = [
  { id: 'configuration', label: 'Serveur Mail',       Icon: Settings },
  { id: 'templates',     label: "Modèles d'emails",   Icon: Mail     },
  { id: 'automation',    label: 'Automatisation',      Icon: Zap      },
  { id: 'o365',          label: 'Messagerie Copieurs', Icon: Inbox    },
];

const AdminMail: React.FC = () => {
  const [tab, setTab] = useState<MailTab>('configuration');

  return (
    <div className="ap-root">
      <div className="ap-header">
        <span className="ap-header-icon" style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd' }}>
          <Mail size={16} />
        </span>
        <div>
          <h1 className="ap-title">Messagerie &amp; Emails</h1>
          <p className="ap-desc">Serveur SMTP, modèles, automatisations et intégration Office 365</p>
        </div>
      </div>

      <nav className="ap-tabs">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`ap-tab${tab === id ? ' ap-tab--on' : ''}`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </nav>

      <div className="ap-body">
        {tab === 'configuration' && <MailSettings />}
        {tab === 'templates'     && <EmailTemplates />}
        {tab === 'automation'    && <EmailAutomation />}
        {tab === 'o365'          && <O365MailSettings />}
      </div>

      <style>{`
        .ap-root { display:flex; flex-direction:column; min-height:0; }

        .ap-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 18px;
          border-bottom: 1px solid #e8edf3;
          margin-bottom: 0;
        }

        .ap-header-icon {
          width: 34px; height: 34px;
          border-radius: 7px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        .ap-title {
          font-size: 0.9375rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 2px 0;
          line-height: 1.3;
        }

        .ap-desc {
          font-size: 0.78rem;
          color: #94a3b8;
          margin: 0;
          line-height: 1.4;
        }

        .ap-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid #e8edf3;
          margin-bottom: 24px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .ap-tabs::-webkit-scrollbar { display: none; }

        .ap-tab {
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
        .ap-tab:hover { color: #1e293b; }
        .ap-tab--on {
          color: #0284c7;
          border-bottom-color: #0284c7;
          font-weight: 600;
        }

        .ap-body { min-height: 0; }
      `}</style>
    </div>
  );
};

export default AdminMail;
