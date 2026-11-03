import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { formatOrgName } from '../utils/orgName';
import { Search, Loader2, X, Mail, Phone, Smartphone, UserSearch } from 'lucide-react';

// BETA « Recherche d'agent » : annuaire RH Studio (lecture seule).
// Affiche prénom, nom, matricule, service, direction ; e-mail, téléphone et mobile (lus dans l'AD) quand ils existent.
interface RhAgent {
  matricule: string; prenom: string; nom: string; service: string; service_code: string; direction: string;
  poste: string; fonction: string; email: string; telephone: string; mobile: string;
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());

export default function AgentSearch({ onClose, beta = false }: { onClose: () => void; beta?: boolean }) {
  const [q, setQ] = useState('');
  const [agents, setAgents] = useState<RhAgent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  // Recherche au fil de la saisie (300 ms après la dernière frappe)
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setAgents(null); setError(''); setLoading(false); return; }
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const token = localStorage.getItem('token');
        const r = await axios.get('/api/magapp/agent-search', { params: { q: query }, headers: { Authorization: `Bearer ${token}` } });
        if (id !== seq.current) return;
        setAgents(r.data?.agents || []); setError('');
      } catch (e: any) {
        if (id !== seq.current) return;
        setAgents(null); setError(e?.response?.data?.message || 'Recherche impossible pour le moment.');
      } finally { if (id === seq.current) setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const field = (label: string, value: string) => value ? (
    <div style={{ fontSize: '0.8rem', color: '#475569' }}><span style={{ color: '#94a3b8' }}>{label} : </span><strong style={{ color: '#1e293b' }}>{value}</strong></div>
  ) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', maxWidth: '640px', width: '100%', borderRadius: '24px', padding: '28px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', position: 'relative', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '18px', right: '18px', background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <div style={{ width: '44px', height: '44px', background: '#fef3c7', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserSearch size={24} color="#b45309" />
          </div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#1e293b' }}>Recherche d'agent</h2>
          {beta && <span style={{ background: '#f59e0b', color: '#1e293b', fontSize: '0.6rem', fontWeight: 800, padding: '2px 6px', borderRadius: '6px', letterSpacing: '0.05em' }}>BETA</span>}
        </div>
        <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: '0.85rem' }}>Cherchez un agent de la Ville par nom, prénom ou matricule (source : RH Studio).</p>

        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, prénom ou matricule…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '11px 36px 11px 36px', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '0.95rem', outline: 'none' }} />
          {loading && <Loader2 size={16} color="#94a3b8" className="spin" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }} />}
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {error && <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 12px', fontSize: '0.85rem' }}>{error}</div>}
          {agents && agents.length === 0 && !loading && <div style={{ color: '#94a3b8', textAlign: 'center', padding: '20px', fontSize: '0.9rem' }}>Aucun agent trouvé.</div>}
          {agents && agents.length >= 10 && <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>10 résultats maximum : précisez votre recherche pour affiner.</div>}
          {agents && agents.map((a, i) => (
            <div key={`${a.matricule}-${i}`} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px 14px', background: '#f8fafc' }}>
              <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '1rem' }}>{titleCase(a.prenom)} {a.nom.toUpperCase()}</div>
              {(a.poste || a.fonction) && <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>{a.poste ? formatOrgName(a.poste) : a.fonction}</div>}
              {field('Matricule', a.matricule)}
              {field('Service', formatOrgName(a.service))}
              {field('Code service', a.service_code)}
              {field('Direction', formatOrgName(a.direction))}
              {(a.email || a.telephone || a.mobile) && (
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '6px', fontSize: '0.85rem' }}>
                  {a.email && <a href={`mailto:${a.email}`} style={{ color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Mail size={14} /> {a.email}</a>}
                  {a.telephone && <a href={`tel:${a.telephone.replace(/\s/g, '')}`} style={{ color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Phone size={14} /> {a.telephone}</a>}
                  {a.mobile && <a href={`tel:${a.mobile.replace(/\s/g, '')}`} style={{ color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Smartphone size={14} /> {a.mobile}</a>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
