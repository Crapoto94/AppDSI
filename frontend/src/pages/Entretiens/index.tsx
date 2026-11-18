import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  ClipboardCheck, CalendarDays, Users, LayoutDashboard, Settings,
  ShieldCheck, UserCheck, Loader2, AlertCircle, RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { MeData } from './types';
import MonEntretien from './MonEntretien';
import Evaluations from './Evaluations';
import Pilotage from './Pilotage';
import Reglages from './Reglages';
import Header from '../../components/Header';
import { COLORS, btnGhost, card } from './ui';

type Tab = 'moi' | 'evaluations' | 'pilotage' | 'reglages';

export default function Entretiens() {
  const { token } = useAuth();
  const [me, setMe] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('moi');
  const initialized = useRef(false);

  const load = useCallback(async (silent = false) => {
    // Jeton vide au premier rendu : évite « Bearer null » (pris pour un jeton kiosque côté serveur)
    if (!token) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const r = await axios.get('/api/entretiens/me', { headers: { Authorization: `Bearer ${token}` } });
      setMe(r.data);
      if (!initialized.current) {
        initialized.current = true;
        if (r.data.isAdmin) setTab('pilotage');
        else if (r.data.isEvaluator) setTab('evaluations');
        else setTab('moi');
      }
    } catch (e: any) {
      setError(e.response?.data?.message || 'Impossible de charger le module Entretiens professionnels');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode; badge?: number; visible: boolean }> = [
    { key: 'moi', label: 'Mon entretien', icon: <CalendarDays size={15} />, visible: true },
    { key: 'evaluations', label: 'Mes EP', icon: <Users size={15} />, badge: me?.evaluatorCount || 0, visible: !!me?.isEvaluator },
    { key: 'pilotage', label: 'Pilotage', icon: <LayoutDashboard size={15} />, visible: !!me?.isAdmin },
    { key: 'reglages', label: 'Paramétrage', icon: <Settings size={15} />, visible: !!me?.isAdmin },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Header />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24, fontFamily: "'Segoe UI', sans-serif" }}>
      {/* En-tête de page */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ClipboardCheck size={28} color={COLORS.primary} /> Entretiens professionnels
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
            {me?.campaign
              ? `${me.campaign.libelle || `Campagne ${me.campaign.annee}`} · préparation, évaluation et compte rendu`
              : 'Campagne annuelle des entretiens professionnels'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {me?.isAdmin && <Pill icon={<ShieldCheck size={13} />} label="Administrateur du module" />}
          {me?.isEvaluator && <Pill icon={<UserCheck size={13} />} label="Évaluateur" />}
          {!me?.isAdmin && !me?.isEvaluator && me && <Pill icon={<UserCheck size={13} />} label="Agent" />}
          <button onClick={() => load(true)} title="Actualiser" style={{ ...btnGhost, borderRadius: 999, padding: '4px 11px', fontSize: 11.5 }}>
            <RefreshCw size={12} /> Actualiser
          </button>
        </div>
      </div>

      {/* Onglets */}
      {me && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '2px solid #e2e8f0', marginBottom: 24 }}>
          {tabs.filter(t => t.visible).map(t => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
                  borderBottom: `2px solid ${active ? COLORS.primary : 'transparent'}`, marginBottom: -2,
                  color: active ? COLORS.primary : '#64748b',
                  fontSize: 14, fontWeight: 500, transition: '.15s',
                }}>
                {t.icon}{t.label}
                {!!t.badge && (
                  <span style={{
                    background: active ? COLORS.primary : '#e2e8f0',
                    color: active ? '#fff' : '#475569',
                    borderRadius: 999, padding: '1px 7px', fontSize: 10.5, fontWeight: 800,
                  }}>{t.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Contenu */}
      {loading && !me ? (
        <div style={{ ...card, padding: 56, display: 'flex', justifyContent: 'center', color: '#94a3b8' }}>
          <Loader2 size={26} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : error ? (
        <div style={{ ...card, padding: 22, display: 'flex', gap: 10, alignItems: 'flex-start', color: COLORS.danger, fontSize: 13 }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <div>{error}</div>
        </div>
      ) : me ? (
        <>
          {tab === 'moi' && <MonEntretien data={me} onChanged={() => load(true)} />}
          {tab === 'evaluations' && me.isEvaluator && <Evaluations onChanged={() => load(true)} />}
          {tab === 'pilotage' && me.isAdmin && <Pilotage onChanged={() => load(true)} />}
          {tab === 'reglages' && me.isAdmin && <Reglages onChanged={() => load(true)} />}
        </>
      ) : null}
      </div>
    </div>
  );
}

function Pill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      border: '1px solid #c7d2fe', background: '#eef2ff', color: COLORS.primary,
      borderRadius: 999, padding: '4px 11px', fontSize: 11.5, fontWeight: 700,
    }}>{icon}{label}</span>
  );
}
