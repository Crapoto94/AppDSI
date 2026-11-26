import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

const FY = new Date().getFullYear();
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const eur = (v: number) => `${Math.round(v || 0).toLocaleString('fr-FR')} €`;

interface EngRow {
  'Code mouvement'?: string;
  'Libellé'?: string;
  'Type mvt'?: string;
  'Reste engagé'?: number | string;
  'Nom tiers'?: string;
  'Imputation'?: string;
  'Bon de commande'?: string;
  is_ens?: boolean;
}

/** ENS : engagements non soldés (reports / rattachements avec reste engagé) — SEDIT. */
export default function BudgetEnsWidget() {
  const { token } = useAuth();
  const [rows, setRows] = useState<EngRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get(`/api/budget/engagements?fiscalYear=${FY}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const arr: EngRow[] = Array.isArray(r.data) ? r.data : (r.data?.rows || []);
        setRows((Array.isArray(arr) ? arr : []).filter(x => x && (
          x.is_ens === true ||
          ((x['Type mvt'] === 'Report' || x['Type mvt'] === 'Rattachement') && num(x['Reste engagé']) > 0.01)
        )));
      })
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const total = rows.reduce((s, r) => s + num(r['Reste engagé']), 0);
  const sorted = [...rows].sort((a, b) => num(b['Reste engagé']) - num(a['Reste engagé']));

  return (
    <WidgetWrapper title={`ENS — engagements non soldés ${FY}`} loading={loading} error={error}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: rows.length ? '#b45309' : '#16a34a', lineHeight: 1 }}>{rows.length}</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>engagement{rows.length === 1 ? '' : 's'} non soldé{rows.length === 1 ? '' : 's'}</span>
          <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{eur(total)}</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sorted.length === 0 && !loading && (
            <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 12 }}>Aucun engagement non soldé.</div>
          )}
          {sorted.slice(0, 8).map((r, i) => (
            <div key={`${r['Code mouvement'] || i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: '#f8fafc', borderRadius: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r['Code mouvement']} — {r['Libellé'] || '—'}
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {[r['Bon de commande'] ? `BC ${r['Bon de commande']}` : '', r['Nom tiers'], r['Imputation']].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>{eur(num(r['Reste engagé']))}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 9, color: '#cbd5e1', textAlign: 'right' }}>Source : SEDIT Finances (engagements)</div>
      </div>
    </WidgetWrapper>
  );
}
