import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../../components/Header';
import { Users, UserCheck, Calendar } from 'lucide-react';
import Contractuels from './Contractuels';

const TABS = [
  { key: 'contractuels', label: 'Gestion des contractuels', icon: UserCheck },
  { key: '_placeholder', label: 'À venir', icon: Calendar, disabled: true },
];

export default function RHPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'contractuels';

  const setTab = (key: string) => {
    setSearchParams({ tab: key });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Header />
      <style>{`
        .rh-page { max-width: 1400px; margin: 0 auto; padding: 24px; font-family: 'Segoe UI', sans-serif; }
        .rh-page-header { margin-bottom: 24px; }
        .rh-page-header h1 { font-size: 24px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 10px; margin: 0 0 4px; }
        .rh-page-header p { color: #64748b; margin: 0; font-size: 14px; }
        .rh-tabs { display: flex; gap: 4px; border-bottom: 2px solid #e2e8f0; margin-bottom: 24px; }
        .rh-tab { display: flex; align-items: center; gap: 6px; padding: 10px 20px; border: none; background: none; font-size: 14px; font-weight: 500; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: .15s; }
        .rh-tab:hover { color: #4f46e5; background: #f8fafc; border-radius: 8px 8px 0 0; }
        .rh-tab.active { color: #4f46e5; border-bottom-color: #4f46e5; }
        .rh-tab:disabled { opacity: .4; cursor: not-allowed; }
      `}</style>
      <div className="rh-page">
        <div className="rh-page-header">
          <h1><Users size={28} color="#4f46e5" /> Ressources Humaines</h1>
          <p>Gestion des agents, contractuels et organigramme de la DSI</p>
        </div>

        <div className="rh-tabs">
          {TABS.map(tab => (
            <button key={tab.key} className={`rh-tab ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setTab(tab.key)} disabled={tab.disabled}>
              <tab.icon size={18} /> {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'contractuels' && <Contractuels />}
      </div>
    </div>
  );
}
