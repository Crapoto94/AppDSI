import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

interface SiteRow {
  site_code: string;
  nom: string;
  total_switchs: number;
  switchs_ok: number;
  switchs_ko: number;
}

export default function ReseauSitesWidget() {
  const { token } = useAuth();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/network/sites-with-switches', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setSites(r.data || []))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const totalSwitchs = sites.reduce((s, site) => s + site.total_switchs, 0);
  const totalOk = sites.reduce((s, site) => s + site.switchs_ok, 0);
  const totalKo = sites.reduce((s, site) => s + site.switchs_ko, 0);
  const allGreen = sites.filter(s => s.switchs_ok === s.total_switchs).length;
  const allRed = sites.filter(s => s.switchs_ko === s.total_switchs).length;
  const orange = sites.length - allGreen - allRed;

  const problemSites = sites.filter(s => {
    const ok = s.switchs_ok === s.total_switchs;
    const ko = s.switchs_ko === s.total_switchs;
    return !ok && !ko;
  });

  const koSites = sites.filter(s => s.switchs_ko === s.total_switchs);

  return (
    <WidgetWrapper title="État des sites Réseau" loading={loading} error={error}>
      {sites.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '16px 0', fontSize: 12 }}>
          Aucun site avec switch référencé
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {[
              { label: 'Sites', value: sites.length, color: '#64748b' },
              { label: 'Switchs', value: totalSwitchs, color: '#8b5cf6' },
              { label: 'OK', value: totalOk, color: '#22c55e' },
              { label: 'KO', value: totalKo, color: '#ef4444' },
            ].map(k => (
              <div key={k.label} style={{ textAlign: 'center', background: '#f8fafc', borderRadius: 6, padding: '4px 2px', borderLeft: `3px solid ${k.color}` }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: k.color, lineHeight: 1.2 }}>{k.value}</div>
                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>{k.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
            <span style={{ color: '#16a34a' }}>⬤ {allGreen} OK</span>
            <span style={{ color: '#f97316' }}>⬤ {orange} Mixte</span>
            <span style={{ color: '#dc2626' }}>⬤ {allRed} KO</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3, overflow: 'auto', flex: 1, alignContent: 'start' }}>
            {[...problemSites, ...koSites, ...sites.filter(s => s.switchs_ok === s.total_switchs)].map(site => {
              const isMixed = site.switchs_ko > 0 && site.switchs_ok > 0;
              const color = isMixed ? '#f97316' : site.switchs_ko === site.total_switchs ? '#ef4444' : '#22c55e';
              return (
                <div key={site.site_code} style={{
                  display: 'flex', alignItems: 'center', gap: 3, padding: '2px 5px',
                  background: `${color}15`, borderRadius: 4, border: `1px solid ${color}30`,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: color }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 600, color: '#1e293b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.site_code}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color }}>{site.total_switchs}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </WidgetWrapper>
  );
}
