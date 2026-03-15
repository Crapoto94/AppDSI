import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Users, RefreshCw, Search,
  Link2Off, Monitor as MonitorIcon, CheckCircle2,
  AlertCircle, X, Loader2, UserPlus, Download,
  ChevronLeft, ChevronRight, Columns
} from 'lucide-react';
import Header from '../components/Header';
import {
  LayoutDashboard,
  Settings as SettingsIcon, Activity,
  Bell, Lock, Sliders, Eye, EyeOff, Cloud, CloudOff,
  Database, ShieldCheck, Monitor, MonitorOff, Network, ArrowRightLeft
} from 'lucide-react';

export const getAzureLicenseName = (licenseStr: string) => {
  if (!licenseStr) return '';
  const l = licenseStr.toLowerCase();
  
  if (l.includes('6fd2c87f-b296-42f0-b197-1e91e994b900') || l.includes('e3')) return 'E3';
  if (l.includes('18181a46-0d4e-4ce5-a730-f173718ccc14') || l.includes('e1')) return 'E1';
  if (l.includes('c7df2760-2c81-4ef7-b578-5b5392b571df') || l.includes('f3')) return 'F3';
  if (l.includes('8c4ce438-32a7-4ac5-91a6-e22ae08d9c8b') || l.includes('f1')) return 'F1';
  if (l.includes('05e9a617-0261-4cee-970c-d492c969ce70') || l.includes('e5')) return 'E5';
  if (l.includes('cb5cb0b2-7102-4214-9def-63c631024317') || l.includes('premium')) return 'Biz P';
  if (l.includes('199a5c09-e0ca-475f-86ea-eb0c8c36ed60') || l.includes('standard')) return 'Biz S';
  if (l.includes('f30db892-07e9-47e9-837c-80727f46fd3d')) return 'Automate';
  if (l.includes('3b555118-da6a-4418-894f-7df1e2096870')) return 'Copilot';

  if (licenseStr.includes('-')) return licenseStr.split('-')[0].substring(0, 4); 
  return licenseStr.split('_').pop() || licenseStr;
};

interface ColumnSetting {
  id: number;
  column_key: string;
  label: string;
  is_visible: number;
  display_order: number;
  color: string | null;
  is_bold: number;
  is_italic: number;
}

interface Stats {
  total: number;
  actif: number;
  parti: number;
  arriveeFuture: number;
  adLie: number;
  adNonLie: number;
}

interface Agent {
  matricule: string;
  nom: string;
  prenom: string;
  SERVICE_L?: string;
  DIRECTION_L?: string;
  DATE_ARRIVEE?: string;
  DATE_DEPART: string | null;
  ad_username?: string | null;
  date_plusvu?: string | null;
  [key: string]: any; // Allow all other Oracle fields dynamically
}

interface SyncLog {
  id: number;
  sync_type: string;
  status: 'success' | 'error';
  message: string;
  details: string; // JSON string
  created_at: string;
  username: string | null;
}


const StatCard: React.FC<{
  label: string;
  value: number | undefined;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
  onClick?: () => void;
  clickable?: boolean;
  tooltip?: string;
}> = ({ label, value, color, bg, border, icon, onClick, clickable, tooltip }) => (
  <div
    className={`stat-card ${clickable ? 'clickable' : ''}`}
    style={{ background: bg, borderTop: `4px solid ${border}` }}
    onClick={onClick}
    title={tooltip}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div className="stat-value" style={{ color }}>{(value ?? 0).toLocaleString()}</div>
        <div className="stat-label">{label}</div>
      </div>
      <div className="stat-icon" style={{ background: border + '22', color: border }}>{icon}</div>
    </div>
    {clickable && <div className="stat-click-hint">Cliquer pour filtrer →</div>}
  </div>
);

interface EncadrantsViewProps {
  headers: { Authorization: string };
}

interface EncadrantLevel {
  id: string;
  title: string;
  management_level: string;
  color: string;
  border: string;
}

const MANAGEMENT_LEVELS: EncadrantLevel[] = [
  { id: 'dg', title: 'Directeurs Généraux', management_level: 'dg', color: '#7c3aed', border: '#7c3aed' },
  { id: 'dir', title: 'Directeurs', management_level: 'dir', color: '#1d4ed8', border: '#1d4ed8' },
  { id: 'service', title: 'Responsables de service', management_level: 'service', color: '#0369a1', border: '#0369a1' },
  { id: 'secteur', title: 'Responsables de secteur', management_level: 'secteur', color: '#0f766e', border: '#0f766e' },
];

const EncadrantsView: React.FC<EncadrantsViewProps> = ({ headers }) => {
  const [data, setData] = React.useState<Record<string, any[]>>({});
  const [loading, setLoading] = React.useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({ dg: true });

  React.useEffect(() => {
    MANAGEMENT_LEVELS.forEach(async (level) => {
      setLoading(prev => ({ ...prev, [level.id]: true }));
      try {
        const res = await axios.get('/api/admin/rh/agents', {
          headers,
          params: { management_level: level.management_level, limit: 200 }
        });
        const agents = Array.isArray(res.data?.agents) ? res.data.agents : (Array.isArray(res.data) ? res.data : []);
        setData(prev => ({ ...prev, [level.id]: agents }));
      } catch (e) {
        setData(prev => ({ ...prev, [level.id]: [] }));
      } finally {
        setLoading(prev => ({ ...prev, [level.id]: false }));
      }
    });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Encadrants</h1>
      <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>Vue hiérarchique des postes d'encadrement basée sur les fonctions POSTE_L.</p>
      {MANAGEMENT_LEVELS.map(level => {
        const agents = data[level.id] || [];
        const isExpanded = expanded[level.id];
        const isLoading = loading[level.id];
        return (
          <div key={level.id} style={{ background: 'white', borderRadius: '12px', border: `1px solid #e2e8f0`, overflow: 'hidden', borderLeft: `4px solid ${level.border}` }}>
            <div
              onClick={() => setExpanded(prev => ({ ...prev, [level.id]: !isExpanded }))}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontWeight: 700, fontSize: '16px', color: level.color }}>{level.title}</span>
                {!isLoading && (
                  <span style={{ background: level.color + '18', color: level.color, borderRadius: '99px', padding: '2px 10px', fontSize: '12px', fontWeight: 700 }}>
                    {agents.length}
                  </span>
                )}
              </div>
              <ChevronRight size={18} style={{ color: '#94a3b8', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
            </div>
            {isExpanded && (
              <div style={{ borderTop: '1px solid #f1f5f9' }}>
                {isLoading ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                    <Loader2 className="spin" size={24} style={{ margin: '0 auto' }} />
                  </div>
                ) : agents.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>Aucun agent trouvé pour ce niveau</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', padding: '16px' }}>
                    {agents.map((agent: any) => (
                      <div key={agent.MATRICULE || agent.matricule} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                        <div style={{ width: '40px', height: '40px', background: level.color + '22', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: level.color, fontSize: '14px', flexShrink: 0 }}>
                          {(agent.PRENOM || agent.prenom)?.[0]}{(agent.NOM || agent.nom)?.[0]}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                             <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                               {agent.NOM || agent.nom} {agent.PRENOM || agent.prenom}
                             </div>
                             {['dir', 'service'].includes(level.id) && agent.subordinate_count !== undefined && (
                               <div
                                 title={`${agent.subordinate_count} agents actifs sous sa responsabilité`}
                                 style={{ background: level.color + '18', color: level.color, borderRadius: '6px', padding: '1px 6px', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}
                               >
                                 {agent.subordinate_count}
                               </div>
                             )}
                           </div>
                           <div style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                             {agent.POSTE_L || agent.poste_l || '-'}
                           </div>
                           {(agent.DIRECTION_L || agent.SERVICE_L) && (
                             <div style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                               {agent.DIRECTION_L || agent.SERVICE_L}
                             </div>
                           )}
                         </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

interface OnboardingData {
  not_started: Agent[];
  in_progress: Agent[];
  completed: Agent[];
}

const OnboardingView: React.FC<{ headers: { Authorization: string } }> = ({ headers }) => {
  const [data, setData] = React.useState<OnboardingData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchOnboarding = async () => {
      try {
        const res = await axios.get('/api/admin/rh/onboarding', { headers });
        setData(res.data);
      } catch (err) {
        console.error('Erreur onboarding', err);
      } finally {
        setLoading(false);
      }
    };
    fetchOnboarding();
  }, [headers]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
        <Loader2 className="spin" size={32} style={{ color: '#059669' }} />
      </div>
    );
  }

  const renderAgentCard = (agent: Agent) => (
    <div key={agent.MATRICULE || agent.matricule} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', background: '#f8fafc', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#64748b', fontSize: '13px' }}>
          {(agent.PRENOM || agent.prenom)?.[0]}{(agent.NOM || agent.nom)?.[0]}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{agent.NOM || agent.nom} {agent.PRENOM || agent.prenom}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>{agent.POSTE_L || agent.poste_l || '-'}</div>
        </div>
      </div>
      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span><b>Arrivée:</b> {agent.DATE_ARRIVEE ? new Date(agent.DATE_ARRIVEE).toLocaleDateString('fr-FR') : '-'}</span>
          <span style={{ color: agent.ad_username ? '#059669' : '#ef4444', fontWeight: 600 }}>{agent.ad_username || 'Sans AD'}</span>
        </div>
        <div style={{ marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.SERVICE_L || '-'}</div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Onboarding (Arrivées)</h1>
        <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>Suivi des arrivées récentes (30 derniers jours) et futures.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', alignItems: 'start' }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#b91c1c' }}>Non commencé</h3>
            <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: 700 }}>{data?.not_started?.length || 0}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {data?.not_started?.map(renderAgentCard)}
            {data?.not_started?.length === 0 && <div style={{ fontSize: '13px', color: '#991b1b', textAlign: 'center', padding: '10px' }}>Aucun agent</div>}
          </div>
        </div>

        <div style={{ background: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#c2410c' }}>En cours</h3>
            <span style={{ background: '#ffedd5', color: '#c2410c', padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: 700 }}>{data?.in_progress?.length || 0}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {data?.in_progress?.map(renderAgentCard)}
            {data?.in_progress?.length === 0 && <div style={{ fontSize: '13px', color: '#9a3412', textAlign: 'center', padding: '10px' }}>Aucun agent</div>}
          </div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #dcfce7', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#15803d' }}>Terminé</h3>
            <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: 700 }}>{data?.completed?.length || 0}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {data?.completed?.map(renderAgentCard)}
            {data?.completed?.length === 0 && <div style={{ fontSize: '13px', color: '#166534', textAlign: 'center', padding: '10px' }}>Aucun agent</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

const AgentCard: React.FC<{ agent: any }> = ({ agent }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
    <div style={{ width: '28px', height: '28px', background: '#e2e8f0', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#475569' }}>
      {agent.PRENOM?.[0]}{agent.NOM?.[0]}
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.NOM} {agent.PRENOM}</div>
      <div style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.POSTE_L || '-'}</div>
    </div>
  </div>
);

const HierarchyView: React.FC<{ headers: { Authorization: string } }> = ({ headers }) => {
  const [data, setData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expandedDirs, setExpandedDirs] = React.useState<Record<string, boolean>>({});
  const [expandedServs, setExpandedServs] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    const fetchHierarchy = async () => {
      try {
        const res = await axios.get('/api/admin/rh/hierarchy', { headers });
        setData(res.data);
        if (res.data && res.data.length > 0) {
          const initDirs: Record<string, boolean> = {};
          const initServs: Record<string, boolean> = {};
          res.data.forEach((d: any) => { 
            initDirs[d.name] = true; 
            if (d.services) {
              d.services.forEach((s: any) => { initServs[s.name] = true; });
            }
          });
          setExpandedDirs(initDirs);
          setExpandedServs(initServs);
        }
      } catch (err) {
        console.error('Erreur hierarchy', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHierarchy();
  }, [headers]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
        <Loader2 className="spin" size={32} style={{ color: '#059669' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Organisation</h1>
        <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>Vue hiérarchique : Direction &rarr; Service &rarr; Secteur &rarr; Agents actifs.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {data.length === 0 ? (
           <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Aucune donnée hiérarchique</div>
        ) : (
          data.map((dir, dIdx) => {
            const isDirExpanded = expandedDirs[dir.name];
            return (
              <div key={`dir-${dIdx}`} style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div 
                  onClick={() => setExpandedDirs(prev => ({ ...prev, [dir.name]: !isDirExpanded }))}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer', background: isDirExpanded ? '#f8fafc' : 'white', borderBottom: isDirExpanded ? '1px solid #e2e8f0' : 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Network size={20} style={{ color: '#0f766e' }} />
                    <span style={{ fontWeight: 700, fontSize: '16px', color: '#0f172a' }}>{dir.name}</span>
                    <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: '99px', padding: '2px 10px', fontSize: '12px', fontWeight: 700 }}>
                      {dir.count} agents
                    </span>
                  </div>
                  <ChevronRight size={18} style={{ color: '#94a3b8', transform: isDirExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>
                
                {isDirExpanded && (
                  <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#fafbfc' }}>
                    {/* Agents directement rattachés à la Direction */}
                    {dir.agents && dir.agents.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '8px', height: '2px', background: '#0f766e' }}></span>
                          Agents sans service ({dir.agents.length})
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
                          {dir.agents.map((agent: any) => (
                            <AgentCard key={agent.MATRICULE} agent={agent} />
                          ))}
                        </div>
                      </div>
                    )}

                    {dir.services.map((serv: any, sIdx: number) => {
                      const isServExpanded = expandedServs[serv.name];
                      return (
                        <div key={`srv-${sIdx}`} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                          <div 
                            onClick={() => setExpandedServs(prev => ({ ...prev, [serv.name]: !isServExpanded }))}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>{serv.name}</span>
                              <span style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{serv.count}</span>
                            </div>
                            <ChevronRight size={16} style={{ color: '#cbd5e1', transform: isServExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                          </div>
                          
                          {isServExpanded && (
                            <div style={{ padding: '0 16px 16px 16px', borderTop: '1px outset #f1f5f9' }}>
                               {/* Agents directement rattachés au Service */}
                               {serv.agents && serv.agents.length > 0 && (
                                <div style={{ marginTop: '16px' }}>
                                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ width: '8px', height: '2px', background: '#3b82f6' }}></span>
                                    Agents sans secteur ({serv.agents.length})
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
                                    {serv.agents.map((agent: any) => (
                                      <AgentCard key={agent.MATRICULE} agent={agent} />
                                    ))}
                                  </div>
                                </div>
                              )}

                              {serv.secteurs.map((sec: any, secIdx: number) => (
                                <div key={`sec-${secIdx}`} style={{ marginTop: '16px' }}>
                                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                                    {sec.name} ({sec.count})
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
                                    {sec.agents.map((agent: any) => (
                                      <AgentCard key={agent.MATRICULE} agent={agent} />
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
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const AlignmentView: React.FC<{ headers: { Authorization: string } }> = ({ headers }) => {
  const [data, setData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [isAligning, setIsAligning] = React.useState(false);
  const [syncStatus, setSyncStatus] = React.useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const fetchAlignments = React.useCallback(async () => {
    setLoading(true);
    setSyncStatus(null);
    try {
      const res = await axios.get('/api/admin/rh/alignments', { headers });
      setData(res.data);
    } catch (err) {
      console.error('Erreur alignments', err);
    } finally {
      setLoading(false);
    }
  }, [headers]);

  React.useEffect(() => { fetchAlignments(); }, [fetchAlignments]);

  const toggleSelect = (ad_username: string) => {
    const next = new Set(selected);
    if (next.has(ad_username)) next.delete(ad_username);
    else next.add(ad_username);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === data.length) setSelected(new Set());
    else setSelected(new Set(data.map(d => d.ad_username)));
  };

  const handleAlign = async () => {
    if (selected.size === 0) return;
    setIsAligning(true);
    setSyncStatus(null);
    const payload = data
      .filter(d => selected.has(d.ad_username))
      .map(d => {
        const updates: Record<string, string> = {};
        d.mappings.forEach((m: any) => { updates[m.adField] = d.rh[m.rhField]; });
        return { matricule: d.matricule, ad_username: d.ad_username, updates };
      });

    try {
      const res = await axios.post('/api/admin/rh/align-to-ad', { agents: payload }, { headers });
      setSyncStatus({ type: 'success', message: `${res.data.success} agents alignés avec succès (${res.data.error} erreurs).` });
      setSelected(new Set());
      fetchAlignments();
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: err.response?.data?.message || 'Erreur lors de l\'alignement.' });
    } finally {
      setIsAligning(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
        <Loader2 className="spin" size={32} style={{ color: '#059669' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Alignement RH &rarr; AD</h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>Analysez les incohérences entre la base RH et l'Active Directory, puis appliquez les corrections à l'AD.</p>
        </div>
        <button 
          onClick={handleAlign}
          disabled={selected.size === 0 || isAligning}
          style={{ padding: '10px 20px', background: selected.size === 0 ? '#94a3b8' : '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: selected.size === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: isAligning ? 0.7 : 1 }}
        >
          {isAligning ? <Loader2 className="spin" size={18} /> : <ArrowRightLeft size={18} />}
          Aligner {selected.size > 0 ? `(${selected.size}) agents` : 'les agents'}
        </button>
      </div>

      {syncStatus && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: syncStatus.type === 'success' ? '#f0fdf4' : '#fef2f2', color: syncStatus.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${syncStatus.type === 'success' ? '#dcfce7' : '#fee2e2'}`, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600 }}>
          {syncStatus.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {syncStatus.message}
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '16px', textAlign: 'left', width: '40px' }}><input type="checkbox" checked={selected.size === data.length && data.length > 0} onChange={selectAll} /></th>
              <th style={{ padding: '16px', textAlign: 'left', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Agent</th>
              <th style={{ padding: '16px', textAlign: 'left', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Champs incohérents</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={3} style={{ padding: '40px', textAlign: 'center', color: '#16a34a', fontWeight: 600 }}><CheckCircle2 size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />Tous les agents configurés sont alignés avec l'AD !</td></tr>
            ) : (
              data.map((agent) => (
                <tr key={agent.ad_username} style={{ borderBottom: '1px solid #f1f5f9', background: selected.has(agent.ad_username) ? '#f0f9ff' : 'white' }}>
                  <td style={{ padding: '16px' }}><input type="checkbox" checked={selected.has(agent.ad_username)} onChange={() => toggleSelect(agent.ad_username)} /></td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>{agent.nom} {agent.prenom}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{agent.ad_username}</div>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {agent.mappings.map((m: any, idx: number) => {
                        const isDiff = String(agent.rh[m.rhField] || '').trim() !== String(agent.ad[m.adField] || '').trim();
                        if (!isDiff) return null;
                        return (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>RH ({m.rhField})</div>
                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{agent.rh[m.rhField] || '-'}</div>
                            </div>
                            <ArrowRightLeft size={14} style={{ color: '#cbd5e1' }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>AD ({m.adField})</div>
                              <div style={{ fontWeight: 600, color: '#ef4444', textDecoration: 'line-through' }}>{agent.ad[m.adField] || '-'}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AlignmentSettings: React.FC<{ headers: { Authorization: string } }> = ({ headers }) => {
  const [testAgent, setTestAgent] = React.useState<Agent | null>(null);
  const [testAgentDetails, setTestAgentDetails] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [mappings, setMappings] = React.useState([{rhField: 'DIRECTION_L', adField: 'department'}, {rhField: 'SERVICE_L', adField: 'company'}, {rhField: 'POSTE_L', adField: 'title'}]);
  
  const [searchTerm, setSearchTerm] = React.useState('Mourad Badoud');
  const [searchResults, setSearchResults] = React.useState<Agent[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);

  const searchAgent = React.useCallback(async (term: string) => {
    if (term.length < 2) return;
    setIsSearching(true);
    try {
      const res = await axios.get(`/api/admin/rh/agents?q=${term}&limit=10`, { headers });
      setSearchResults(res.data.agents || []);
    } catch {}
    setIsSearching(false);
  }, [headers]);

  const selectAgent = async (agent: Agent) => {
    setTestAgent(agent);
    setSearchResults([]);
    setSearchTerm(`${agent.nom} ${agent.prenom}`);
    setLoading(true);
    try {
      const res = await axios.get(`/api/admin/rh/agent-details/${agent.matricule}`, { headers });
      setTestAgentDetails(res.data);
    } catch {}
    setLoading(false);
  };

  // Load initial on mount
  React.useEffect(() => {
    searchAgent('Mourad Badoud').then(() => {
       // We can just rely on the search results effect, or explicit load.
       const loadFirst = async () => {
         try {
           const res = await axios.get('/api/admin/rh/agents?q=Mourad Badoud&limit=1', { headers });
           if (res.data.agents?.length > 0) {
              selectAgent(res.data.agents[0]);
           }
         } catch {}
       };
       loadFirst();
    });
  }, [headers]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', background: '#eff6ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
            <ArrowRightLeft size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Champs d'alignement</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Configurez les correspondances entre la base RH et l'Active Directory.</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Agent de test (recherche par nom)</label>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 12px' }}>
             <Search size={16} style={{ color: '#94a3b8' }} />
             <input 
               value={searchTerm}
               onChange={(e) => {
                 setSearchTerm(e.target.value);
                 if (e.target.value.length > 2) searchAgent(e.target.value);
                 else setSearchResults([]);
               }}
               onFocus={() => { if (searchTerm.length > 2) searchAgent(searchTerm) }}
               onBlur={() => setTimeout(() => setSearchResults([]), 200)}
               placeholder="Rechercher un agent..."
               style={{ flex: 1, padding: '10px', border: 'none', background: 'transparent', outline: 'none', fontSize: '14px' }} 
             />
             {isSearching && <Loader2 size={16} className="spin" style={{ color: '#94a3b8' }} />}
          </div>
          {searchResults.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '4px', zIndex: 10, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', maxHeight: '200px', overflowY: 'auto' }}>
              {searchResults.map(a => (
                <div 
                  key={a.matricule} 
                  onClick={() => selectAgent(a)}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                   <div style={{ width: '24px', height: '24px', background: '#e2e8f0', color: '#475569', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '10px' }}>
                     {a.prenom?.[0]}{a.nom?.[0]}
                   </div>
                   <div><b>{a.nom}</b> {a.prenom}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><Loader2 className="spin" size={24} style={{ color: '#2563eb' }} /></div>
        ) : testAgentDetails ? (
           <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
             <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
               <div style={{ width: '32px', height: '32px', background: '#e2e8f0', color: '#475569', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px' }}>
                 {testAgent?.prenom?.[0]}{testAgent?.nom?.[0]}
               </div>
               <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{testAgent?.nom} {testAgent?.prenom}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Test de configuration - Aperçu des valeurs</div>
               </div>
               <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                 <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, border: '1px solid #dcfce7' }}>RH Ok</div>
                 <div style={{ background: testAgentDetails.ad ? '#eff6ff' : '#fef2f2', color: testAgentDetails.ad ? '#2563eb' : '#dc2626', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, border: `1px solid ${testAgentDetails.ad ? '#dbeafe' : '#fee2e2'}` }}>
                   {testAgentDetails.ad ? `AD: ${testAgentDetails.ad.sAMAccountName}` : 'Sans AD'}
                 </div>
               </div>
             </div>

             <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
               <thead>
                 <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                   <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', width: '25%' }}>Champ RH</th>
                   <th style={{ textAlign: 'left', padding: '8px 12px', color: '#0f172a', fontSize: '12px', width: '25%' }}>Valeur (Mourad B.)</th>
                   <th style={{ textAlign: 'center', padding: '8px', width: '50px' }}></th>
                   <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', width: '25%' }}>Champ AD</th>
                   <th style={{ textAlign: 'left', padding: '8px 12px', color: '#0f172a', fontSize: '12px', width: '25%' }}>Valeur actuelle dans l'AD</th>
                 </tr>
               </thead>
               <tbody>
                 {mappings.map((m, idx) => {
                   const rhVal = String(testAgentDetails.rh?.[m.rhField] || '');
                   const adVal = String(testAgentDetails.ad?.[m.adField] || '');
                   const isMatch = rhVal.trim() === adVal.trim();
                   
                   return (
                     <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                       <td style={{ padding: '12px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                         <div style={{ background: '#f8fafc', padding: '4px 8px', borderRadius: '4px', display: 'inline-block', border: '1px solid #e2e8f0' }}>{m.rhField}</div>
                       </td>
                       <td style={{ padding: '12px', fontSize: '13px', color: '#0f172a', fontWeight: 500 }}>{rhVal || '-'}</td>
                       <td style={{ padding: '12px', textAlign: 'center' }}><ArrowRightLeft size={14} style={{ color: isMatch ? '#10b981' : '#f43f5e' }} /></td>
                       <td style={{ padding: '12px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                         <div style={{ background: '#f8fafc', padding: '4px 8px', borderRadius: '4px', display: 'inline-block', border: '1px solid #e2e8f0' }}>{m.adField}</div>
                       </td>
                       <td style={{ padding: '12px', fontSize: '13px', color: isMatch ? '#0f172a' : '#f43f5e', fontWeight: isMatch ? 500 : 700 }}>
                         {adVal || '-'}
                         {!isMatch && adVal && <span style={{ marginLeft: '8px', fontSize: '10px', color: '#ef4444', backgroundColor: '#fef2f2', padding: '2px 6px', borderRadius: '4px' }}>Incohérence</span>}
                       </td>
                     </tr>
                   );
                 })}
               </tbody>
             </table>
           </div>
        ) : (
          <div style={{ color: '#ef4444', fontSize: '13px' }}>Veuillez rechercher et sélectionner un agent.</div>
        )}
      </div>
    </div>
  );
};

const StudioRH: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [totalAgents, setTotalAgents] = useState(0);
  const [page, setPage] = useState(1);
  const [syncingAD, setSyncingAD] = useState(false);
  const [adSyncStatus, setAdSyncStatus] = useState({ current: 0, total: 0, status: 'idle', currentName: '', associations: 0 });
  const [proposals, setProposals] = useState<any[]>([]);
  const [showProposalsModal, setShowProposalsModal] = useState(false);

  const [limit, setLimit] = useState(10);
  const [columnSettings, setColumnSettings] = useState<ColumnSetting[]>([]);
  const [currentView, setCurrentView] = useState<'dashboard' | 'agents' | 'hierarchy' | 'encadrants' | 'onboarding' | 'alignment' | 'settings' | 'logs'>('agents');

  // Manual linking states
  const [linkingAgent, setLinkingAgent] = useState<Agent | null>(null);
  const [adSearchTerm, setAdSearchTerm] = useState('');
  const [adSearchResults, setAdSearchResults] = useState<any[]>([]);
  const [isSearchingAD, setIsSearchingAD] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Azure sync states
  const [syncingAzure, setSyncingAzure] = useState(false);
  const [azureSyncStatus, setAzureSyncStatus] = useState({ current: 0, total: 0, status: 'idle' });

  // Details Modal states
  const [viewingDetailsAgent, setViewingDetailsAgent] = useState<Agent | null>(null);
  const [agentFullDetails, setAgentFullDetails] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'rh' | 'ad' | 'azure'>('rh');
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [activePositions, setActivePositions] = useState<string[]>([]);
  const [availablePositions, setAvailablePositions] = useState<string[]>([]);
  const [showActivePositionsModal, setShowActivePositionsModal] = useState(false);
  const [isSavingPositions, setIsSavingPositions] = useState(false);

  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const token = localStorage.getItem('token');
  const headers = React.useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const formatDateFr = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      // Check if the date is valid and not a default invalid date (e.g., from "null" string)
      if (isNaN(d.getTime()) || d.getFullYear() < 1900) { // Arbitrary lower bound for valid dates
        return dateStr; // Return original string if parsing failed or date is clearly invalid
      }
      return d.toLocaleDateString('fr-FR');
    } catch (e) {
      return dateStr; // Fallback to original string on error
    }
  };

  const getManagementLevelStyle = (poste: string | undefined | null) => {
    if (!poste) return { color: '#64748b', bg: '#f1f5f9' };
    const p = poste.toUpperCase();
    if (p.startsWith('DIRECTEUR·TRICE GENERAL·E') || p.startsWith('DIRECTEUR GENERAL') || p.startsWith('DIRECTRICE GENERAL')) return { color: '#7c3aed', bg: '#7c3aed22' };
    if (p.startsWith('DIRECTEUR·TRICE D') || p.startsWith('DIRECTEUR D') || p.startsWith('DIRECTRICE D')) return { color: '#1d4ed8', bg: '#1d4ed822' };
    if (p.startsWith('RESPONSABLE DU SERVICE')) return { color: '#0369a1', bg: '#0369a122' };
    if (p.startsWith('RESPONSABLE DU SECTEUR')) return { color: '#0f766e', bg: '#0f766e22' };
    return { color: '#64748b', bg: '#f1f5f9' };
  };

  const isDeparted = (agent: Agent) => agent.DATE_DEPART && new Date(agent.DATE_DEPART) <= new Date();
  
  const isArrivalFuture = (agent: Agent) => agent.DATE_ARRIVEE && new Date(agent.DATE_ARRIVEE) > new Date();
  
  const isArrivalRecent = (agent: Agent) => {
    if (!agent.DATE_ARRIVEE) return false;
    const arrivalDate = new Date(agent.DATE_ARRIVEE).getTime();
    const now = new Date().getTime();
    const daysSince = (now - arrivalDate) / (1000 * 3600 * 24);
    return daysSince >= 0 && daysSince <= 30;
  };

  const isInactive = (agent: Agent) => agent.is_active_position === false || agent.date_plusvu;

  const fetchStats = async () => {
    if (!token) return;
    try {
      const res = await axios.get('/api/admin/rh/stats', { headers });
      setStats(res.data);
    } catch (err) {
      console.error('Erreur stats', err);
    }
  };

  const fetchAgents = useCallback(async (q?: string, filter?: string | null, p = 1, l = 50) => {
    if (!token) return;
    setLoadingAgents(true);
    setHasSearched(true);
    try {
      const res = await axios.get('/api/admin/rh/agents', { 
        headers, 
        params: { q, filter, page: p, limit: l } 
      });
      const data = res.data || {};
      const agentsList = Array.isArray(data.agents) ? data.agents : (Array.isArray(data) ? data : []);
      const agentsTotal = typeof data.total === 'number' ? data.total : agentsList.length;
      
      setAgents(agentsList);
      setTotalAgents(agentsTotal);
    } catch (err) {
      console.error('Erreur agents', err);
      setAgents([]);
    } finally {
      setLoadingAgents(false);
    }
  }, [token, headers]);

  const fetchProposals = async () => {
    if (!token) return;
    try {
      const res = await axios.get('/api/admin/rh/ad-proposals', { headers });
      setProposals(res.data);
    } catch (err) {
      console.error('Erreur propositions', err);
    }
  };

  const fetchColumnSettings = async () => {
    if (!token) return;
    try {
      const res = await axios.get('/api/column-settings/rh', { headers });
      setColumnSettings(res.data);
    } catch (err) {
      console.error('Erreur column settings', err);
    }
  };

  const fetchActivePositions = async () => {
    if (!token) return;
    try {
      const res = await axios.get('/api/admin/rh/active-positions', { headers });
      setActivePositions(res.data);
    } catch (err) {
      console.error('Erreur positions actives', err);
    }
  };

  const fetchAvailablePositions = async () => {
    if (!token) return;
    try {
      const res = await axios.get('/api/admin/rh/positions', { headers });
      setAvailablePositions(res.data);
    } catch (err) {
      console.error('Erreur positions disponibles', err);
    }
  };

  const fetchLogs = useCallback(async () => {
    if (!token) return;
    setLoadingLogs(true);
    try {
      const res = await axios.get('/api/admin/rh/logs', { headers });
      setLogs(res.data);
    } catch (err) {
      console.error('Erreur logs', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [headers, token]);

  useEffect(() => {
    if (token) {
      fetchStats();
      fetchProposals();
      fetchColumnSettings();
      fetchActivePositions();
      if (currentView === 'logs') fetchLogs();
    }
  }, [token, currentView, fetchLogs]);

  // Debounced search / filter / page
  useEffect(() => {
    if (!token) return;
    const t = setTimeout(() => fetchAgents(searchTerm || undefined, activeFilter, page, limit), 300);
    return () => clearTimeout(t);
  }, [searchTerm, activeFilter, page, limit, fetchAgents, token]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await axios.post('/api/admin/rh/sync', {}, { headers });
      setSyncMessage({
        type: 'success',
        text: `Synchro terminée : ${res.data.stats.new} nouveaux, ${res.data.stats.matched} AD associés, ${res.data.stats.left} départs.`,
      });
      fetchStats();
      if (hasSearched) fetchAgents(searchTerm || undefined, activeFilter, page);
    } catch (err: any) {
      setSyncMessage({
        type: 'error',
        text: err.response?.data?.message || 'Erreur lors de la synchronisation',
      });
    } finally {
      setSyncing(false);
    }
  };

  const startADSync = async () => {
    if (!token) return;
    setSyncingAD(true);
    try {
      await axios.post('/api/admin/rh/sync-ad', {}, { headers });
      const interval = setInterval(async () => {
        try {
          const res = await axios.get('/api/admin/rh/sync-ad/progress', { headers });
          setAdSyncStatus(res.data);
            setSyncingAD(false);
            fetchStats();
            // Retiré à la demande de l'utilisateur : ne pas afficher automatiquement 
            if (res.data.status === 'done') {
              setSyncMessage({ type: 'success', text: `Synchronisation AD terminée : ${res.data.associations || 0} associations confirmées.` });
            }
        } catch (e) {
          clearInterval(interval);
          setSyncingAD(false);
        }
      }, 1000);
    } catch (err) {
      setSyncingAD(false);
      alert('Erreur lors du lancement de la synchro AD');
    }
  };

  const startAzureSync = async () => {
    if (!token) return;
    setSyncingAzure(true);
    try {
      await axios.post('/api/admin/rh/sync-azure', {}, { headers });
      const interval = setInterval(async () => {
        try {
          const res = await axios.get('/api/admin/rh/sync-azure/progress', { headers });
          setAzureSyncStatus(res.data);
          if (res.data.status !== 'running') {
            clearInterval(interval);
            setSyncingAzure(false);
            fetchStats();
            if (hasSearched) fetchAgents(searchTerm || undefined, activeFilter, page, limit);
          }
        } catch (e) {
          clearInterval(interval);
          setSyncingAzure(false);
        }
      }, 1000);
    } catch (err) {
      setSyncingAzure(false);
      alert('Erreur lors du lancement de la synchro Azure');
    }
  };

  const handleProposal = async (id: number, action: 'accept' | 'refuse') => {
    try {
      await axios.post('/api/admin/rh/ad-proposals/action', { id, action }, { headers });
      fetchProposals();
      fetchStats();
      if (hasSearched) fetchAgents(searchTerm || undefined, activeFilter, page, limit);
    } catch (err) {
      alert('Erreur lors du traitement de la proposition');
    }
  };

  const handleDownload = () => {
    // Basic CSV export
    if (agents.length === 0) return;
    const headers = ["Matricule", "Nom", "Prénom", "Fonction", "Service", "Direction"];
    const rows = agents.map(a => [a.matricule, a.nom, a.prenom, a.POSTE_L || a.FONCTION || '', a.SERVICE_L || '', a.DIRECTION_L || '']);
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "liste_rh.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleManualSearchAD = async () => {
    if (!adSearchTerm || adSearchTerm.length < 2) return;
    setIsSearchingAD(true);
    setLinkError(null);
    try {
      const res = await axios.get('/api/admin/rh/ad-search', {
        headers,
        params: { q: adSearchTerm }
      });
      setAdSearchResults(res.data);
    } catch (err: any) {
      setLinkError(err.response?.data?.message || 'Erreur lors de la recherche AD');
    } finally {
      setIsSearchingAD(false);
    }
  };

  const handleConfirmLink = async (adUsername: string) => {
    if (!linkingAgent) return;
    try {
      await axios.post('/api/admin/rh/associate', {
        matricule: linkingAgent.matricule,
        ad_username: adUsername
      }, { headers });
      
      setLinkingAgent(null);
      setAdSearchTerm('');
      setAdSearchResults([]);
      fetchStats();
      fetchAgents(searchTerm || undefined, activeFilter, page, limit);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de l’association');
    }
  };

  const loadAgentDetails = async (agent: Agent) => {
    setViewingDetailsAgent(agent);
    setIsLoadingDetails(true);
    setAgentFullDetails(null);
    setActiveTab('rh');
    try {
      const res = await axios.get(`/api/admin/rh/agent-details/${agent.matricule}`, { headers });
      setAgentFullDetails(res.data);
    } catch (err) {
      console.error("Error loading agent details:", err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const saveActivePositions = async (positions: string[]) => {
    if (!token) return;
    setIsSavingPositions(true);
    try {
      await axios.post('/api/admin/rh/active-positions', { positions }, { headers });
      setActivePositions(positions);
      fetchStats();
      fetchAgents(searchTerm || undefined, activeFilter, page, limit);
      setShowActivePositionsModal(false);
    } catch (err) {
      alert('Erreur lors de la sauvegarde des positions');
    } finally {
      setIsSavingPositions(false);
    }
  };

  const menuItems = [
    { id: 'dashboard', title: "Dashboard", icon: LayoutDashboard },
    { id: 'agents', title: "Agents", icon: Users },
    { id: 'hierarchy', title: "Organisation", icon: Network },
    { id: 'encadrants', title: "Encadrants", icon: Sliders },
    { id: 'onboarding', title: "Onboarding", icon: UserPlus },
    { id: 'alignment', title: "Alignement AD", icon: ArrowRightLeft },
    { id: 'settings', title: "Paramètres", icon: SettingsIcon },
    { id: 'logs', title: "Logs", icon: Activity },
  ];

  return (
    <div className="admin-root">
      <Header />
      
      <div className="admin-container">
        <aside className="admin-sidebar" style={{ backgroundColor: '#0f172a' }}>
          <div className="sidebar-brand" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <Users size={24} className="brand-icon" style={{ color: '#059669' }} />
            <span>Studio RH</span>
          </div>
          
          <nav className="sidebar-nav">
            {menuItems.map((item) => (
              <div
                key={item.id}
                onClick={() => setCurrentView(item.id as any)}
                className={`nav-link ${currentView === item.id ? 'active' : ''}`}
                style={{ cursor: 'pointer', backgroundColor: currentView === item.id ? '#059669' : 'transparent' }}
              >
                <item.icon size={18} />
                <span>{item.title}</span>
                {currentView === item.id && <div className="active-marker" style={{ backgroundColor: 'white' }} />}
              </div>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="system-status">
              <div className="status-dot online"></div>
              <span>Studio Opérationnel</span>
            </div>
          </div>
        </aside>

        <main className="admin-main">
          <header className="admin-content-header">
            <div className="breadcrumb">
              <span className="crumb-root">Studio RH</span>
              <ChevronRight size={14} />
              <span className="crumb-active">
                {currentView === 'agents' ? 'Liste des agents' : 
                 currentView === 'dashboard' ? 'Tableau de bord' :
                 currentView === 'hierarchy' ? 'Organisation' :
                 currentView === 'encadrants' ? 'Encadrants' :
                 currentView === 'onboarding' ? 'Onboarding' :
                 currentView === 'alignment' ? 'Alignement AD' :
                 currentView === 'settings' ? 'Paramètres' : 'Logs de synchronisation'}
              </span>
            </div>
            <div className="header-actions">
              <button className="icon-btn" title="Notifications"><Bell size={18} /></button>
              <button className="icon-btn" title="Sécurité"><Lock size={18} /></button>
            </div>
          </header>

          <div className="admin-content-body" style={{ padding: '24px' }}>
            {currentView === 'dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Tableau de bord RH</h1>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
                  <StatCard label="Total Agents" value={stats?.total} color="#1e293b" bg="white" border="#1e293b" icon={<Users size={20} />} />
                  <StatCard label="Agents Actifs" value={stats?.actif} color="#059669" bg="white" border="#059669" icon={<CheckCircle2 size={20} />} />
                  <StatCard label="Départs" value={stats?.parti} color="#dc2626" bg="white" border="#dc2626" icon={<Link2Off size={20} />} />
                  <StatCard label="AD Liés" value={stats?.adLie} color="#3b82f6" bg="white" border="#3b82f6" icon={<MonitorIcon size={20} />} />
                </div>
              </div>
            )}

            {currentView === 'agents' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="content-top-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <h1 className="content-title" style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Liste des agents</h1>
                    {proposals.length > 0 && (
                      <div className="header-badge warning" onClick={() => setShowProposalsModal(true)} style={{ backgroundColor: '#fff7ed', color: '#ea580c', border: '1px solid #ffedd5', padding: '6px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertCircle size={14} />
                        <span>{proposals.length} suggestions AD</span>
                      </div>
                    )}
                  </div>
                </div>

                {(syncingAD || syncingAzure) && (
                  <div className="sync-progress-container" style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div className="progress-info" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700, color: syncingAD ? '#3b82f6' : '#8b5cf6', marginBottom: '10px' }}>
                      <span>{syncingAD ? (adSyncStatus.currentName || 'Synchronisation AD...') : 'Synchronisation Azure AD...'}</span>
                      <div style={{ display: 'flex', gap: '15px' }}>
                        {syncingAD && adSyncStatus.associations > 0 && <span style={{ color: '#059669' }}>{adSyncStatus.associations} associations</span>}
                        <span>{syncingAD ? adSyncStatus.current : azureSyncStatus.current} / {syncingAD ? adSyncStatus.total : azureSyncStatus.total}</span>
                      </div>
                    </div>
                    <div className="progress-bar-bg" style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div className="progress-bar-fill" style={{ height: '100%', background: syncingAD ? '#3b82f6' : '#8b5cf6', width: syncingAD ? `${(adSyncStatus.current / adSyncStatus.total) * 100}%` : `${(azureSyncStatus.current / azureSyncStatus.total) * 100}%` }}></div>
                    </div>
                  </div>
                )}

                <div className="filter-bar" style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div className="search-box" style={{ position: 'relative', flex: 1, maxWidth: '400px', display: 'flex', alignItems: 'center' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', color: '#94a3b8' }} />
                    <input 
                      type="text" 
                      placeholder="Recherche par nom, prénom, matricule..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px 10px 40px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f1f5f9', fontSize: '14px', outline: 'none' }}
                    />
                  </div>
                  <div className="status-select">
                    <select value={activeFilter || ''} onChange={(e) => { setActiveFilter(e.target.value || null); setPage(1); }} style={{ padding: '10px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f1f5f9', fontSize: '14px', outline: 'none', cursor: 'pointer' }}>
                      <option value="">Tous les agents</option>
                      <option value="actif">Agents actifs</option>
                      <option value="non_actif">Agents non-actifs</option>
                      <option value="parti">Agents partis</option>
                      <option value="future">Arrivées futures</option>
                      <option value="ad_linked">Compte AD lié</option>
                      <option value="ad_unlinked">Compte AD non lié</option>
                    </select>
                  </div>
                  <div className="action-buttons" style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <button className="btn-toolbar" onClick={handleSync} title="Synchroniser Oracle">
                        <RefreshCw size={18} className={syncing ? 'spin' : ''} style={{ color: '#059669' }} />
                      </button>
                      <button className="btn-toolbar" onClick={startADSync} title="Synchroniser Active Directory">
                        <MonitorIcon size={18} className={syncingAD ? 'spin' : ''} style={{ color: '#3b82f6' }} />
                      </button>
                      <button className="btn-toolbar" onClick={startAzureSync} title="Synchroniser Azure AD (Entra)">
                        <Cloud size={18} className={syncingAzure ? 'spin' : ''} style={{ color: '#8b5cf6' }} />
                      </button>
                      <div style={{ width: '1px', background: '#e2e8f0', margin: '4px 8px' }} />
                      <button className="btn-toolbar" onClick={handleDownload} title="Exporter CSV">
                        <Download size={18} style={{ color: '#64748b' }} />
                      </button>
                      <button className="btn-toolbar" onClick={() => setShowColumnSettings(true)} title="Gérer les colonnes">
                        <Columns size={18} style={{ color: '#64748b' }} />
                      </button>
                    </div>
                    
                    <button style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#059669', color: 'white', borderRadius: '10px', fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(5, 150, 105, 0.2)', transition: 'transform 0.2s' }} className="btn-add">
                      <UserPlus size={18} />
                      <span>Ajouter</span>
                    </button>
                  </div>
                </div>

                {syncMessage && (
                  <div className={`message-banner ${syncMessage.type}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 500, backgroundColor: syncMessage.type === 'success' ? '#f0fdf4' : '#fef2f2', color: syncMessage.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${syncMessage.type === 'success' ? '#dcfce7' : '#fee2e2'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {syncMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                      <span>{syncMessage.text}</span>
                    </div>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }} onClick={() => setSyncMessage(null)}><X size={16} /></button>
                  </div>
                )}

                <div className="user-table-container" style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'auto' }}>
                  <table className="user-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}><input type="checkbox" /></th>
                        <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>Agent</th>
                        <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>Matricule</th>
                        <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>Service</th>
                        <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>Direction</th>
                        <th style={{ textAlign: 'center', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>Connexion AD/Azure</th>
                        <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>Arrivée</th>
                        <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingAgents && agents.length === 0 ? (
                        <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spin" size={32} style={{ margin: '0 auto' }} /></td></tr>
                      ) : agents.length === 0 ? (
                        <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Aucun agent trouvé</td></tr>
                      ) : (
                        agents.map((agent) => {
                          const styleMgmt = getManagementLevelStyle(agent.POSTE_L);
                          const departed = isDeparted(agent);
                          const inactive = !departed && isInactive(agent);
                          const arrivalFuture = isArrivalFuture(agent);
                          const arrivalRecent = isArrivalRecent(agent);
                          return (
                          <tr key={agent.matricule} style={{ opacity: loadingAgents ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                            <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}><input type="checkbox" /></td>
                             <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                 <div style={{ position: 'relative' }}>
                                   <div style={{ 
                                     width: '40px', 
                                     height: '40px', 
                                     minWidth: '40px',
                                     flexShrink: 0,
                                     background: departed ? '#f1f5f9' : styleMgmt.bg, 
                                     borderRadius: '10px', 
                                     display: 'flex', 
                                     alignItems: 'center', 
                                     justifyContent: 'center', 
                                     fontWeight: 700, 
                                     color: departed ? '#94a3b8' : styleMgmt.color, 
                                     fontSize: '14px',
                                     position: 'relative',
                                     overflow: 'hidden',
                                     border: (departed || inactive) ? '2px dashed #94a3b8' : 'none',
                                     opacity: departed ? 0.6 : 1
                                   }}>
                                     {departed && (
                                       <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10, pointerEvents: 'none' }}>
                                         <line x1="0" y1="100%" x2="100%" y2="0" stroke="#ef4444" strokeWidth="2" />
                                       </svg>
                                     )}
                                     <span style={{ position: 'relative', zIndex: 1 }}>
                                        {agent.prenom?.[0]}{agent.nom?.[0]}
                                     </span>
                                   </div>
                                   {arrivalFuture && (
                                     <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: '#3b82f6', color: 'white', borderRadius: '4px', fontSize: '9px', fontWeight: 800, padding: '1px 3px', border: '1px solid white' }}>PROCH</div>
                                   )}
                                   {arrivalRecent && (
                                     <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: '#10b981', color: 'white', borderRadius: '4px', fontSize: '9px', fontWeight: 800, padding: '1px 3px', border: '1px solid white' }}>NOUV</div>
                                   )}
                                 </div>
                                 <div 
                                   onClick={() => loadAgentDetails(agent)}
                                   style={{ cursor: 'pointer', maxWidth: '200px' }}
                                 >
                                   <div style={{ fontWeight: 700, color: '#3b82f6', fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} className="agent-name-link">{agent.nom} {agent.prenom}</div>
                                   <div style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.POSTE_L || agent.FONCTION || '-'}</div>
                                 </div>
                               </div>
                             </td>
                             <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', color: '#64748b', fontSize: '13px' }}>{agent.matricule}</td>
                             <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>{agent.SERVICE_L}</td>
                             <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>{agent.DIRECTION_L}</td>
                             <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                               <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', alignItems: 'center' }}>
                                 {agent.ad_username ? (
                                   <div title={agent.ad_account_enabled ? `Compte AD actif: ${agent.ad_username}` : `Compte AD désactivé: ${agent.ad_username}`}>
                                     <MonitorIcon 
                                       size={18} 
                                       style={{ color: agent.ad_account_enabled ? '#3b82f6' : '#94a3b8' }} 
                                     />
                                   </div>
                                 ) : (
                                   <div title="Aucun lien AD">
                                     <MonitorOff size={18} style={{ color: '#cbd5e1', opacity: 0.5 }} />
                                   </div>
                                 )}
                                 {agent.azure_id ? (
                                   <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title={`Lié à Entra ID: ${agent.azure_id}${agent.azure_license ? ` (${agent.azure_license})` : ''}`}>
                                     <Cloud size={24} style={{ color: '#8b5cf6' }} />
                                     {agent.azure_license && (() => {
                                       const licName = getAzureLicenseName(agent.azure_license);
                                       return (
                                       <span style={{ 
                                         fontSize: '11px', 
                                         fontWeight: 800, 
                                         padding: '2px 6px', 
                                         borderRadius: '4px',
                                         backgroundColor: licName.includes('E5') ? '#faf5ff' : 
                                                          licName.includes('E3') ? '#eff6ff' : 
                                                          licName.includes('E1') ? '#f0fdf4' : 
                                                          licName.includes('F3') ? '#fff7ed' : 
                                                          licName.includes('F1') ? '#fef2f2' : '#f8fafc',
                                         color: licName.includes('E5') ? '#7e22ce' : 
                                                licName.includes('E3') ? '#1d4ed8' : 
                                                licName.includes('E1') ? '#15803d' : 
                                                licName.includes('F3') ? '#c2410c' : 
                                                licName.includes('F1') ? '#b91c1c' : '#64748b',
                                         border: `1px solid ${
                                           licName.includes('E5') ? '#e9d5ff' : 
                                           licName.includes('E3') ? '#dbeafe' : 
                                           licName.includes('E1') ? '#bbf7d0' : 
                                           licName.includes('F3') ? '#ffedd5' : 
                                           licName.includes('F1') ? '#fecaca' : '#e2e8f0'
                                         }`
                                       }}>
                                         {licName}
                                       </span>
                                       );
                                     })()}
                                   </div>
                                 ) : (
                                   <div title="Aucun lien Azure">
                                     <CloudOff size={18} style={{ color: '#cbd5e1', opacity: 0.5 }} />
                                   </div>
                                 )}
                               </div>
                             </td>
                             <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                               {isArrivalFuture(agent) ? (
                                 <div style={{ color: '#3b82f6', fontWeight: 600 }}>
                                    Arrivée: {formatDateFr(agent.DATE_ARRIVEE)}
                                 </div>
                               ) : '-'}
                             </td>
                             <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
                               <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                 {!agent.ad_username && (
                                   <button
                                     onClick={() => {
                                       setLinkingAgent(agent);
                                       setAdSearchTerm(agent.nom);
                                       setAdSearchResults([]);
                                     }}
                                     className="icon-link-btn"
                                     title="Lier manuellement un compte AD"
                                     style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                                   >
                                     <Link2Off size={16} style={{ color: '#f97316' }} />
                                   </button>
                                 )}
                                 {agent.date_plusvu && (
                                   <div title="Agent non trouvé lors de la dernière synchro RH">
                                     <AlertCircle size={16} style={{ color: '#ef4444' }} />
                                   </div>
                                 )}
                               </div>
                             </td>
                          </tr>
                        );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px' }}>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>Affiche <b>{agents.length}</b> sur <b>{totalAgents}</b></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <span>Par page</span>
                      <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
                      </select>
                    </div>
                    <div className="pagination" style={{ display: 'flex', gap: '4px' }}>
                      <button className="page-btn" disabled={page === 1} onClick={() => setPage(page - 1)} style={{ padding: '6px', minWidth: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white' }}><ChevronLeft size={16} /></button>
                      <button className="page-btn active" style={{ minWidth: '32px', height: '32px', borderRadius: '6px', border: '1px solid #059669', background: '#059669', color: 'white', fontWeight: 600 }}>{page}</button>
                      <button className="page-btn" disabled={page >= Math.ceil(totalAgents / limit)} onClick={() => setPage(page + 1)} style={{ padding: '6px', minWidth: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white' }}><ChevronRight size={16} /></button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentView === 'encadrants' && (
              <EncadrantsView headers={headers} />
            )}

            {currentView === 'hierarchy' && (
              <HierarchyView headers={headers} />
            )}

            {currentView === 'onboarding' && (
              <OnboardingView headers={headers} />
            )}

            {currentView === 'alignment' && (
              <AlignmentView headers={headers} />
            )}

            {currentView === 'settings' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Paramètres du Studio</h1>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                  <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', background: '#ecfdf5', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                        <CheckCircle2 size={20} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Définition des agents actifs</h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Configurez les positions RH considérées comme activités réelles.</p>
                      </div>
                    </div>
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                      <div style={{ fontSize: '13px', color: '#0f172a', marginBottom: '12px' }}>
                        {activePositions.length > 0 ? (
                          <span><b>{activePositions.length}</b> positions sélectionnées comme "Actives".</span>
                        ) : (
                          <span style={{ color: '#ef4444' }}><b>Aucune position sélectionnée.</b> Tous les agents non-partis sont affichés par défaut.</span>
                        )}
                      </div>
                      <button 
                        onClick={() => {
                          fetchAvailablePositions();
                          setShowActivePositionsModal(true);
                        }}
                        style={{ width: '100%', padding: '10px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      >
                        <SettingsIcon size={16} />
                        Gérer les positions actives
                      </button>
                    </div>
                  </div>

                  <AlignmentSettings headers={headers} />
                </div>
              </div>
            )}

            {currentView === 'logs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Logs de synchronisation</h1>
                  <button 
                    onClick={fetchLogs}
                    disabled={loadingLogs}
                    style={{ padding: '8px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}
                  >
                    <RefreshCw size={16} className={loadingLogs ? 'spin' : ''} />
                    Actualiser
                  </button>
                </div>

                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '16px 20px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', width: '180px' }}>Date</th>
                        <th style={{ padding: '16px 20px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', width: '150px' }}>Type</th>
                        <th style={{ padding: '16px 20px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', width: '100px' }}>Statut</th>
                        <th style={{ padding: '16px 20px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Message / Détails</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingLogs && logs.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: '40px', textAlign: 'center' }}>
                            <Loader2 className="spin" size={24} style={{ margin: '0 auto', color: '#94a3b8' }} />
                          </td>
                        </tr>
                      ) : logs.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>Aucun log disponible</td>
                        </tr>
                      ) : (
                        logs.map((log) => {
                          const date = new Date(log.created_at);
                          const details = log.details ? JSON.parse(log.details) : null;
                          return (
                            <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '16px 20px', fontSize: '13px', color: '#0f172a' }}>
                                <div style={{ fontWeight: 600 }}>{date.toLocaleDateString('fr-FR')}</div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>{date.toLocaleTimeString('fr-FR')}</div>
                              </td>
                              <td style={{ padding: '16px 20px' }}>
                                <span style={{ 
                                  padding: '4px 10px', 
                                  borderRadius: '6px', 
                                  fontSize: '12px', 
                                  fontWeight: 700,
                                  background: log.sync_type.includes('AD') ? '#eff6ff' : log.sync_type.includes('Azure') ? '#f5f3ff' : '#ecfdf5',
                                  color: log.sync_type.includes('AD') ? '#2563eb' : log.sync_type.includes('Azure') ? '#7c3aed' : '#059669'
                                }}>
                                  {log.sync_type}
                                </span>
                              </td>
                              <td style={{ padding: '16px 20px' }}>
                                <div style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '6px',
                                  color: log.status === 'success' ? '#059669' : '#dc2626',
                                  fontSize: '13px',
                                  fontWeight: 700
                                }}>
                                  {log.status === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                                  {log.status === 'success' ? 'Succès' : 'Erreur'}
                                </div>
                              </td>
                              <td style={{ padding: '16px 20px' }}>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>{log.message}</div>
                                {details && (
                                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                    {Object.entries(details).map(([k, v]: [string, any]) => (
                                      k !== 'status' && k !== 'currentName' && (
                                        <div key={k} style={{ fontSize: '11px', color: '#64748b', background: '#f8fafc', padding: '2px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                          <b style={{ textTransform: 'capitalize' }}>{k === 'matched' ? 'AD Liés' : k === 'left' ? 'Départs' : k === 'new' ? 'Nouveaux' : k}:</b> {v}
                                        </div>
                                      )
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <style>{`
        .admin-root { height: 100vh; display: flex; flex-direction: column; background-color: #f0f2f5; overflow: hidden; font-family: 'Inter', sans-serif; }
        .admin-container { display: flex; flex: 1; overflow: hidden; }
        .admin-sidebar { width: 260px; background-color: #1a2234; color: #a3b1cc; display: flex; flex-direction: column; border-right: 1px solid #0f172a; }
        .sidebar-brand { padding: 25px; display: flex; align-items: center; gap: 12px; color: white; font-weight: 800; font-size: 1.1rem; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .brand-icon { color: #3b82f6; }
        .sidebar-nav { padding: 20px 12px; flex: 1; overflow-y: auto; }
        .nav-link { display: flex; align-items: center; gap: 12px; padding: 12px 16px; color: #94a3b8; text-decoration: none; font-size: 0.9rem; font-weight: 600; border-radius: 8px; margin-bottom: 4px; transition: all 0.2s; position: relative; }
        .nav-link:hover { background-color: rgba(255,255,255,0.05); color: white; }
        .nav-link.active { background-color: #3b82f6; color: white; }
        .active-marker { position: absolute; right: 0; width: 4px; height: 20px; background-color: white; border-radius: 4px 0 0 4px; }
        .sidebar-footer { padding: 20px; border-top: 1px solid rgba(255,255,255,0.05); }
        .system-status { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: #64748b; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; }
        .status-dot.online { background-color: #22c55e; box-shadow: 0 0 8px rgba(34, 197, 94, 0.5); }
        .admin-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .admin-content-header { height: 64px; background-color: white; border-bottom: 1px solid #e2e8f0; padding: 0 30px; display: flex; align-items: center; justify-content: space-between; }
        .breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 600; }
        .crumb-root { color: #94a3b8; }
        .crumb-active { color: #1e293b; }
        .header-actions { display: flex; gap: 10px; }
        .icon-btn { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; color: #64748b; cursor: pointer; transition: all 0.2s; }
        .icon-btn:hover { background: #f1f5f9; color: #1e293b; border-color: #cbd5e1; }
        .admin-content-body { flex: 1; overflow-y: auto; background-color: #f8fafc; }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: white; border-radius: 16px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; }
        .modal-header { padding: 20px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
        .close-btn { background: none; border: none; color: #94a3b8; cursor: pointer; }
        .modal-body { padding: 20px; }
        .associate-btn { background: #3b82f6; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; }
        .stats-table { width: 100%; border-collapse: collapse; }
        .stats-table th { text-align: left; padding: 12px; background: #f8fafc; font-size: 11px; font-weight: 700; color: #64748b; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; }
        .stats-table td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
        .btn-toolbar { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: transparent; border: none; cursor: pointer; transition: all 0.2s; color: #64748b; }
        .btn-toolbar:hover { background: white; box-shadow: 0 2px 6px rgba(0,0,0,0.05); transform: translateY(-1px); }
        .btn-add:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(5, 150, 105, 0.3); }
        .agent-name-link:hover { text-decoration: underline; }
        .tab-btn:hover { background-color: rgba(0,0,0,0.02); }
        .tab-btn.active { position: relative; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>

      {showColumnSettings && (
        <div className="modal-overlay" onClick={() => setShowColumnSettings(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Gérer les colonnes</h2>
              <button className="close-btn" onClick={() => setShowColumnSettings(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {columnSettings.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: 13 }}>Aucune configuration de colonne disponible pour cette page.<br/>Effectuez une première synchronisation pour initialiser les colonnes.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {columnSettings.map((col) => (
                    <div key={col.column_key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontWeight: 500, fontSize: '14px' }}>{col.label || col.column_key}</span>
                      <button
                        onClick={() => {
                          const updated = columnSettings.map(c =>
                            c.column_key === col.column_key ? { ...c, is_visible: col.is_visible ? 0 : 1 } : c
                          );
                          setColumnSettings(updated);
                          const token = localStorage.getItem('token');
                          fetch('/api/column-settings/rh/bulk', {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify(updated)
                          });
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: col.is_visible ? '#dcfce7' : '#fee2e2', color: col.is_visible ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: '13px' }}
                      >
                        {col.is_visible ? <Eye size={14} /> : <EyeOff size={14} />}
                        {col.is_visible ? 'Visible' : 'Masqué'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showProposalsModal && (
        <div className="modal-overlay" onClick={() => setShowProposalsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Propositions de correspondance AD</h2>
              <button className="close-btn" onClick={() => setShowProposalsModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
                Le système a trouvé des comptes AD dont le nom est proche de l'agent RH.
              </p>
              <table className="stats-table">
                <thead>
                  <tr><th>Agent RH</th><th>Compte AD</th><th>Score</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {proposals.map((p: any) => (
                    <tr key={p.id}>
                      <td>{p.NOM} {p.PRENOM}</td>
                      <td style={{ color: '#3b82f6', fontWeight: 700 }}>{p.ad_username}</td>
                      <td>{p.score}%</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="associate-btn" onClick={() => {
                              handleProposal(p.id, 'accept');
                              if (proposals.length === 1) setShowProposalsModal(false);
                          }}>Valider</button>
                          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => handleProposal(p.id, 'refuse')}><X size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {viewingDetailsAgent && (
        <div className="modal-overlay" onClick={() => setViewingDetailsAgent(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%' }}>
            <div className="modal-header" style={{ borderBottom: 'none', padding: '24px 24px 0 24px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>Détails de l'Agent</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#64748b' }}>
                  {viewingDetailsAgent.nom} {viewingDetailsAgent.prenom} • {viewingDetailsAgent.matricule}
                </p>
              </div>
              <button className="close-btn" onClick={() => setViewingDetailsAgent(null)}><X size={24} /></button>
            </div>

            <div className="tab-navigation" style={{ display: 'flex', padding: '0 24px', marginTop: '20px', borderBottom: '1px solid #f1f5f9' }}>
              <button 
                onClick={() => setActiveTab('rh')}
                className={`tab-btn ${activeTab === 'rh' ? 'active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: activeTab === 'rh' ? '#059669' : '#64748b', borderBottom: activeTab === 'rh' ? '2px solid #059669' : '2px solid transparent' }}
              >
                <Database size={18} /> Référentiel RH
              </button>
              <button 
                onClick={() => setActiveTab('ad')}
                className={`tab-btn ${activeTab === 'ad' ? 'active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: activeTab === 'ad' ? '#3b82f6' : '#64748b', borderBottom: activeTab === 'ad' ? '2px solid #3b82f6' : '2px solid transparent' }}
              >
                <Monitor size={18} /> Active Directory
              </button>
              <button 
                onClick={() => setActiveTab('azure')}
                className={`tab-btn ${activeTab === 'azure' ? 'active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: activeTab === 'azure' ? '#8b5cf6' : '#64748b', borderBottom: activeTab === 'azure' ? '2px solid #8b5cf6' : '2px solid transparent' }}
              >
                <Cloud size={18} /> Azure AD
              </button>
            </div>

            <div className="modal-body" style={{ padding: '24px', minHeight: '400px', backgroundColor: '#fcfcfd' }}>
              {isLoadingDetails ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', padding: '80px 0' }}>
                  <Loader2 className="spin" size={40} style={{ color: '#64748b' }} />
                  <span style={{ color: '#64748b', fontWeight: 500 }}>Chargement des données...</span>
                </div>
              ) : (
                <>
                  {activeTab === 'rh' && agentFullDetails?.rh && (
                    <div className="details-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                      {Object.entries(agentFullDetails.rh).map(([key, value]: [string, any]) => (
                        <div key={key} style={{ background: 'white', padding: '12px 16px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                          <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, marginBottom: '4px' }}>{key}</label>
                          <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 600, wordBreak: 'break-all' }}>{value === null || value === '' ? '-' : String(value)}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === 'ad' && (
                    <div style={{ height: '100%' }}>
                      {!agentFullDetails?.ad ? (
                        <div style={{ textAlign: 'center', padding: '80px 0', color: '#64748b' }}>
                          <ShieldCheck size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                          <p>Aucun compte Active Directory lié ou trouvé pour cet agent.</p>
                        </div>
                      ) : (
                        <div className="details-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                          {agentFullDetails.ad.lastLogonFormatted && (
                            <div style={{ background: '#ecfdf5', padding: '12px 16px', borderRadius: '10px', border: '1px solid #10b981', gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ color: '#059669' }}><Monitor size={20} /></div>
                              <div>
                                <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#059669', fontWeight: 700 }}>Dernière connexion au domaine (AD)</label>
                                <div style={{ fontSize: '15px', color: '#065f46', fontWeight: 700 }}>{agentFullDetails.ad.lastLogonFormatted}</div>
                              </div>
                            </div>
                          )}
                          {Object.entries(agentFullDetails.ad)
                            .filter(([k]) => k !== 'lastLogonFormatted')
                            .map(([key, value]: [string, any]) => (
                            <div key={key} style={{ background: 'white', padding: '12px 16px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                              <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, marginBottom: '4px' }}>{key}</label>
                              <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 600, wordBreak: 'break-all' }}>{Array.isArray(value) ? value.join(', ') : (value === null || value === '' ? '-' : String(value))}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'azure' && (
                    <div style={{ height: '100%' }}>
                      {!agentFullDetails?.azure ? (
                        <div style={{ textAlign: 'center', padding: '80px 0', color: '#64748b' }}>
                          <Cloud size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                          <p>Aucun compte Azure AD (Entra) trouvé par correspondance d'email.</p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          {/* 1. Licences (Priorité DSI) */}
                          {agentFullDetails.azure.licenses && (
                            <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, marginBottom: '12px' }}>
                                <ShieldCheck size={16} style={{ color: '#8b5cf6' }} /> Licences Microsoft 365
                              </label>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {agentFullDetails.azure.licenses.length === 0 ? (
                                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Aucune licence détectée</span>
                                ) : (
                                  agentFullDetails.azure.licenses.map((license: string) => (
                                    <span key={license} style={{ padding: '6px 14px', background: '#f5f3ff', color: '#7c3aed', borderRadius: '20px', fontSize: '12px', fontWeight: 700, border: '1px solid #ddd6fe' }}>
                                      {getAzureLicenseName(license)}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                          )}

                          {/* 2. Statut & Infos DSI */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Statut Compte</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: agentFullDetails.azure.accountEnabled ? '#22c55e' : '#ef4444' }}></div>
                                <span style={{ fontSize: '14px', fontWeight: 700, color: agentFullDetails.azure.accountEnabled ? '#16a34a' : '#dc2626' }}>
                                  {agentFullDetails.azure.accountEnabled ? 'Actif / Activé' : 'Désactivé'}
                                </span>
                              </div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Synchronisation</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                                <RefreshCw size={14} style={{ color: agentFullDetails.azure.onPremisesSyncEnabled ? '#3b82f6' : '#94a3b8' }} />
                                {agentFullDetails.azure.onPremisesSyncEnabled ? 'Hybride (AD Sync)' : 'Cloud Only'}
                              </div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Type / Création</span>
                              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                                {agentFullDetails.azure.userType === 'Member' ? 'Interne' : 'Invité'} • {agentFullDetails.azure.createdDateTime ? new Date(agentFullDetails.azure.createdDateTime).toLocaleDateString('fr-FR') : '-'}
                              </div>
                            </div>
                            {agentFullDetails.azure.usageLocation && (
                              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Localisation</span>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                                  Region: {agentFullDetails.azure.usageLocation}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* 3. ProxyAddresses (Aliases) */}
                          {agentFullDetails.azure.proxyAddresses && agentFullDetails.azure.proxyAddresses.length > 0 && (
                            <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, marginBottom: '12px' }}>
                                <Activity size={16} style={{ color: '#3b82f6' }} /> Adresses Alias (ProxyAddresses)
                              </label>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {agentFullDetails.azure.proxyAddresses.map((proxy: string) => (
                                  <span key={proxy} style={{ padding: '4px 10px', background: '#f0f9ff', color: '#0369a1', borderRadius: '6px', fontSize: '11px', fontWeight: 500, border: '1px solid #bae6fd' }}>
                                    {proxy}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 4. Autres Données */}
                          <div className="details-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                            {Object.entries(agentFullDetails.azure)
                              .filter(([k]) => !['licenses', 'accountEnabled', 'onPremisesSyncEnabled', 'userType', 'createdDateTime', 'id', 'usageLocation', 'proxyAddresses'].includes(k))
                              .map(([key, value]: [string, any]) => (
                                <div key={key} style={{ background: 'white', padding: '12px 16px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                                  <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, marginBottom: '4px' }}>{key}</label>
                                  <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 600, wordBreak: 'break-all' }}>{value === null || value === '' ? '-' : String(value)}</div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', background: 'white' }}>
              <button 
                onClick={() => setViewingDetailsAgent(null)}
                style={{ padding: '10px 24px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {linkingAgent && (
        <div className="modal-overlay" onClick={() => setLinkingAgent(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #f1f5f9', padding: '20px 24px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Liaison Active Directory manuelle</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                  Agent : <strong>{linkingAgent.nom} {linkingAgent.prenom}</strong> ({linkingAgent.matricule})
                </p>
              </div>
              <button className="close-btn" onClick={() => setLinkingAgent(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input 
                    type="text" 
                    placeholder="Nom, identifiant ou email AD..." 
                    value={adSearchTerm}
                    onChange={(e) => setAdSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualSearchAD()}
                    style={{ width: '100%', padding: '12px 12px 12px 40px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: '#f8fafc' }}
                  />
                </div>
                <button 
                  onClick={handleManualSearchAD}
                  disabled={isSearchingAD || adSearchTerm.length < 2}
                  style={{ padding: '0 24px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {isSearchingAD ? <Loader2 size={18} className="spin" /> : <Search size={18} />}
                  Rechercher
                </button>
              </div>

              {linkError && (
                <div style={{ padding: '12px', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '8px', fontSize: '13px', marginBottom: '16px', border: '1px solid #fee2e2' }}>
                  {linkError}
                </div>
              )}

              <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: '10px' }}>
                {adSearchResults.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                    {isSearchingAD ? 'Recherche en cours...' : 'Lancez une recherche pour voir les résultats'}
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', background: '#f8fafc' }}>
                        <th style={{ padding: '12px 16px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Utilisateur AD</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Email</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adSearchResults.map((user) => (
                        <tr key={user.sAMAccountName} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13.5px' }}>{user.displayName || user.cn}</div>
                            <div style={{ fontSize: '12px', color: '#3b82f6', fontWeight: 700 }}>{user.sAMAccountName}</div>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{user.mail || '-'}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <button 
                              onClick={() => handleConfirmLink(user.sAMAccountName)}
                              style={{ padding: '6px 16px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                            >
                              Associer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
      </div>
      )}

      {showActivePositionsModal && (
        <div className="modal-overlay" onClick={() => setShowActivePositionsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #f1f5f9', padding: '20px 24px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Sélection des positions actives</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Cochez les libellés de position qui définissent un agent comme étant en activité.</p>
              </div>
              <button className="close-btn" onClick={() => setShowActivePositionsModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ padding: '24px' }}>
              <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '20px', paddingRight: '10px' }}>
                {availablePositions.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>Chargement des positions...</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                    {availablePositions.map(pos => (
                      <label key={pos} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: '#f8fafc', borderRadius: '8px', cursor: 'pointer', border: '1px solid #f1f5f9' }}>
                        <input 
                          type="checkbox" 
                          checked={activePositions.includes(pos)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setActivePositions([...activePositions, pos]);
                            } else {
                              setActivePositions(activePositions.filter(p => p !== pos));
                            }
                          }}
                          style={{ width: '18px', height: '18px', accentColor: '#059669' }}
                        />
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#1e293b' }}>{pos}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button 
                  onClick={() => setShowActivePositionsModal(false)}
                  style={{ padding: '10px 20px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}
                >
                  Annuler
                </button>
                <button 
                  onClick={() => saveActivePositions(activePositions)}
                  disabled={isSavingPositions}
                  style={{ padding: '10px 24px', background: '#059669', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {isSavingPositions && <Loader2 size={18} className="spin" />}
                  Enregistrer la configuration
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudioRH;

