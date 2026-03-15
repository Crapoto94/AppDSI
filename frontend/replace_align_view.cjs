const fs = require('fs');

let content = fs.readFileSync('c:/dev/HubDSI/frontend/src/pages/StudioRH.tsx', 'utf8');

const startStr = 'const AlignmentsView = ({ headers, loadAgentDetails }: { headers: any, loadAgentDetails: (agent: Agent) => void }) => {';
const endStr = 'const ServicesView = ({ headers, loadAgentDetails }: { headers: any, loadAgentDetails: (agent: Agent) => void }) => {';

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not find bounds');
  process.exit(1);
}

const newView = `const AlignmentsView = ({ headers, loadAgentDetails }: { headers: any, loadAgentDetails: (agent: Agent) => void }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [aligning, setAligning] = useState(false);
  
  const [mappings, setMappings] = useState<{rhField: string, adField: string}[]>([
    { rhField: 'DIRECTION_L', adField: 'department' },
    { rhField: 'SERVICE_L', adField: 'company' }
  ]);
  const [exampleAgent, setExampleAgent] = useState<any>(null);

  const adFieldsList = ['department', 'company', 'title', 'physicalDeliveryOfficeName', 'description', 'info', 'telephoneNumber'];

  const fetchData = async () => {
    setLoading(true);
    try {
      const filteredMappings = mappings.filter(m => m.rhField && m.adField);
      const res = await axios.get('/api/admin/rh/alignments', { 
        headers, 
        params: { mappings: JSON.stringify(filteredMappings.length > 0 ? filteredMappings : mappings) } 
      });
      setData(res.data);
      setSelected(new Set(res.data.map((a: any) => a.matricule)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    fetchData(); 
    axios.get('/api/admin/rh/agents', { headers, params: { q: 'BADOUD', limit: 1 } })
      .then(res => {
        const ag = Array.isArray(res.data?.agents) ? res.data.agents[0] : res.data?.[0];
        if (ag) setExampleAgent(ag);
      });
  }, []);

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
           activeMappings.forEach(m => {
             updates[m.adField] = a.rh[m.rhField];
           });
           return {
             matricule: a.matricule,
             ad_username: a.ad_username,
             updates
           };
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

  const addMapping = () => setMappings([...mappings, { rhField: '', adField: '' }]);
  const removeMapping = (index: number) => setMappings(mappings.filter((_, i) => i !== index));
  const updateMapping = (index: number, field: 'rhField' | 'adField', value: string) => {
    const newM = [...mappings];
    newM[index][field] = value;
    setMappings(newM);
  };

  if (loading && data.length === 0) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spin" size={32} style={{ margin: '0 auto' }} /></div>;

  const rhKeys = exampleAgent ? Object.keys(exampleAgent).filter(k => typeof exampleAgent[k] === 'string' || exampleAgent[k] === null) : [];

  return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldCheck size={20} style={{ color: '#3b82f6' }} /> Paramétrage de l\\'alignement
        </h2>
      </div>
      
      <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
        <p style={{ color: '#64748b', fontSize: '13.5px', marginBottom: '12px', marginTop: 0 }}>
          Définissez les champs RH (référentiel) à vérifier et à copier vers les champs Active Directory correspondants.
        </p>
        
        {mappings.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '10px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <select 
                value={m.rhField} 
                onChange={e => updateMapping(i, 'rhField', e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: 'white' }}
              >
                <option value="">-- Choisir un champ RH --</option>
                {rhKeys.map(k => (
                  <option key={k} value={k}>
                    {k} {exampleAgent?.[k] ? \`(ex: \${exampleAgent[k]})\` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ color: '#94a3b8' }}>➔</div>
            <div style={{ flex: 1 }}>
              <select 
                value={m.adField} 
                onChange={e => updateMapping(i, 'adField', e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: 'white' }}
              >
                <option value="">-- Choisir un champ AD --</option>
                {adFieldsList.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <button onClick={() => removeMapping(i)} style={{ background: 'white', border: '1px solid #e2e8f0', color: '#ef4444', cursor: 'pointer', padding: '8px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} />
            </button>
          </div>
        ))}
        <button onClick={addMapping} style={{ fontSize: '13px', color: '#3b82f6', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>+ Ajouter une association</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
          Désalignements détectés
        </h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={fetchData}
            style={{ padding: '10px 16px', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', fontWeight: 600, color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Search size={16} />
            Actualiser
          </button>
          <button 
            onClick={handleAlign}
            disabled={aligning || selected.size === 0}
            style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: (aligning || selected.size === 0) ? 0.5 : 1 }}
          >
            {aligning ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
            Aligner la sélection ({selected.size})
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ textAlign: 'left', background: '#f8fafc' }}>
              <th style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', width: '40px' }}>
                <input type="checkbox" checked={selected.size === data.length && data.length > 0} onChange={() => setSelected(selected.size === data.length ? new Set() : new Set(data.map(a => a.matricule)))} />
              </th>
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
            ) : data.map(agent => (
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
                            <div 
                              onClick={() => loadAgentDetails({ matricule: agent.matricule, nom: agent.nom, prenom: agent.prenom, ad_username: agent.ad_username } as any)}
                              style={{ fontWeight: 700, color: '#1e293b', cursor: 'pointer', display: 'inline-block' }}
                              className="agent-name-link"
                            >
                              {agent.nom} {agent.prenom}
                            </div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{agent.ad_username}</div>
                          </td>
                        </>
                      )}
                      <td style={{ padding: '8px 12px', color: '#64748b', fontWeight: 500 }}>
                        <span style={{color: '#3b82f6'}}>{m.rhField}</span> ➔ <span>{m.adField}</span>
                      </td>
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

const newContent = content.substring(0, startIndex) + newView + content.substring(endIndex);
fs.writeFileSync('c:/dev/HubDSI/frontend/src/pages/StudioRH.tsx', newContent, 'utf8');
console.log('✅ Replaced AlignmentsView successfully');
