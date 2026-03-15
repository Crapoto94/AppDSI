const fs = require('fs');
let content = fs.readFileSync('src/pages/StudioRH.tsx', 'utf8');

// ─── HELPER ──────────────────────────────────────────────────────────────────
function replaceExact(original, replacement) {
  if (!content.includes(original)) {
    console.error('❌ NOT FOUND:', original.substring(0, 80));
    return;
  }
  content = content.split(original).join(replacement);
  console.log('✅', original.substring(0, 60).replace(/\r?\n/g, '↵'));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. AgentAvatar — richer: dashed if inactive, strikethrough if departed,
//    "nouv" badge if arrived <30d, "proch" badge if arriving soon
// ═══════════════════════════════════════════════════════════════════════════════
replaceExact(
`// ─── AgentAvatar ────────────────────────────────────────────────────────────
const ENCADRANT_COLORS: Record<string, string> = {
  dg: '#7c3aed', dir: '#1d4ed8', service: '#0369a1', secteur: '#0f766e',
};
const AgentAvatar = ({ agent }: { agent: any }) => {
  const lvl = agent?.management_level;
  const bg = lvl && ENCADRANT_COLORS[lvl] ? ENCADRANT_COLORS[lvl] + '22' : '#e2e8f0';
  const color = lvl && ENCADRANT_COLORS[lvl] ? ENCADRANT_COLORS[lvl] : '#64748b';
  return (
    <div style={{ width: '40px', height: '40px', minWidth: '40px', borderRadius: '10px', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
      {agent?.nom?.charAt(0)}{agent?.prenom?.charAt(0)}
    </div>
  );
};`,
`// ─── AgentAvatar ────────────────────────────────────────────────────────────
const ENCADRANT_COLORS: Record<string, string> = {
  dg: '#7c3aed', dir: '#1d4ed8', service: '#0369a1', secteur: '#0f766e',
};
const AgentAvatar = ({ agent, onClick }: { agent: any; onClick?: () => void }) => {
  const now = new Date();
  const lvl = agent?.management_level;
  const bg = lvl && ENCADRANT_COLORS[lvl] ? ENCADRANT_COLORS[lvl] + '22' : '#e2e8f0';
  const color = lvl && ENCADRANT_COLORS[lvl] ? ENCADRANT_COLORS[lvl] : '#64748b';

  const arrivalDate = agent?.DATE_ARRIVEE ? new Date(agent.DATE_ARRIVEE) : null;
  const departDate = agent?.DATE_DEPART ? new Date(agent.DATE_DEPART) : null;

  const isDepart = departDate && departDate <= now;
  const isFuture = arrivalDate && arrivalDate > now;
  const isNew = arrivalDate && arrivalDate <= now && (now.getTime() - arrivalDate.getTime()) < 30 * 24 * 3600 * 1000;
  const isInactive = !isDepart && !isFuture && !isNew && agent?.is_active === false;

  let border = 'none';
  if (isDepart) border = '2px dashed #ef4444';
  else if (isFuture) border = '2px dashed #3b82f6';
  else if (isInactive) border = '2px dashed #94a3b8';

  return (
    <div style={{ position: 'relative', width: '40px', height: '40px', flexShrink: 0, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div style={{ width: '40px', height: '40px', minWidth: '40px', borderRadius: '10px', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', border, overflow: 'hidden', position: 'relative' }}>
        {agent?.nom?.charAt(0)}{agent?.prenom?.charAt(0)}
        {isDepart && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(to bottom right, transparent calc(50% - 1px), #ef444466 50%, transparent calc(50% + 1px))', pointerEvents: 'none' }} />
        )}
      </div>
      {isNew && <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#059669', color: 'white', fontSize: '8px', fontWeight: 800, padding: '1px 4px', borderRadius: '4px', lineHeight: 1.4 }}>NOUV</span>}
      {isFuture && <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#3b82f6', color: 'white', fontSize: '8px', fontWeight: 800, padding: '1px 4px', borderRadius: '4px', lineHeight: 1.4 }}>PROCH</span>}
    </div>
  );
};`
);

// ═══════════════════════════════════════════════════════════════════════════════
// 2. OnboardingView — 3 catégories: Non commencé / En cours / Terminé
// ═══════════════════════════════════════════════════════════════════════════════
replaceExact(
`const OnboardingView = ({ headers, loadAgentDetails }: any) => {
  const [agents, setAgents] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    axios.get('/api/admin/rh/agents', { headers, params: { limit: 200 } })
      .then(res => {
        const ag = Array.isArray(res.data?.agents) ? res.data.agents : (Array.isArray(res.data) ? res.data : []);
        const now = new Date();
        const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
        const filtered = ag.filter((a: any) => a.DATE_ARRIVEE && new Date(a.DATE_ARRIVEE) >= twoMonthsAgo);
        setAgents(filtered.sort((a: any, b: any) => new Date(b.DATE_ARRIVEE).getTime() - new Date(a.DATE_ARRIVEE).getTime()));
      }).finally(() => setLoading(false));
  }, []);
  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spin" size={32} style={{ margin: '0 auto' }} /></div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Onboarding (Nouveaux arrivants)</h1>
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
        {agents.length === 0 ? <p style={{ color: '#64748b' }}>Aucun agent récemment arrivé.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Agent</th>
                <th style={{ padding: '12px' }}>Date d\u2019arrivée</th>
                <th style={{ padding: '12px' }}>Service</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a: any) => (
                <tr key={a.matricule} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => loadAgentDetails(a)}>
                    <AgentAvatar agent={a} />
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{a.nom} {a.prenom}</div>
                      <div style={{ color: '#64748b', fontSize: '11px' }}>{a.POSTE_L}</div>
                    </div>
                  </td>
                  <td style={{ padding: '12px', fontWeight: 600, color: '#059669' }}>{new Date(a.DATE_ARRIVEE).toLocaleDateString('fr-FR')}</td>
                  <td style={{ padding: '12px', color: '#64748b' }}>{a.SERVICE_L || a.DIRECTION_L}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};`,
`const OnboardingView = ({ headers, loadAgentDetails }: any) => {
  const [loading, setLoading] = React.useState(true);
  const [nonCommence, setNonCommence] = React.useState<any[]>([]);
  const [enCours, setEnCours] = React.useState<any[]>([]);
  const [termine, setTermine] = React.useState<any[]>([]);

  React.useEffect(() => {
    axios.get('/api/admin/rh/agents', { headers, params: { limit: 500 } })
      .then(res => {
        const ag = Array.isArray(res.data?.agents) ? res.data.agents : (Array.isArray(res.data) ? res.data : []);
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
        const relevant = ag.filter((a: any) => {
          if (!a.DATE_ARRIVEE) return false;
          const d = new Date(a.DATE_ARRIVEE);
          return d > thirtyDaysAgo; // arrivée future OU il y a moins de 30 jours
        });
        setNonCommence(relevant.filter((a: any) => new Date(a.DATE_ARRIVEE) > now));
        setEnCours(relevant.filter((a: any) => {
          const d = new Date(a.DATE_ARRIVEE);
          return d <= now && d >= thirtyDaysAgo;
        }));
        // "Terminé" = onboarding de plus de 30 jours mais toujours récents (dernier mois précédent)
        const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 3600 * 1000);
        setTermine(ag.filter((a: any) => {
          if (!a.DATE_ARRIVEE) return false;
          const d = new Date(a.DATE_ARRIVEE);
          return d < thirtyDaysAgo && d >= sixtyDaysAgo;
        }));
      }).finally(() => setLoading(false));
  }, []);

  const AgentRow = ({ a }: { a: any }) => (
    <tr style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => loadAgentDetails(a)}>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AgentAvatar agent={a} onClick={() => loadAgentDetails(a)} />
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>{a.nom} {a.prenom}</div>
            <div style={{ color: '#64748b', fontSize: '11px' }}>{a.POSTE_L}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#059669', fontSize: '13px' }}>{new Date(a.DATE_ARRIVEE).toLocaleDateString('fr-FR')}</td>
      <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '13px' }}>{a.SERVICE_L || a.DIRECTION_L || '—'}</td>
    </tr>
  );

  const Section = ({ title, color, bg, agents }: any) => agents.length === 0 ? null : (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', background: bg, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontWeight: 700, fontSize: '14px', color }}>{title}</span>
        <span style={{ background: color + '22', color, borderRadius: '99px', padding: '2px 8px', fontSize: '12px', fontWeight: 700 }}>{agents.length}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead><tr style={{ background: '#f8fafc', color: '#94a3b8', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
          <th style={{ padding: '8px 12px' }}>Agent</th>
          <th style={{ padding: '8px 12px' }}>Date arrivée</th>
          <th style={{ padding: '8px 12px' }}>Service</th>
        </tr></thead>
        <tbody>{agents.map((a: any) => <AgentRow key={a.matricule} a={a} />)}</tbody>
      </table>
    </div>
  );

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spin" size={32} style={{ margin: '0 auto' }} /></div>;
  const total = nonCommence.length + enCours.length + termine.length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Onboarding</h1>
        <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: '99px', padding: '4px 12px', fontSize: '13px', fontWeight: 600 }}>{total} agent(s)</span>
      </div>
      {total === 0 && <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Aucun agent en onboarding dans les 60 derniers jours.</div>}
      <Section title="Non commencé (arrivée prochaine)" color="#3b82f6" bg="#eff6ff" agents={nonCommence} />
      <Section title="En cours (arrivé il y a moins de 30 jours)" color="#059669" bg="#ecfdf5" agents={enCours} />
      <Section title="Terminé (arrivé il y a 30 à 60 jours)" color="#64748b" bg="#f8fafc" agents={termine} />
    </div>
  );
};`
);

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ServicesView — group by direction, then services inside
// ═══════════════════════════════════════════════════════════════════════════════
replaceExact(
`const ServicesView = ({ headers, loadAgentDetails }: any) => {
  const [data, setData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    axios.get('/api/admin/rh/agents', { headers, params: { limit: 500 } }).then(res => {
      const ag = Array.isArray(res.data?.agents) ? res.data.agents : (Array.isArray(res.data) ? res.data : []);
      const grouped = ag.reduce((acc: any, agent: any) => {
        const svc = agent.SERVICE_L || agent.DIRECTION_L || 'Non affect\u00e9';
        if (!acc[svc]) acc[svc] = [];
        acc[svc].push(agent);
        return acc;
      }, {});
      setData(Object.entries(grouped).sort((a: any, b: any) => b[1].length - a[1].length));
    }).finally(() => setLoading(false));
  }, []);
  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spin" size={32} style={{ margin: '0 auto' }} /></div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Services & Directions</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {data.map(([svc, agentList]: [string, any]) => (
          <div key={svc} style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a', marginBottom: '4px' }}>{svc}</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>{agentList.length} agent(s)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {agentList.slice(0, 10).map((a: any) => (
                <div key={a.matricule} title={a.nom + ' ' + a.prenom} onClick={() => loadAgentDetails(a)} style={{ cursor: 'pointer' }}>
                  <AgentAvatar agent={a} />
                </div>
              ))}
              {agentList.length > 10 && <div style={{ width: '40px', height: '40px', background: '#f1f5f9', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#64748b', fontWeight: 700 }}>+{agentList.length - 10}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};`,
`const ServicesView = ({ headers, loadAgentDetails }: any) => {
  const [dirData, setDirData] = React.useState<any>({});
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    axios.get('/api/admin/rh/agents', { headers, params: { limit: 2000 } }).then(res => {
      const ag = Array.isArray(res.data?.agents) ? res.data.agents : (Array.isArray(res.data) ? res.data : []);
      // Group by direction, then by service
      const dirs: any = {};
      ag.forEach((agent: any) => {
        const dir = agent.DIRECTION_L || 'Non affecté';
        const svc = agent.SERVICE_L || dir;
        if (!dirs[dir]) dirs[dir] = {};
        if (!dirs[dir][svc]) dirs[dir][svc] = [];
        dirs[dir][svc].push(agent);
      });
      setDirData(dirs);
      // Auto-expand first direction
      const firstDir = Object.keys(dirs)[0];
      if (firstDir) setExpanded({ [firstDir]: true });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spin" size={32} style={{ margin: '0 auto' }} /></div>;
  const directions = Object.entries(dirData).sort((a: any, b: any) => {
    const countA = Object.values(a[1] as any).reduce((s: any, v: any) => s + v.length, 0);
    const countB = Object.values(b[1] as any).reduce((s: any, v: any) => s + v.length, 0);
    return (countB as number) - (countA as number);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Services & Directions</h1>
        <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: '99px', padding: '4px 12px', fontSize: '13px', fontWeight: 600 }}>{directions.length} direction(s)</span>
      </div>

      {directions.map(([dir, services]: [string, any]) => {
        const totalInDir = Object.values(services).reduce((s: any, v: any) => s + v.length, 0) as number;
        const isOpen = expanded[dir];
        return (
          <div key={dir} style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div onClick={() => setExpanded(prev => ({ ...prev, [dir]: !prev[dir] }))} style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isOpen ? '#f8fafc' : 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>{dir}</span>
                <span style={{ background: '#e2e8f0', color: '#475569', borderRadius: '99px', padding: '2px 10px', fontSize: '12px', fontWeight: 700 }}>{totalInDir} agents</span>
              </div>
              <ChevronRight size={18} style={{ color: '#94a3b8', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
            </div>
            {isOpen && (
              <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {Object.entries(services).sort((a: any, b: any) => b[1].length - a[1].length).map(([svc, agList]: [string, any]) => (
                  <div key={svc}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {svc} <span style={{ fontWeight: 500, textTransform: 'none', color: '#94a3b8' }}>({agList.length})</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {agList.map((a: any) => (
                        <div key={a.matricule} title={a.nom + ' ' + a.prenom + (a.POSTE_L ? ' — ' + a.POSTE_L : '')} style={{ cursor: 'pointer' }} onClick={() => loadAgentDetails(a)}>
                          <AgentAvatar agent={a} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};`
);

// ═══════════════════════════════════════════════════════════════════════════════
// 4. AlignmentsView — show non-aligned based on configured mappings
// ═══════════════════════════════════════════════════════════════════════════════
replaceExact(
`const AlignmentsView = ({ headers, loadAgentDetails }: any) => {
  const [agents, setAgents] = React.useState<any[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [processing, setProcessing] = React.useState(false);
  const fetchAlignments = () => {
    setLoading(true);
    axios.get('/api/admin/rh/alignments', { headers }).then(res => setAgents(res.data || [])).finally(() => setLoading(false));
  };
  React.useEffect(() => { fetchAlignments(); }, []);
  const toggle = (mat: string) => { const n = new Set(selected); n.has(mat) ? n.delete(mat) : n.add(mat); setSelected(n); };
  const toggleAll = () => setSelected(selected.size === agents.length && agents.length > 0 ? new Set() : new Set(agents.map((a: any) => a.matricule)));
  const alignSelection = async () => {
    if (selected.size === 0) return;
    setProcessing(true);
    try {
      await axios.post('/api/admin/rh/align-to-ad', { matricules: Array.from(selected) }, { headers });
      alert(selected.size + ' agent(s) align\u00e9(s) avec succ\u00e8s.');
      setSelected(new Set()); fetchAlignments();
    } catch { alert('Erreur lors de l\\'alignement.'); }
    finally { setProcessing(false); }
  };
  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spin" size={32} style={{ margin: '0 auto' }} /></div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Alignements AD manquants</h1>
        {selected.size > 0 && (
          <button onClick={alignSelection} disabled={processing} style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', borderRadius: '8px', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
            {processing ? 'En cours...' : 'Aligner ' + selected.size + ' agent(s)'}
          </button>
        )}
      </div>
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
        {agents.length === 0 ? <p style={{ color: '#64748b' }}>Aucun agent à aligner — tout est synchronisé ✓</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '12px', width: '40px' }}><input type="checkbox" checked={selected.size === agents.length && agents.length > 0} onChange={toggleAll} style={{ accentColor: '#3b82f6', width: '16px', height: '16px' }} /></th>
                <th style={{ padding: '12px' }}>Agent</th>
                <th style={{ padding: '12px' }}>Service</th>
                <th style={{ padding: '12px' }}>Statut AD</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a: any) => (
                <tr key={a.matricule} style={{ borderBottom: '1px solid #f1f5f9', background: selected.has(a.matricule) ? '#eff6ff' : 'transparent' }}>
                  <td style={{ padding: '12px' }}><input type="checkbox" checked={selected.has(a.matricule)} onChange={() => toggle(a.matricule)} style={{ accentColor: '#3b82f6', width: '16px', height: '16px' }} /></td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => loadAgentDetails(a)}>
                      <AgentAvatar agent={a} />
                      <div><div style={{ fontWeight: 700, color: '#0f172a' }}>{a.nom} {a.prenom}</div><div style={{ color: '#64748b', fontSize: '11px' }}>{a.POSTE_L}</div></div>
                    </div>
                  </td>
                  <td style={{ padding: '12px', color: '#64748b' }}>{a.SERVICE_L || a.DIRECTION_L || '\u2014'}</td>
                  <td style={{ padding: '12px' }}><span style={{ color: '#f97316', fontWeight: 600, fontSize: '12px' }}>Non li\u00e9 AD</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};`,
`const AlignmentsView = ({ headers, loadAgentDetails }: any) => {
  const [agents, setAgents] = React.useState<any[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [processing, setProcessing] = React.useState(false);
  const [mappings, setMappings] = React.useState<{rhField: string; adField: string}[]>([]);

  const fetchAlignments = React.useCallback(() => {
    setLoading(true);
    // First get mappings, then get agents with mismatched fields
    axios.get('/api/admin/rh/align-mappings', { headers })
      .then(res => {
        const d = res.data;
        const maps = Array.isArray(d) ? d : (Array.isArray(d?.mappings) ? d.mappings : []);
        const validMaps = maps.filter((m: any) => m.rhField && m.adField);
        setMappings(validMaps);
        return axios.get('/api/admin/rh/alignments', { headers, params: { mappings: JSON.stringify(validMaps) } });
      })
      .then(res => setAgents(res.data || []))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, [headers]);

  React.useEffect(() => { fetchAlignments(); }, [fetchAlignments]);

  const toggle = (mat: string) => { const n = new Set(selected); n.has(mat) ? n.delete(mat) : n.add(mat); setSelected(n); };
  const toggleAll = () => setSelected(selected.size === agents.length && agents.length > 0 ? new Set() : new Set(agents.map((a: any) => a.matricule)));
  
  const alignSelection = async () => {
    if (selected.size === 0) return;
    setProcessing(true);
    try {
      await axios.post('/api/admin/rh/align-to-ad', { matricules: Array.from(selected), mappings }, { headers });
      alert(selected.size + ' agent(s) align\u00e9(s) avec succ\u00e8s. Les champs RH ont \u00e9t\u00e9 \u00e9crits dans l\u2019AD.');
      setSelected(new Set()); fetchAlignments();
    } catch (err: any) { alert('Erreur : ' + (err?.response?.data?.message || 'alignement \u00e9chou\u00e9')); }
    finally { setProcessing(false); }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spin" size={32} style={{ margin: '0 auto' }} /></div>;
  
  if (mappings.length === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Alignements</h1>
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #fde68a', padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#92400e', fontWeight: 600 }}>\u26a0\ufe0f Aucun champ d\u2019alignement configur\u00e9.</div>
        <div style={{ color: '#64748b', marginTop: '8px', fontSize: '13px' }}>Allez dans Param\u00e8tres pour configurer les couples de champs RH \u2192 AD.</div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Alignements AD</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>
            Agents dont les champs RH ne correspondent pas aux champs AD configur\u00e9s ({mappings.map(m => m.rhField + '\u2192' + m.adField).join(', ')})
          </p>
        </div>
        <button
          onClick={alignSelection}
          disabled={processing || selected.size === 0}
          style={{ padding: '10px 20px', background: selected.size === 0 ? '#e2e8f0' : '#3b82f6', color: selected.size === 0 ? '#94a3b8' : 'white', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: selected.size === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <RefreshCw size={16} className={processing ? 'spin' : ''} />
          {processing ? 'Alignement en cours...' : selected.size > 0 ? 'Aligner ' + selected.size + ' agent(s)' : 'S\u00e9lectionner des agents'}
        </button>
      </div>

      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {agents.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#059669', fontWeight: 600 }}>
            <CheckCircle2 size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <p>Tous les agents sont align\u00e9s avec l\u2019AD \u2713</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 16px', width: '44px' }}>
                  <input type="checkbox" checked={selected.size === agents.length && agents.length > 0} onChange={toggleAll} style={{ accentColor: '#3b82f6', width: '16px', height: '16px' }} />
                </th>
                <th style={{ padding: '12px 16px' }}>Agent</th>
                <th style={{ padding: '12px 16px' }}>Service</th>
                {mappings.map(m => (
                  <th key={m.rhField + m.adField} style={{ padding: '12px 16px' }}>RH: {m.rhField} / AD: {m.adField}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map((a: any) => (
                <tr key={a.matricule} style={{ borderBottom: '1px solid #f1f5f9', background: selected.has(a.matricule) ? '#eff6ff' : 'transparent' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <input type="checkbox" checked={selected.has(a.matricule)} onChange={() => toggle(a.matricule)} style={{ accentColor: '#3b82f6', width: '16px', height: '16px' }} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => loadAgentDetails(a)}>
                      <AgentAvatar agent={a} />
                      <div>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{a.nom} {a.prenom}</div>
                        <div style={{ color: '#64748b', fontSize: '11px' }}>{a.POSTE_L}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{a.SERVICE_L || a.DIRECTION_L || '\u2014'}</td>
                  {mappings.map(m => {
                    const rhVal = a[m.rhField] || '\u2014';
                    const adVal = a['ad_' + m.adField] || a[m.adField] || '\u2014';
                    const mismatch = rhVal !== adVal;
                    return (
                      <td key={m.rhField + m.adField} style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: '12px' }}>
                          <span style={{ color: '#059669' }}>{rhVal}</span>
                          {mismatch && <><span style={{ color: '#94a3b8', margin: '0 4px' }}>\u2260</span><span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{adVal}</span></>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};`
);

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SettingsViewStudio — fetch Mourad Badoud as example agent
// ═══════════════════════════════════════════════════════════════════════════════
replaceExact(
`    axios.get('/api/admin/rh/agents', { headers, params: { limit: 1 } }).then(res => {
      const ag = Array.isArray(res.data?.agents) ? res.data.agents[0] : (Array.isArray(res.data) ? res.data[0] : null);
      if (ag) setExampleAgent(ag);
    }).catch(() => {});`,
`    axios.get('/api/admin/rh/agents', { headers, params: { q: 'BADOUD', limit: 5 } }).then(res => {
      const list = Array.isArray(res.data?.agents) ? res.data.agents : (Array.isArray(res.data) ? res.data : []);
      const mourad = list.find((a: any) => (a.nom || '').toUpperCase().includes('BADOUD'));
      const ag = mourad || list[0] || null;
      if (ag) setExampleAgent(ag);
    }).catch(() => {});`
);

// Fix the settings mapping display to show both RH and AD values side by side
replaceExact(
`                  {rhKeys.map(k => <option key={k} value={k}>{k}{exampleAgent?.[k] ? ' (' + exampleAgent[k] + ')' : ''}</option>)}`,
`                  {rhKeys.map(k => <option key={k} value={k}>{k}{exampleAgent?.[k] ? ' \u2014 ' + String(exampleAgent[k]).substring(0, 30) : ''}</option>)}`
);

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Menu rename: Utilisateurs → Agents, default limit 10
// ═══════════════════════════════════════════════════════════════════════════════
replaceExact(
`    { id: 'users', title: "Utilisateurs", icon: Users },`,
`    { id: 'users', title: "Agents", icon: Users },`
);

replaceExact(
`  const [limit, setLimit] = useState(50);`,
`  const [limit, setLimit] = useState(10);`
);

// Remove departure date column — replace header
replaceExact(
`                         <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>Départ/Arrivée</th>`,
`                         <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>Statut</th>`
);

// Replace the departure date cell content 
replaceExact(
`                              <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                                {agent.DATE_DEPART ? (
                                  <div style={{ color: new Date(agent.DATE_DEPART) <= new Date() ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>
                                     Départ: {formatDateFr(agent.DATE_DEPART)}
                                  </div>
                                ) : (agent.DATE_ARRIVEE && agent.DATE_ARRIVEE !== '' && new Date(agent.DATE_ARRIVEE) > new Date()) ? (
                                  <div style={{ color: '#3b82f6', fontWeight: 600 }}>
                                     Arrivée: {formatDateFr(agent.DATE_ARRIVEE)}
                                  </div>
                                ) : '-'}
                              </td>`,
`                              <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                                {(() => {
                                  const now = new Date();
                                  const dep = agent.DATE_DEPART ? new Date(agent.DATE_DEPART) : null;
                                  const arr = agent.DATE_ARRIVEE ? new Date(agent.DATE_ARRIVEE) : null;
                                  if (dep && dep <= now) return <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '11px', padding: '2px 6px', background: '#fef2f2', borderRadius: '4px' }}>Parti</span>;
                                  if (arr && arr > now) return <span style={{ color: '#3b82f6', fontWeight: 600, fontSize: '11px', padding: '2px 6px', background: '#eff6ff', borderRadius: '4px' }}>Prochaine arrivée</span>;
                                  if (arr && (now.getTime() - arr.getTime()) < 30 * 24 * 3600 * 1000) return <span style={{ color: '#059669', fontWeight: 700, fontSize: '11px', padding: '2px 6px', background: '#ecfdf5', borderRadius: '4px' }}>Nouveau</span>;
                                  return <span style={{ color: '#059669', fontWeight: 600, fontSize: '11px', padding: '2px 6px', background: '#ecfdf5', borderRadius: '4px' }}>Actif</span>;
                                })()}
                              </td>`
);

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Agent table — better avatar using AgentAvatar component
// ═══════════════════════════════════════════════════════════════════════════════
replaceExact(
`                                  <div style={{ 
                                    width: '40px', 
                                    height: '40px', 
                                    background: '#f1f5f9', 
                                    borderRadius: '10px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    fontWeight: 700, 
                                    color: '#64748b', 
                                    fontSize: '14px',
                                    position: 'relative',
                                    border: (agent.DATE_ARRIVEE && agent.DATE_ARRIVEE !== '' && new Date(agent.DATE_ARRIVEE) > new Date()) ? '2px dashed #3b82f6' : 'none',
                                    textDecoration: (agent.DATE_DEPART && agent.DATE_DEPART !== '' && new Date(agent.DATE_DEPART) <= new Date()) ? 'line-through' : 'none'
                                  }}>
                                    {agent.prenom?.[0]}{agent.nom?.[0]}
                                  </div>`,
`                                  <AgentAvatar agent={agent} onClick={() => loadAgentDetails(agent)} />`
);

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Fix the breadcrumb for new views
// ═══════════════════════════════════════════════════════════════════════════════
replaceExact(
`                {currentView === 'users' ? 'Liste des utilisateurs' : 
                 currentView === 'dashboard' ? 'Tableau de bord' :
                 currentView === 'encadrants' ? 'Encadrants' :
                 currentView === 'settings' ? 'Paramètres' : 'Logs de synchronisation'}`,
`                {currentView === 'users' ? 'Agents' : 
                 currentView === 'dashboard' ? 'Tableau de bord' :
                 currentView === 'encadrants' ? 'Encadrants' :
                 currentView === 'onboarding' ? 'Onboarding' :
                 currentView === 'services' ? 'Services & Directions' :
                 currentView === 'alignments' ? 'Alignements' :
                 currentView === 'settings' ? 'Paramètres' : 'Logs de synchronisation'}`
);

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Update the "Utilisateurs" title in the view
// ═══════════════════════════════════════════════════════════════════════════════
replaceExact(
`                    <h1 className="content-title" style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Liste des utilisateurs</h1>`,
`                    <h1 className="content-title" style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Liste des agents</h1>`
);

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Fix license display: show short type (E3, E1, F3...) 
// ═══════════════════════════════════════════════════════════════════════════════
replaceExact(
`                                          {agent.azure_license.includes('E5') ? 'E5' : 
                                           agent.azure_license.includes('E3') ? 'E3' : 
                                           agent.azure_license.includes('PREMIUM') ? 'BP' : 
                                           agent.azure_license.includes('STANDARD') ? 'BS' : 
                                           agent.azure_license.split('_').pop()}`,
`                                          {(() => {
                                            const l = agent.azure_license;
                                            if (l.includes('E5')) return 'E5';
                                            if (l.includes('E3')) return 'E3';
                                            if (l.includes('E1')) return 'E1';
                                            if (l.includes('F3')) return 'F3';
                                            if (l.includes('F1')) return 'F1';
                                            if (l.includes('BUSINESS_PREMIUM')) return 'BP';
                                            if (l.includes('BUSINESS_STANDARD')) return 'BS';
                                            if (l.includes('BUSINESS_BASIC')) return 'BB';
                                            return l.split('_').slice(0, 2).join('_');
                                          })()}`
);

fs.writeFileSync('src/pages/StudioRH.tsx', content);
console.log('\n✅ All fixes applied successfully!');
