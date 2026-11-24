import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

interface Stats {
    total?: number;
    planned?: number;
    in_progress?: number;
    finished?: number;
    upcoming_7d?: number;
    this_year?: number;
    participants_total?: number;
    participation_rate?: number;
    avg_duration?: number;
    items?: number;
}

export default function ReunionsServiceKpiWidget() {
    const { token } = useAuth();
    const [data, setData] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        axios.get('/api/reunions-service/stats', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => setData(r.data))
            .catch(e => setError(e?.response?.data?.error || 'Erreur'))
            .finally(() => setLoading(false));
    }, [token]);

    const kpis = data ? [
        { label: 'Réunions', value: num(data.total), sub: `${num(data.this_year)} cette année`, color: '#0078a4' },
        { label: 'Planifiées', value: num(data.planned), sub: 'À venir', color: '#2563eb' },
        { label: 'En cours', value: num(data.in_progress), sub: 'Séances ouvertes', color: '#b91c1c' },
        { label: 'Terminées', value: num(data.finished), sub: 'Historique', color: '#15803d' },
        { label: 'Présence', value: `${num(data.participation_rate)} %`, sub: `${num(data.participants_total)} participations`, color: '#0d9488' },
        { label: 'Durée moy.', value: `${num(data.avg_duration)} min`, sub: `${num(data.items)} items`, color: '#7c3aed' },
    ] : [];

    return (
        <WidgetWrapper title="Réunions de service — indicateurs" loading={loading} error={error}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, alignContent: 'start', height: '100%' }}>
                {kpis.map(k => (
                    <div key={k.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', borderLeft: `3px solid ${k.color}` }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.value}</div>
                        <div style={{ fontSize: 11, color: '#374151', marginTop: 2, fontWeight: 700 }}>{k.label}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{k.sub}</div>
                    </div>
                ))}
            </div>
        </WidgetWrapper>
    );
}
