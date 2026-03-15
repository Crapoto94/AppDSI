const fs = require('fs');

let content = fs.readFileSync('c:/dev/HubDSI/frontend/src/pages/StudioRH.tsx', 'utf8');

const viewsStr = `
const ServicesView = ({ headers, loadAgentDetails }: any) => {
  const [data, setData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    axios.get('/api/admin/rh/agents', { headers, params: { limit: 500 } })
      .then(res => {
        const ag = Array.isArray(res.data?.agents) ? res.data.agents : (Array.isArray(res.data) ? res.data : []);
        const grouped = ag.reduce((acc: any, agent: any) => {
          const svc = agent.SERVICE_L || agent.DIRECTION_L || 'Non affecté';
          if (!acc[svc]) acc[svc] = [];
          acc[svc].push(agent);
          return acc;
        }, {});
        const sorted = Object.entries(grouped).sort((a: any, b: any) => b[1].length - a[1].length);
        setData(sorted);
      }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spin" size={32} style={{ margin: '0 auto' }} /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Services & Directions</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {data.map(([svc, agents]: [string, any[]]) => (
          <div key={svc} style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a', marginBottom: '8px' }}>{svc}</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>{agents.length} agent(s)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {agents.slice(0, 10).map((a: any) => (
                <div key={a.matricule} title={a.nom + ' ' + a.prenom} onClick={() => loadAgentDetails(a)} style={{ cursor: 'pointer' }}>
                  <AgentAvatar agent={a} />
                </div>
              ))}
              {agents.length > 10 && <div style={{ width: '40px', height: '40px', background: '#f1f5f9', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#64748b', fontWeight: 700 }}>+{agents.length - 10}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const OnboardingView = ({ headers, loadAgentDetails }: any) => {
  const [agents, setAgents] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    axios.get('/api/admin/rh/agents', { headers, params: { filter: 'onboarding', limit: 200, sort: 'desc' } })
      .then(res => {
         const ag = Array.isArray(res.data?.agents) ? res.data.agents : (Array.isArray(res.data) ? res.data : []);
         // Filter for recent or future arrivals
         const now = new Date();
         const filtered = ag.filter((a: any) => a.DATE_ARRIVEE && (new Date(a.DATE_ARRIVEE) >= new Date(now.setMonth(now.getMonth() - 2))));
         setAgents(filtered.sort((a: any, b: any) => new Date(b.DATE_ARRIVEE).getTime() - new Date(a.DATE_ARRIVEE).getTime()));
      })
      .finally(() => setLoading(false));
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
                <th style={{ padding: '12px' }}>Date d'arrivée</th>
                <th style={{ padding: '12px' }}>Service</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(a => (
                <tr key={a.matricule} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => loadAgentDetails(a)}>
                    <AgentAvatar agent={a} />
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }} className="agent-name-link">{a.nom} {a.prenom}</div>
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
};

const AlignmentsView = ({ headers, loadAgentDetails }: { headers: any, loadAgentDetails: (agent: any) => void }) => {
  const [data, setData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [aligning, setAligning] = React.useState(false);
  const [mappings, setMappings] = React.useState<{rhField: string, adField: string}[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const resMap = await axios.get('/api/admin/rh/align-mappings', { headers });
      setMappings(resMap.data);
      const res = await axios.get('/api/admin/rh/alignments', { headers });      
      setData(res.data);
      setSelected(new Set(res.data.map((a: any) => a.matricule)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { fetchData(); }, []);

  const toggleSelect = (matricule: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(matricule)) newSelected.delete(matricule);
    else newSelected.add(matricule);
    setSelected(newSelected);
  };

  const handleAlign = async () => {
    if (selected.size === 0) return;
    setAligning(true);
    try {
      const filteredMappings = mappings.filter(m => m.rhField && m.adField);
      const activeMappings = filteredMappings.length > 0 ? filteredMappings : mappings;
      const agentsToAlign = data
        .filter(a => selected.has(a.matricule))
        .map(a => {
           const updates: any = {};
           activeMappings.forEach(m => { updates[m.adField] = a.rh[m.rhField]; });
           return { matricule: a.matricule, ad_username: a.ad_username, updates };
        });
      
      const res = await axios.post('/api/admin/rh/align-to-ad', { agents: agentsToAlign }, { headers });
      alert(\`\${res.data.success} agents alignés avec succès. \${res.data.error} erreurs.\`);
      fetchData();
    } catch (err) {
      alert('Erreur lors de l’alignement');
    } finally {
      setAligning(false);
    }
  };

  if (loading && data.length === 0) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spin" size={32} style={{ margin: '0 auto' }} /></div>;

  return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldCheck size={20} style={{ color: '#3b82f6' }} /> Alignements détectés
        </h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={fetchData} style={{ padding: '10px 16px', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', fontWeight: 600, color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={16} /> Actualiser
          </button>
          <button onClick={handleAlign} disabled={aligning || selected.size === 0} style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: (aligning || selected.size === 0) ? 0.5 : 1 }}>
            {aligning ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
            Aligner la sélection ({selected.size})
          </button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ textAlign: 'left', background: '#f8fafc' }}>
              <th style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', width: '40px' }}><input type="checkbox" checked={selected.size === data.length && data.length > 0} onChange={() => setSelected(selected.size === data.length ? new Set() : new Set(data.map(a => a.matricule)))} /></th>
              <th style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', fontSize: '11px', color: '#64748b' }}>Agent</th>
              <th style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', fontSize: '11px', color: '#64748b' }}>Correspondance</th>
              <th style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', fontSize: '11px', color: '#3b82f6' }}>Source RH (Oracle)</th>
              <th style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', fontSize: '11px', color: '#64748b' }}>Actuel AD</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
               <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spin" size={24} style={{ margin: '0 auto', color: '#94a3b8' }} /></td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Tous les agents sont alignés pour ces champs !</td></tr>
            ) : data.map((agent: any) => (
              <React.Fragment key={agent.matricule}>
                {agent.mappings.map((m: any, idx: number) => {
                  const rhVal = agent.rh[m.rhField];
                  const adVal = agent.ad[m.adField];
                  const hasErr = String(rhVal || '').trim() !== String(adVal || '').trim();
                  return (
                    <tr key={idx} style={{ borderBottom: idx === agent.mappings.length - 1 ? '1px solid #e2e8f0' : '1px solid #f1f5f9' }}>
                      {idx === 0 && (
                        <>
                          <td rowSpan={agent.mappings.length} style={{ padding: '12px', verticalAlign: 'top', borderRight: '1px solid #f1f5f9' }}>
                            <input type="checkbox" checked={selected.has(agent.matricule)} onChange={() => toggleSelect(agent.matricule)} />
                          </td>
                          <td rowSpan={agent.mappings.length} style={{ padding: '12px', verticalAlign: 'top', borderRight: '1px solid #f1f5f9' }}>
                            <div onClick={() => loadAgentDetails({ matricule: agent.matricule, nom: agent.nom, prenom: agent.prenom, ad_username: agent.ad_username } as any)} style={{ fontWeight: 700, color: '#1e293b', cursor: 'pointer', display: 'inline-block' }} className="agent-name-link">{agent.nom} {agent.prenom}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{agent.ad_username}</div>
                          </td>
                        </>
                      )}
                      <td style={{ padding: '8px 12px', color: '#64748b', fontWeight: 500 }}><span style={{color: '#3b82f6'}}>{m.rhField}</span> ➔ <span>{m.adField}</span></td>
                      <td style={{ padding: '8px 12px', color: '#059669', fontWeight: 600 }}>{rhVal || '-'}</td>
                      <td style={{ padding: '8px 12px', color: hasErr ? '#ef4444' : '#64748b', fontWeight: 500 }}>{adVal || '-'}</td>
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
`;

const insertIndex = content.indexOf('const StudioRH: React.FC = () => {');
if (insertIndex > -1) {
  content = content.slice(0, insertIndex) + viewsStr + '\n' + content.slice(insertIndex);
}

const oldMenu = `const menuItems = [
    { id: 'dashboard', title: "Dashboard", icon: LayoutDashboard },
    { id: 'users', title: "Utilisateurs", icon: Users },
    { id: 'encadrants', title: "Encadrants", icon: Sliders },
    { id: 'settings', title: "Paramètres", icon: SettingsIcon },
    { id: 'logs', title: "Logs", icon: Activity },
  ];`;

const newMenu = `const menuItems = [
    { id: 'dashboard', title: "Dashboard", icon: LayoutDashboard },
    { id: 'onboarding', title: "Onboarding", icon: UserPlus },
    { id: 'users', title: "Utilisateurs", icon: Users },
    { id: 'encadrants', title: "Encadrants", icon: Sliders },
    { id: 'services', title: "Services & Directions", icon: Columns },
    { id: 'alignments', title: "Alignements", icon: ShieldCheck },
    { id: 'settings', title: "Paramètres", icon: SettingsIcon },
    { id: 'logs', title: "Logs", icon: Activity },
  ];`;

content = content.replace(oldMenu, newMenu);

content = content.replace(
  `useState<'dashboard' | 'users' | 'encadrants' | 'settings' | 'logs'>('users')`,
  `useState<'dashboard' | 'onboarding' | 'users' | 'encadrants' | 'services' | 'alignments' | 'settings' | 'logs'>('users')`
);

const newConditionalStr = `
            {currentView === 'onboarding' && <OnboardingView headers={headers} loadAgentDetails={loadAgentDetails} />}
            {currentView === 'services' && <ServicesView headers={headers} loadAgentDetails={loadAgentDetails} />}
            {currentView === 'alignments' && <AlignmentsView headers={headers} loadAgentDetails={loadAgentDetails} />}
            {currentView === 'settings' && (
`;

content = content.replace(`{currentView === 'settings' && (`, newConditionalStr);

fs.writeFileSync('c:/dev/HubDSI/frontend/src/pages/StudioRH.tsx', content, 'utf8');
console.log('Restored Onboarding, Services, and Alignments!');
