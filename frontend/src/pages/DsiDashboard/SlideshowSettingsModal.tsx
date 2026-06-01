import React, { useState } from 'react';
import { X, Play, Clock, Filter, ArrowUpDown } from 'lucide-react';
import type { FilterPeriod } from './DashboardFilterContext';
import { PERIOD_LABELS } from './DashboardFilterContext';

interface SlideshowSettings {
  is_rotating: boolean;
  rotation_seconds: number;
  rotation_order: number;
  rotation_filter: { period?: FilterPeriod; group_id?: number | null };
}

interface Props {
  dashboardName: string;
  current: SlideshowSettings;
  onSave: (s: SlideshowSettings) => void;
  onClose: () => void;
}

export default function SlideshowSettingsModal({ dashboardName, current, onSave, onClose }: Props) {
  const [s, setS] = useState<SlideshowSettings>({ ...current });

  const field = <K extends keyof SlideshowSettings>(k: K, v: SlideshowSettings[K]) =>
    setS(prev => ({ ...prev, [k]: v }));

  const filterField = (k: 'period' | 'group_id', v: any) =>
    setS(prev => ({ ...prev, rotation_filter: { ...prev.rotation_filter, [k]: v || undefined } }));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'white', borderRadius: 14, padding: 28, width: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,.2)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Paramètres diaporama</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{dashboardName}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Activation toggle */}
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#f8fafc', borderRadius: 10, marginBottom: 16, cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Play size={16} color={s.is_rotating ? '#3b82f6' : '#94a3b8'} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Inclure dans le diaporama</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Ce tableau sera affiché automatiquement</div>
            </div>
          </div>
          <div
            onClick={() => field('is_rotating', !s.is_rotating)}
            style={{
              width: 42, height: 24, borderRadius: 12, cursor: 'pointer',
              background: s.is_rotating ? '#3b82f6' : '#cbd5e1',
              position: 'relative', transition: 'background .2s', flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', top: 3, left: s.is_rotating ? 21 : 3,
              width: 18, height: 18, borderRadius: '50%', background: 'white',
              transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
            }} />
          </div>
        </label>

        {s.is_rotating && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Duration */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Clock size={13} /> Durée d'affichage
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range" min={5} max={300} step={5}
                  value={s.rotation_seconds}
                  onChange={e => field('rotation_seconds', Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', width: 60, textAlign: 'right' }}>
                  {s.rotation_seconds}s
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                <span>5s</span><span>1 min</span><span>5 min</span>
              </div>
            </div>

            {/* Order */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <ArrowUpDown size={13} /> Ordre d'affichage
              </label>
              <input
                type="number" min={0} max={99}
                value={s.rotation_order}
                onChange={e => field('rotation_order', Number(e.target.value))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}
              />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Les tableaux sont affichés du plus petit au plus grand numéro</div>
            </div>

            {/* Filter */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Filter size={13} /> Filtre de période (KPI tickets)
              </label>
              <select
                value={s.rotation_filter.period || 'all'}
                onChange={e => filterField('period', e.target.value as FilterPeriod)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', background: 'white' }}
              >
                {(Object.keys(PERIOD_LABELS) as FilterPeriod[]).map(p => (
                  <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 8, background: 'white', color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
            Annuler
          </button>
          <button onClick={() => { onSave(s); onClose(); }} style={{ padding: '9px 18px', border: 'none', borderRadius: 8, background: '#3b82f6', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
