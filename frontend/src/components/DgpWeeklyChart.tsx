import { useEffect, useState } from 'react';
import axios from 'axios';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

interface Week {
  semaine: string; num: number; nb: number;
  dgp_semaine: number | null; dgp_cumule: number | null; nb_cumule: number; nb_hors_cumule: number;
}
interface Weekly { year: number; weeks: Week[]; dgp_moyen: number | null; nb_payees: number; nb_hors_delai: number }

const fmtDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

/** Évolution du délai global de paiement (DGP) au cours de l'année, courbe à la semaine. */
export default function DgpWeeklyChart({ year, token }: { year: number; token: string | null }) {
  const [data, setData] = useState<Weekly | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    axios.get<Weekly>(`/api/finance/dgp/weekly?fiscal_year=${year}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!cancelled) setData(r.data); })
      .catch(e => { if (!cancelled) setError(e.response?.data?.message || 'Erreur de chargement du DGP'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, token]);

  const color = data?.dgp_moyen == null ? '#64748b' : data.dgp_moyen > 30 ? '#dc2626' : '#16a34a';

  return (
    <div className="table-card">
      <div style={{ padding: '1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, color: 'var(--color-navy)', fontSize: '1.1rem', fontWeight: 700 }}>Délai global de paiement (DGP) — évolution par semaine</h3>
        {data && data.nb_payees > 0 && (
          <span style={{ fontSize: '0.85rem', color: '#475569' }}>
            DGP moyen {year} : <b style={{ color }}>{data.dgp_moyen} j</b> · {data.nb_payees} facture{data.nb_payees > 1 ? 's' : ''} payée{data.nb_payees > 1 ? 's' : ''} · {data.nb_hors_delai} hors délai (&gt; 30 j)
          </span>
        )}
      </div>
      <div style={{ padding: '1.5rem', height: '380px' }}>
        {loading && <div style={{ color: '#94a3b8', textAlign: 'center', paddingTop: 120 }}>Chargement du DGP…</div>}
        {error && <div style={{ color: '#dc2626', textAlign: 'center', paddingTop: 120 }}>{error}</div>}
        {!loading && !error && data && data.nb_payees === 0 && <div style={{ color: '#94a3b8', textAlign: 'center', paddingTop: 120 }}>Aucune facture payée en {year}.</div>}
        {!loading && !error && data && data.nb_payees > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.weeks} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="semaine" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={24} />
              <YAxis yAxisId="j" unit=" j" tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
              <YAxis yAxisId="nb" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
              <Tooltip
                labelFormatter={(l, p) => `Semaine ${p && p[0] ? p[0].payload.num : ''} (du ${fmtDate(String(l))})`}
                formatter={(v, name) => (v == null ? ['—', name] : [name === 'Factures payées' ? v : `${v} j`, name])}
              />
              <Legend />
              <ReferenceLine yAxisId="j" y={30} stroke="#dc2626" strokeDasharray="5 4" label={{ value: '30 j (délai légal)', position: 'insideTopRight', fill: '#dc2626', fontSize: 11 }} />
              <Bar yAxisId="nb" dataKey="nb" name="Factures payées" fill="#cbd5e1" barSize={10} />
              <Line yAxisId="j" type="monotone" dataKey="dgp_semaine" name="DGP de la semaine" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line yAxisId="j" type="monotone" dataKey="dgp_cumule" name="DGP cumulé depuis janvier" stroke="#16a34a" strokeWidth={2.5} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <div style={{ padding: '0 1.5rem 1rem', fontSize: '0.75rem', color: '#94a3b8' }}>
        DGP = jours entre la réception de la facture et son paiement ; chaque facture compte dans la semaine de son paiement. Données recalculées chaque nuit.
      </div>
    </div>
  );
}
