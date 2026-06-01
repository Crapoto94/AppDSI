import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { Lightbulb } from 'lucide-react';

export default function MagappIdeasWidget() {
  const { token } = useAuth();
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/admin/magapp/ideas', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const ideas: any[] = Array.isArray(r.data) ? r.data : r.data?.ideas || [];
        setCount(ideas.filter((i: any) => i.status === 'new' || i.status === 'nouveau' || !i.status).length);
      })
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <WidgetWrapper title="Idées en attente" loading={loading} error={error}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6 }}>
        <Lightbulb size={28} color={count ? '#f59e0b' : '#94a3b8'} />
        <div style={{ fontSize: 32, fontWeight: 700, color: count ? '#f59e0b' : '#94a3b8' }}>{count ?? '–'}</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>idée{count !== 1 ? 's' : ''} à traiter</div>
      </div>
    </WidgetWrapper>
  );
}
