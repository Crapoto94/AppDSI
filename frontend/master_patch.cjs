// master_patch.cjs - solution définitive
const fs = require('fs');
let c = fs.readFileSync('src/pages/StudioRH.tsx', 'utf8');

// On détecte si les composants sont déjà là
const alreadyPatched = c.includes('const AgentAvatar = ({ agent, onClick }');
console.log('Already patched (AgentAvatar+onClick):', alreadyPatched);

// ─── PARTIE 1 : Insérer les composants avant const StudioRH ──────────────────
const INSERTION_MARKER = 'const StudioRH: React.FC = () => {';
const insertIdx = c.indexOf(INSERTION_MARKER);
if (insertIdx === -1) { console.error('Cannot find StudioRH component'); process.exit(1); }

// Remove existing components if they exist (from previous runs)
const oldComponentsRegex = /\n\/\/ ─+ AgentAvatar ─+[\s\S]*?(?=\nconst StudioRH)/;
c = c.replace(oldComponentsRegex, '\n');

const insertIdx2 = c.indexOf(INSERTION_MARKER);

const COMPONENTS = `// ══════════════ AgentAvatar ══════════════
const ENCADRANT_COLORS_MAP: Record<string, string> = {
  dg: '#7c3aed', dir: '#1d4ed8', service: '#0369a1', secteur: '#0f766e',
};
const AgentAvatar = ({ agent, onClick }: { agent: any; onClick?: () => void }) => {
  const now = new Date();
  const lvl = agent?.management_level;
  const bg = lvl && ENCADRANT_COLORS_MAP[lvl] ? ENCADRANT_COLORS_MAP[lvl] + '22' : '#e2e8f0';
  const color = lvl && ENCADRANT_COLORS_MAP[lvl] ? ENCADRANT_COLORS_MAP[lvl] : '#64748b';
  const arrivalDate = agent?.DATE_ARRIVEE ? new Date(agent.DATE_ARRIVEE) : null;
  const departDate = agent?.DATE_DEPART ? new Date(agent.DATE_DEPART) : null;
  const isDepart = !!(departDate && departDate <= now);
  const isFuture = !!(arrivalDate && arrivalDate > now);
  const isNew = !isDepart && !isFuture && !!(arrivalDate && (now.getTime() - arrivalDate.getTime()) < 30 * 24 * 3600 * 1000);
  const isInactive = !isDepart && !isFuture && agent?.is_active === false;
  let border = 'none';
  if (isDepart) border = '2px dashed #ef4444';
  else if (isFuture) border = '2px dashed #3b82f6';
  else if (isInactive) border = '2px dashed #94a3b8';
  return (
    <div style={{ position: 'relative', width: '40px', height: '40px', flexShrink: 0, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', border, overflow: 'hidden', position: 'relative' }}>
        {agent?.nom?.charAt(0)}{agent?.prenom?.charAt(0)}
        {isDepart && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(to bottom right, transparent calc(50% - 1px), #ef444466 50%, transparent calc(50% + 1px))', pointerEvents: 'none' }} />}
      </div>
      {isNew && <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#059669', color: 'white', fontSize: '8px', fontWeight: 800, padding: '1px 4px', borderRadius: '4px', lineHeight: '1.4' }}>NOUV</span>}
      {isFuture && <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#3b82f6', color: 'white', fontSize: '8px', fontWeight: 800, padding: '1px 4px', borderRadius: '4px', lineHeight: '1.4' }}>PROCH</span>}
    </div>
  );
};

// ══════════════ OnboardingView ══════════════
const OnboardingView = ({ headers, loadAgentDetails }: any) => {
  const [loading, setLoading] = React.useState(true);
  const [nonCommence, setNonCommence] = React.useState<any[]>([]);
  const [enCours, setEnCours] = React.useState<any[]>([]);
  const [termine, setTermine] = React.useState<any[]>([]);
  React.useEffect(() => {
    axios.get('/api/admin/rh/agents', { headers, params: { limit: 500 } }).then(res => {
      const ag = Array.isArray(res.data?.agents) ? res.data.agents : (Array.isArray(res.data) ? res.data : []);
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 3600 * 1000);
      setNonCommence(ag.filter((a: any) => a.DATE_ARRIVEE && new Date(a.DATE_ARRIVEE) > now));
      setEnCours(ag.filter((a: any) => { const d = a.DATE_ARRIVEE ? new Date(a.DATE_ARRIVEE) : null; return d && d <= now && d >= thirtyDaysAgo; }));
      setTermine(ag.filter((a: any) => { const d = a.DATE_ARRIVEE ? new Date(a.DATE_ARRIVEE) : null; return d && d < thirtyDaysAgo && d >= sixtyDaysAgo; }));
    }).finally(() => setLoading(false));
  }, []);
  const AgentRow = ({ a }: { a: any }) => (
    <tr style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => loadAgentDetails(a)}>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AgentAvatar agent={a} onClick={() => loadAgentDetails(a)} />
          <div><div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>{a.nom} {a.prenom}</div><div style={{ color: '#64748b', fontSize: '11px' }}>{a.POSTE_L}</div></div>
        </div>
      </td>
      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#059669', fontSize: '13px' }}>{a.DATE_ARRIVEE ? new Date(a.DATE_ARRIVEE).toLocaleDateString('fr-FR') : '-'}</td>
      <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '13px' }}>{a.SERVICE_L || a.DIRECTION_L || '\u2014'}</td>
    </tr>
  );
  const Section = ({ title, color, bg, agents }: any) => agents.length === 0 ? null : (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', background: bg, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontWeight: 700, fontSize: '14px', color }}>{title}</span>
        <span style={{ background: color + '22', color, borderRadius: '99px', padding: '2px 8px', fontSize: '12px', fontWeight: 700 }}>{agents.length}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: '#f8fafc', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' as const }}>
          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Agent</th>
          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Date arriv\u00e9e</th>
          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Service</th>
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
      <Section title="Non commenc\u00e9 (arriv\u00e9e prochaine)" color="#3b82f6" bg="#eff6ff" agents={nonCommence} />
      <Section title="En cours (arriv\u00e9 il y a moins de 30 jours)" color="#059669" bg="#ecfdf5" agents={enCours} />
      <Section title="Termin\u00e9 (arriv\u00e9 il y a 30 \u00e0 60 jours)" color="#64748b" bg="#f8fafc" agents={termine} />
    </div>
  );
};

// ══════════════ ServicesView ══════════════
const ServicesView = ({ headers, loadAgentDetails }: any) => {
  const [dirData, setDirData] = React.useState<any>({});
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    axios.get('/api/admin/rh/agents', { headers, params: { limit: 2000 } }).then(res => {
      const ag = Array.isArray(res.data?.agents) ? res.data.agents : (Array.isArray(res.data) ? res.data : []);
      const dirs: any = {};
      ag.forEach((agent: any) => {
        const dir = agent.DIRECTION_L || 'Non affect\u00e9';
        const svc = agent.SERVICE_L || dir;
        if (!dirs[dir]) dirs[dir] = {};
        if (!dirs[dir][svc]) dirs[dir][svc] = [];
        dirs[dir][svc].push(agent);
      });
      setDirData(dirs);
      const firstDir = Object.keys(dirs)[0];
      if (firstDir) setExpanded({ [firstDir]: true });
    }).finally(() => setLoading(false));
  }, []);
  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spin" size={32} style={{ margin: '0 auto' }} /></div>;
  const directions = Object.entries(dirData).sort((a: any, b: any) => {
    const ca = Object.values(a[1] as any).reduce((s: any, v: any) => s + v.length, 0) as number;
    const cb = Object.values(b[1] as any).reduce((s: any, v: any) => s + v.length, 0) as number;
    return cb - ca;
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Services &amp; Directions</h1>
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
                        <div key={a.matricule} title={a.nom + ' ' + a.prenom + (a.POSTE_L ? ' \u2014 ' + a.POSTE_L : '')} onClick={() => loadAgentDetails(a)}>
                          <AgentAvatar agent={a} onClick={() => loadAgentDetails(a)} />
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
};

// ══════════════ AlignmentsView ══════════════
const AlignmentsView = ({ headers, loadAgentDetails }: any) => {
  const [agents, setAgents] = React.useState<any[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [processing, setProcessing] = React.useState(false);
  const [mappings, setMappings] = React.useState<{rhField: string; adField: string}[]>([]);
  const fetchAlignments = React.useCallback(() => {
    setLoading(true);
    axios.get('/api/admin/rh/align-mappings', { headers })
      .then(res => {
        const d = res.data;
        const maps = Array.isArray(d) ? d : (Array.isArray(d?.mappings) ? d.mappings : []);
        const validMaps = maps.filter((m: any) => m.rhField && m.adField);
        setMappings(validMaps);
        return axios.get('/api/admin/rh/alignments', { headers });
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
      alert(selected.size + ' agent(s) align\u00e9(s). Les champs RH ont \u00e9t\u00e9 \u00e9crits dans l\u2019AD.');
      setSelected(new Set()); fetchAlignments();
    } catch (err: any) { alert('Erreur : ' + (err?.response?.data?.message || '\u00e9chec alignement')); }
    finally { setProcessing(false); }
  };
  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spin" size={32} style={{ margin: '0 auto' }} /></div>;
  if (mappings.length === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Alignements</h1>
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #fde68a', padding: '32px', textAlign: 'center' }}>
        <div style={{ color: '#92400e', fontWeight: 600, marginBottom: '8px' }}>\u26a0\ufe0f Aucun champ d\u2019alignement configur\u00e9.</div>
        <div style={{ color: '#64748b', fontSize: '13px' }}>Allez dans Param\u00e8tres pour configurer les couples de champs RH \u2192 AD.</div>
      </div>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Alignements AD</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>Champs configur\u00e9s : {mappings.map(m => m.rhField + '\u2192' + m.adField).join(', ')}</p>
        </div>
        <button onClick={alignSelection} disabled={processing || selected.size === 0}
          style={{ padding: '10px 20px', background: selected.size === 0 ? '#e2e8f0' : '#3b82f6', color: selected.size === 0 ? '#94a3b8' : 'white', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: selected.size === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <RefreshCw size={16} className={processing ? 'spin' : ''} />
          {processing ? 'En cours...' : selected.size > 0 ? 'Aligner les agents (' + selected.size + ')' : 'S\u00e9lectionner des agents'}
        </button>
      </div>
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {agents.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#059669', fontWeight: 600 }}>
            <CheckCircle2 size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <p>Tous les agents sont align\u00e9s \u2713</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 16px', width: '44px' }}><input type="checkbox" checked={selected.size === agents.length && agents.length > 0} onChange={toggleAll} style={{ accentColor: '#3b82f6', width: '16px', height: '16px' }} /></th>
                <th style={{ padding: '12px 16px' }}>Agent</th>
                <th style={{ padding: '12px 16px' }}>Service / Direction</th>
                {mappings.map(m => <th key={m.rhField} style={{ padding: '12px 16px' }}>{m.rhField} \u2192 {m.adField}</th>)}
              </tr>
            </thead>
            <tbody>
              {agents.map((a: any) => (
                <tr key={a.matricule} style={{ borderBottom: '1px solid #f1f5f9', background: selected.has(a.matricule) ? '#eff6ff' : 'transparent' }}>
                  <td style={{ padding: '12px 16px' }}><input type="checkbox" checked={selected.has(a.matricule)} onChange={() => toggle(a.matricule)} style={{ accentColor: '#3b82f6', width: '16px', height: '16px' }} /></td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => loadAgentDetails(a)}>
                      <AgentAvatar agent={a} onClick={() => loadAgentDetails(a)} />
                      <div><div style={{ fontWeight: 700, color: '#0f172a' }}>{a.nom} {a.prenom}</div><div style={{ color: '#64748b', fontSize: '11px' }}>{a.POSTE_L}</div></div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{a.SERVICE_L || a.DIRECTION_L || '\u2014'}</td>
                  {mappings.map(m => {
                    const rhVal = a[m.rhField] !== undefined ? String(a[m.rhField]) : '\u2014';
                    const adVal = a['ad_' + m.adField] !== undefined ? String(a['ad_' + m.adField]) : (a[m.adField] !== undefined ? String(a[m.adField]) : '\u2014');
                    const mismatch = rhVal !== adVal && rhVal !== '\u2014';
                    return (
                      <td key={m.rhField} style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ color: '#059669', fontWeight: 600 }}>RH: {rhVal}</span>
                          {mismatch && <span style={{ color: '#ef4444', fontSize: '11px' }}>AD: {adVal}</span>}
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
};

// ══════════════ SettingsViewStudio ══════════════
const SettingsViewStudio = ({ headers, activePositions, fetchAvailablePositions, setShowActivePositionsModal }: any) => {
  const [mappings, setMappings] = React.useState<{rhField: string; adField: string}[]>([]);
  const [exampleAgent, setExampleAgent] = React.useState<any>(null);
  const [saving, setSaving] = React.useState(false);
  const adFieldsList = ['sAMAccountName', 'givenName', 'sn', 'displayName', 'mail', 'userPrincipalName', 'employeeID', 'department', 'company', 'title', 'physicalDeliveryOfficeName', 'telephoneNumber', 'mobile', 'description'];
  React.useEffect(() => {
    axios.get('/api/admin/rh/align-mappings', { headers }).then(res => {
      const d = res.data;
      setMappings(Array.isArray(d) ? d : (Array.isArray(d?.mappings) ? d.mappings : []));
    }).catch(() => {});
    axios.get('/api/admin/rh/agents', { headers, params: { q: 'BADOUD', limit: 5 } }).then(res => {
      const list = Array.isArray(res.data?.agents) ? res.data.agents : (Array.isArray(res.data) ? res.data : []);
      const mourad = list.find((a: any) => (a.nom || '').toUpperCase().includes('BADOUD'));
      const ag = mourad || list[0] || null;
      if (ag) setExampleAgent(ag);
    }).catch(() => {});
  }, []);
  const rhKeys = exampleAgent
    ? Object.keys(exampleAgent).filter(k => exampleAgent[k] !== null && exampleAgent[k] !== undefined && String(exampleAgent[k]).length > 0 && typeof exampleAgent[k] !== 'object')
    : [];
  const addMapping = () => setMappings([...mappings, { rhField: '', adField: '' }]);
  const removeMapping = (i: number) => setMappings(mappings.filter((_, idx) => idx !== i));
  const updateMapping = (i: number, field: 'rhField' | 'adField', value: string) => { const n = [...mappings]; n[i][field] = value; setMappings(n); };
  const saveMappings = async () => {
    setSaving(true);
    try {
      await axios.post('/api/admin/rh/align-mappings', { mappings: mappings.filter(m => m.rhField && m.adField) }, { headers });
      alert('Param\u00e9trage sauvegard\u00e9');
    } catch { alert('Erreur de sauvegarde'); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Param\u00e8tres du Studio</h1>
      {exampleAgent && <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Exemple de valeurs : agent {exampleAgent.nom} {exampleAgent.prenom}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', background: '#eff6ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}><Sliders size={20} /></div>
            <div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Champs d\u2019alignement RH \u2192 AD</h3><p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Associez les champs Oracle RH aux attributs Active Directory.</p></div>
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {mappings.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select value={m.rhField} onChange={e => updateMapping(i, 'rhField', e.target.value)} style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', maxWidth: '200px' }}>
                  <option value="">Champ RH Oracle</option>
                  {rhKeys.map(k => <option key={k} value={k}>{k}{exampleAgent?.[k] != null ? ' \u2014 ' + String(exampleAgent[k]).substring(0, 25) : ''}</option>)}
                </select>
                <span style={{ color: '#3b82f6', fontSize: '18px', fontWeight: 700 }}>\u2192</span>
                <select value={m.adField} onChange={e => updateMapping(i, 'adField', e.target.value)} style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', maxWidth: '200px' }}>
                  <option value="">Attribut AD</option>
                  {adFieldsList.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <button onClick={() => removeMapping(i)} style={{ background: 'white', border: '1px solid #e2e8f0', color: '#ef4444', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex' }}><X size={14} /></button>
              </div>
            ))}
            {mappings.length > 0 && (
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', borderLeft: '3px solid #3b82f6' }}>
                <strong>Pr\u00e9visualisation (agent: {exampleAgent?.nom} {exampleAgent?.prenom}) :</strong>
                {mappings.filter(m => m.rhField && m.adField && exampleAgent?.[m.rhField]).map(m => (
                  <div key={m.rhField} style={{ marginTop: '4px', color: '#475569' }}>
                    <span style={{ color: '#059669', fontFamily: 'monospace' }}>{m.rhField}</span> = <strong>{String(exampleAgent?.[m.rhField])}</strong> <span style={{ color: '#94a3b8' }}>\u2192</span> <span style={{ color: '#3b82f6', fontFamily: 'monospace' }}>{m.adField}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <button onClick={addMapping} style={{ fontSize: '13px', color: '#3b82f6', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>+ Ajouter un couple</button>
              <button onClick={saveMappings} disabled={saving} style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', background: '#ecfdf5', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}><CheckCircle2 size={20} /></div>
            <div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>D\u00e9finition des agents actifs</h3><p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Configurez les positions RH consid\u00e9r\u00e9es comme activit\u00e9s r\u00e9elles.</p></div>
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
            <div style={{ fontSize: '13px', color: '#0f172a', marginBottom: '12px' }}>
              {activePositions && activePositions.length > 0 ? <span><b>{activePositions.length}</b> positions s\u00e9lectionn\u00e9es comme actives.</span> : <span style={{ color: '#ef4444' }}><b>Aucune position s\u00e9lectionn\u00e9e.</b> Tous les agents non-partis sont affich\u00e9s par d\u00e9faut.</span>}
            </div>
            <button onClick={() => { if (fetchAvailablePositions) fetchAvailablePositions(); if (setShowActivePositionsModal) setShowActivePositionsModal(true); }} style={{ width: '100%', padding: '10px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <SettingsIcon size={16} />G\u00e9rer les positions actives
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

`;

c = c.substring(0, insertIdx2) + COMPONENTS + c.substring(insertIdx2);
console.log('Components inserted');

// ─── PARTIE 2 : Extend currentView type ────────────────────────────────────
c = c.replace(
  "useState<'dashboard' | 'users' | 'encadrants' | 'settings' | 'logs'>",
  "useState<'dashboard' | 'users' | 'encadrants' | 'onboarding' | 'services' | 'alignments' | 'settings' | 'logs'>"
);
console.log('currentView extended');

// ─── PARTIE 3 : menuItems ────────────────────────────────────────────────────
c = c.replace(
  `    { id: 'users', title: "Utilisateurs", icon: Users },\r\n    { id: 'encadrants', title: "Encadrants", icon: Sliders },\r\n    { id: 'settings', title: "Param`,
  `    { id: 'users', title: "Agents", icon: Users },\r\n    { id: 'encadrants', title: "Encadrants", icon: Sliders },\r\n    { id: 'onboarding', title: "Onboarding", icon: UserPlus },\r\n    { id: 'services', title: "Services & Directions", icon: Database },\r\n    { id: 'alignments', title: "Alignements", icon: ShieldCheck },\r\n    { id: 'settings', title: "Param`
);
console.log('menuItems updated');

// ─── PARTIE 4 : default limit 50→10 ─────────────────────────────────────────
c = c.replace('const [limit, setLimit] = useState(50);', 'const [limit, setLimit] = useState(10);');
console.log('limit=10');

// ─── PARTIE 5 : Rename headers ───────────────────────────────────────────────
c = c.replace('>Liste des utilisateurs<', '>Liste des agents<');
c = c.replace('>Utilisateur<', '>Agent<');
console.log('headers renamed');

// ─── PARTIE 6 : Breadcrumb ──────────────────────────────────────────────────
c = c.replace(
  "'users' ? 'Liste des utilisateurs' : \r\n                 currentView === 'dashboard'",
  "'users' ? 'Agents' : \r\n                 currentView === 'onboarding' ? 'Onboarding' :\r\n                 currentView === 'services' ? 'Services & Directions' :\r\n                 currentView === 'alignments' ? 'Alignements' :\r\n                 currentView === 'dashboard'"
);
console.log('breadcrumb updated');

// ─── PARTIE 7 : Render des nouvelles vues ───────────────────────────────────
// On remplace le bloc settings inline par les 4 nouvelles vues + SettingsViewStudio
const settingsBlockStart = "{currentView === 'settings' && (";
const logsBlockStart = "{currentView === 'logs' && (";
const si = c.indexOf(settingsBlockStart);
const li = c.indexOf(logsBlockStart);
if (si !== -1 && li !== -1 && li > si) {
  const newBlock = `            {currentView === 'onboarding' && <OnboardingView headers={headers} loadAgentDetails={loadAgentDetails} />}
            {currentView === 'services' && <ServicesView headers={headers} loadAgentDetails={loadAgentDetails} />}
            {currentView === 'alignments' && <AlignmentsView headers={headers} loadAgentDetails={loadAgentDetails} />}
            {currentView === 'settings' && <SettingsViewStudio headers={headers} activePositions={activePositions} fetchAvailablePositions={fetchAvailablePositions} setShowActivePositionsModal={setShowActivePositionsModal} />}

            `;
  c = c.substring(0, si) + newBlock + c.substring(li);
  console.log('Views render updated');
} else {
  console.error('Cannot find settings/logs blocks si=' + si + ' li=' + li);
}

// ─── PARTIE 8 : Status cell replacing departure date ─────────────────────────
// Find the depot date cell via unique fragment (CRLF-aware)
const depMarker = 'D\u00e9part: {formatDateFr(agent.DATE_DEPART)}';
const depIdx = c.indexOf(depMarker);
if (depIdx !== -1) {
  // Go back to find the opening <td
  const tdStart = c.lastIndexOf('<td ', depIdx);
  // Go forward to find </td>
  const tdEnd = c.indexOf('</td>', depIdx) + 5;
  const newStatusCell = `<td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                                {(() => {
                                  const now2 = new Date();
                                  const dep2 = agent.DATE_DEPART ? new Date(agent.DATE_DEPART) : null;
                                  const arr2 = agent.DATE_ARRIVEE ? new Date(agent.DATE_ARRIVEE) : null;
                                  if (dep2 && dep2 <= now2) return <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '11px', padding: '2px 6px', background: '#fef2f2', borderRadius: '4px' }}>Parti</span>;
                                  if (arr2 && arr2 > now2) return <span style={{ color: '#3b82f6', fontWeight: 600, fontSize: '11px', padding: '2px 6px', background: '#eff6ff', borderRadius: '4px' }}>Prochaine arriv\u00e9e</span>;
                                  if (arr2 && (now2.getTime() - arr2.getTime()) < 30 * 24 * 3600 * 1000) return <span style={{ color: '#059669', fontWeight: 700, fontSize: '11px', padding: '2px 6px', background: '#ecfdf5', borderRadius: '4px' }}>Nouveau</span>;
                                  return <span style={{ color: '#059669', fontWeight: 600, fontSize: '11px', padding: '2px 6px', background: '#ecfdf5', borderRadius: '4px' }}>Actif</span>;
                                })()}
                              </td>`;
  c = c.substring(0, tdStart) + newStatusCell + c.substring(tdEnd);
  console.log('Status cell updated');
} else {
  console.log('Departure marker not found (already updated?)');
}

// ─── PARTIE 9 : Avatar in agent table ────────────────────────────────────────
const oldAvatarDiv = "width: '40px', \r\n                                    height: '40px', \r\n                                    background: '#f1f5f9'";
const oldAvatarDivLF = "width: '40px', \n                                    height: '40px', \n                                    background: '#f1f5f9'";
let avIdx = c.indexOf(oldAvatarDiv);
if (avIdx === -1) avIdx = c.indexOf(oldAvatarDivLF);
if (avIdx !== -1) {
  const divOpen = c.lastIndexOf('<div style={{', avIdx);
  // Find the </div> for the agent name section (the div right after avatar)
  // The avatar div ends before the name div. Find it by closing depth.
  let depth = 1, pos = c.indexOf('>', divOpen) + 1;
  while (depth > 0 && pos < c.length) {
    const no = c.indexOf('<div', pos);
    const nc = c.indexOf('</div>', pos);
    if (no !== -1 && no < nc) { depth++; pos = no + 4; }
    else if (nc !== -1) { depth--; if (depth === 0) { pos = nc + 6; break; } else pos = nc + 6; }
    else break;
  }
  c = c.substring(0, divOpen) + '<AgentAvatar agent={agent} onClick={() => loadAgentDetails(agent)} />' + c.substring(pos);
  console.log('Agent table avatar replaced');
} else {
  console.log('Avatar div not found (already replaced?)');
}

// ─── PARTIE 10 : License display ────────────────────────────────────────────
const licPattern = /agent\.azure_license\.includes\('E5'\) \? 'E5' :[\s\n\r]+agent\.azure_license\.includes\('E3'\) \? 'E3' :[\s\n\r]+agent\.azure_license\.includes\('PREMIUM'\) \? 'BP' :[\s\n\r]+agent\.azure_license\.includes\('STANDARD'\) \? 'BS' :[\s\n\r]+agent\.azure_license\.split\('_'\)\.pop\(\)/;
const licReplace = `(() => {
                                            const l = agent.azure_license;
                                            if (l.includes('E5')) return 'E5';
                                            if (l.includes('E3')) return 'E3';
                                            if (l.includes('E1')) return 'E1';
                                            if (l.includes('F3')) return 'F3';
                                            if (l.includes('F1')) return 'F1';
                                            if (l.includes('BUSINESS_PREMIUM')) return 'BP';
                                            if (l.includes('BUSINESS_STANDARD')) return 'BS';
                                            if (l.includes('BUSINESS_BASIC')) return 'BB';
                                            return l.split('_').slice(-1)[0];
                                          })()`;
if (licPattern.test(c)) { c = c.replace(licPattern, licReplace); console.log('License display updated'); }
else console.log('License pattern not found (already updated)');

// ─── SAVE ───────────────────────────────────────────────────────────────────
fs.writeFileSync('src/pages/StudioRH.tsx', c);
console.log('\nAll done! Lines: ' + c.split('\n').length);
