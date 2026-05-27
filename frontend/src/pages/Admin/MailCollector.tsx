import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';

interface MailCollector {
  id: number;
  name: string;
  mailbox: string;
  domain_filter: string | null;
  frequency: string;
  module: string;
  is_enabled: boolean;
  last_run: string | null;
  next_run: string | null;
}

interface MailRule {
  id: number;
  name: string;
  type: 'demande' | 'incident';
  keywords: string;
  priority: number;
  is_active: boolean;
}

interface CollectorLog {
  id: number;
  collector_id: number;
  run_at: string;
  emails_received: number;
  emails_imported: number;
  emails_skipped: number;
  emails_failed: number;
  tickets_created: number;
  comments_added: number;
  attachments_processed: number;
  errors: string | null;
  status: string;
}

const FREQUENCIES = [
  { value: 'every_minute',  label: 'Toutes les minutes' },
  { value: 'every_5_min',   label: 'Toutes les 5 minutes' },
  { value: 'every_15_min',  label: 'Toutes les 15 minutes' },
  { value: 'hourly',        label: 'Chaque heure' },
  { value: '4_hours',       label: 'Toutes les 4 heures' },
  { value: 'daily',         label: 'Quotidien (2h du matin)' },
  { value: 'manual',        label: 'Manuel uniquement' },
];

const MODULES = [
  { value: 'tickets',  label: 'Tickets (créer des tickets depuis les emails)' },
  { value: 'copieurs', label: 'Copieurs (importer les interventions SAV Koesio)' },
];

export default function MailCollector() {
  const { user } = useAuth();
  const [collectors, setCollectors] = useState<MailCollector[]>([]);
  const [rules, setRules] = useState<MailRule[]>([]);
  const [logs, setLogs] = useState<CollectorLog[]>([]);
  const [selectedTab, setSelectedTab] = useState<'collectors' | 'rules' | 'logs'>('collectors');
  const [selectedCollectorId, setSelectedCollectorId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showNewCollector, setShowNewCollector] = useState(false);
  const [showNewRule, setShowNewRule] = useState(false);
  const [formData, setFormData] = useState<Partial<MailCollector>>({ frequency: 'hourly', module: 'tickets' });
  const [ruleData, setRuleData] = useState<Partial<MailRule>>({});

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  useEffect(() => {
    if (selectedTab === 'collectors') loadCollectors();
    else if (selectedTab === 'rules') loadRules();
    else if (selectedTab === 'logs') {
      if (collectors.length === 0) loadCollectors();
      if (selectedCollectorId) loadLogs(selectedCollectorId);
    }
  }, [selectedTab, selectedCollectorId]);

  const loadCollectors = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/mail-collector', { headers: getHeaders() });
      setCollectors(res.data);
      if (!selectedCollectorId && res.data.length > 0) setSelectedCollectorId(res.data[0].id);
    } catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/mail-collector/rules', { headers: getHeaders() });
      setRules(res.data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const loadLogs = async (collectorId: number) => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/mail-collector/${collectorId}/logs`, { headers: getHeaders() });
      setLogs(res.data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const createCollector = async () => {
    try {
      await axios.post('/api/mail-collector', formData, { headers: getHeaders() });
      setFormData({ frequency: 'hourly', module: 'tickets' });
      setShowNewCollector(false);
      loadCollectors();
    } catch (error: any) {
      alert('Erreur création: ' + (error.response?.data?.message || error.message));
    }
  };

  const createRule = async () => {
    try {
      await axios.post('/api/mail-collector/rules', ruleData, { headers: getHeaders() });
      setRuleData({});
      setShowNewRule(false);
      loadRules();
    } catch (error: any) {
      alert('Erreur création: ' + (error.response?.data?.message || error.message));
    }
  };

  const runCollector = async (id: number) => {
    try {
      const res = await axios.post(`/api/mail-collector/${id}/run`, {}, { headers: getHeaders() });
      alert(`Collecte exécutée: ${res.data.log.emails_imported}/${res.data.log.emails_received} importés`);
      loadCollectors();
      if (selectedTab === 'logs' && selectedCollectorId === id) loadLogs(id);
    } catch (error: any) {
      const errorData = error.response?.data;
      let msg = errorData?.message || error.message;
      if (errorData?.detail) msg += '\n\nDétail: ' + errorData.detail;
      if (errorData?.error) msg += '\n\nErreur: ' + errorData.error;
      alert('Erreur collecte:\n' + msg);
    }
  };

  const toggleCollector = async (id: number, enabled: boolean) => {
    try {
      await axios.put(`/api/mail-collector/${id}`, { is_enabled: !enabled }, { headers: getHeaders() });
      loadCollectors();
    } catch (error: any) { alert('Erreur: ' + (error.response?.data?.message || error.message)); }
  };

  const deleteCollector = async (id: number) => {
    if (!confirm('Confirmer la suppression?')) return;
    try {
      await axios.delete(`/api/mail-collector/${id}`, { headers: getHeaders() });
      loadCollectors();
    } catch (error: any) { alert('Erreur: ' + (error.response?.data?.message || error.message)); }
  };

  const deleteRule = async (id: number) => {
    if (!confirm('Confirmer la suppression?')) return;
    try {
      await axios.delete(`/api/mail-collector/rules/${id}`, { headers: getHeaders() });
      loadRules();
    } catch (error: any) { alert('Erreur: ' + (error.response?.data?.message || error.message)); }
  };

  const freqLabel = (v: string) => FREQUENCIES.find(f => f.value === v)?.label || v;
  const modLabel  = (v: string) => v === 'copieurs' ? '📠 Copieurs' : '🎫 Tickets';

  const statusColor = (s: string) => s === 'success' ? '#28a745' : s === 'partial_error' ? '#fd7e14' : '#dc3545';

  const purgeInvalidTickets = async () => {
    if (!confirm('Supprimer tous les tickets sans numéro (glpi_id null ou 0) et les mappings orphelins ?')) return;
    try {
      const res = await axios.post('/api/mail-collector/purge-invalid-tickets', {}, { headers: getHeaders() });
      alert(res.data.message);
    } catch (error: any) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  const s = {
    container: { padding: '20px' },
    tabs: { display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '2px solid #e9ecef', paddingBottom: '0' },
    tab: (active: boolean): React.CSSProperties => ({
      padding: '10px 20px', backgroundColor: 'transparent', color: active ? '#007bff' : '#6c757d',
      border: 'none', borderBottom: active ? '2px solid #007bff' : '2px solid transparent',
      cursor: 'pointer', fontWeight: active ? 700 : 400, marginBottom: '-2px', fontSize: '14px'
    }),
    btn: (color: string): React.CSSProperties => ({
      padding: '6px 12px', marginRight: '6px', borderRadius: '4px', border: 'none',
      backgroundColor: color, color: 'white', cursor: 'pointer', fontSize: '13px'
    }),
    form: { marginBottom: '20px', padding: '16px', border: '1px solid #dee2e6', borderRadius: '6px', background: '#f8f9fa' },
    row: { marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' },
    label: { minWidth: '200px', fontWeight: 600, fontSize: '13px' },
    input: { padding: '7px 10px', width: '100%', maxWidth: '350px', borderRadius: '4px', border: '1px solid #ced4da', fontSize: '13px' },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
    th: { padding: '10px 12px', backgroundColor: '#f5f5f5', border: '1px solid #dee2e6', textAlign: 'left' as const, fontWeight: 700 },
    td: { padding: '8px 12px', border: '1px solid #dee2e6', verticalAlign: 'middle' as const },
    badge: (color: string): React.CSSProperties => ({
      display: 'inline-block', padding: '2px 8px', borderRadius: '12px',
      fontSize: '11px', fontWeight: 700, backgroundColor: color, color: 'white'
    }),
  };

  return (
    <div style={s.container}>
      <h1 style={{ marginBottom: '6px' }}>Collecteur d'emails</h1>
      <p style={{ color: '#6c757d', marginBottom: '20px', fontSize: '13px' }}>
        Configurez vos boîtes mail pour la collecte automatique de tickets ou d'interventions copieurs.
      </p>

      <div style={s.tabs}>
        {(['collectors', 'rules', 'logs'] as const).map(tab => (
          <button key={tab} style={s.tab(selectedTab === tab)} onClick={() => setSelectedTab(tab)}>
            {tab === 'collectors' ? '📬 Boîtes mail' : tab === 'rules' ? '📋 Règles de classification' : '📊 Logs d\'import'}
          </button>
        ))}
      </div>

      {/* ── COLLECTORS ── */}
      {selectedTab === 'collectors' && (
        <>
          <button style={s.btn('#28a745')} onClick={() => setShowNewCollector(!showNewCollector)}>
            {showNewCollector ? '✕ Annuler' : '+ Nouvelle boîte'}
          </button>
          <button style={{ ...s.btn('#dc3545'), marginLeft: 8 }} onClick={purgeInvalidTickets}>
            Supprimer tickets sans numéro
          </button>

          {showNewCollector && (
            <div style={s.form}>
              <div style={s.row}>
                <span style={s.label}>Nom</span>
                <input style={s.input} value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ex: Support DSI" />
              </div>
              <div style={s.row}>
                <span style={s.label}>Email (mailbox)</span>
                <input style={s.input} value={formData.mailbox || ''} onChange={e => setFormData({...formData, mailbox: e.target.value})} placeholder="support@ivry94.fr" />
              </div>
              <div style={s.row}>
                <span style={s.label}>Filtrer par domaine</span>
                <input style={s.input} value={formData.domain_filter || ''} onChange={e => setFormData({...formData, domain_filter: e.target.value})} placeholder="ivry94.fr (optionnel)" />
              </div>
              <div style={s.row}>
                <span style={s.label}>Module</span>
                <select style={s.input} value={formData.module || 'tickets'} onChange={e => setFormData({...formData, module: e.target.value})}>
                  {MODULES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div style={s.row}>
                <span style={s.label}>Fréquence</span>
                <select style={s.input} value={formData.frequency || 'hourly'} onChange={e => setFormData({...formData, frequency: e.target.value})}>
                  {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <button style={s.btn('#007bff')} onClick={createCollector}>Créer</button>
            </div>
          )}

          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Nom</th>
                <th style={s.th}>Boîte mail</th>
                <th style={s.th}>Domaine</th>
                <th style={s.th}>Module</th>
                <th style={s.th}>Fréquence</th>
                <th style={s.th}>Dernier import</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {collectors.map(c => (
                <tr key={c.id} style={{ background: c.is_enabled ? 'white' : '#f8f9fa' }}>
                  <td style={s.td}><strong>{c.name}</strong></td>
                  <td style={s.td}><code style={{ fontSize: '12px' }}>{c.mailbox}</code></td>
                  <td style={s.td}>{c.domain_filter || <span style={{ color: '#adb5bd' }}>—</span>}</td>
                  <td style={s.td}>{modLabel(c.module || 'tickets')}</td>
                  <td style={s.td}>{freqLabel(c.frequency)}</td>
                  <td style={s.td}>{c.last_run ? new Date(c.last_run).toLocaleString('fr') : <span style={{ color: '#adb5bd' }}>jamais</span>}</td>
                  <td style={s.td}>
                    <button style={s.btn(c.is_enabled ? '#6c757d' : '#28a745')} onClick={() => toggleCollector(c.id, c.is_enabled)}>
                      {c.is_enabled ? 'Désactiver' : 'Activer'}
                    </button>
                    <button style={s.btn('#007bff')} onClick={() => runCollector(c.id)}>▶ Collecter</button>
                    <button style={s.btn('#17a2b8')} onClick={() => { setSelectedCollectorId(c.id); setSelectedTab('logs'); }}>Logs</button>
                    <button style={s.btn('#dc3545')} onClick={() => deleteCollector(c.id)}>✕</button>
                  </td>
                </tr>
              ))}
              {collectors.length === 0 && (
                <tr><td colSpan={7} style={{ ...s.td, textAlign: 'center', color: '#6c757d', padding: '30px' }}>Aucune boîte configurée</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {/* ── RULES ── */}
      {selectedTab === 'rules' && (
        <>
          <button style={s.btn('#28a745')} onClick={() => setShowNewRule(!showNewRule)}>
            {showNewRule ? '✕ Annuler' : '+ Nouvelle règle'}
          </button>

          {showNewRule && (
            <div style={s.form}>
              <div style={s.row}>
                <span style={s.label}>Nom</span>
                <input style={s.input} value={ruleData.name || ''} onChange={e => setRuleData({...ruleData, name: e.target.value})} placeholder="Règle incidents" />
              </div>
              <div style={s.row}>
                <span style={s.label}>Type</span>
                <select style={s.input} value={ruleData.type || 'demande'} onChange={e => setRuleData({...ruleData, type: e.target.value as any})}>
                  <option value="demande">Demande</option>
                  <option value="incident">Incident</option>
                </select>
              </div>
              <div style={s.row}>
                <span style={s.label}>Mots-clés (séparés par |)</span>
                <textarea style={{ ...s.input, minHeight: '80px' }} value={ruleData.keywords || ''} onChange={e => setRuleData({...ruleData, keywords: e.target.value})} placeholder="bug|erreur|panne|crash" />
              </div>
              <div style={s.row}>
                <span style={s.label}>Priorité</span>
                <input type="number" style={s.input} value={ruleData.priority || 100} onChange={e => setRuleData({...ruleData, priority: parseInt(e.target.value)})} />
              </div>
              <button style={s.btn('#007bff')} onClick={createRule}>Créer</button>
            </div>
          )}

          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Nom</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Mots-clés (aperçu)</th>
                <th style={s.th}>Priorité</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id}>
                  <td style={s.td}>{r.name}</td>
                  <td style={s.td}>
                    <span style={s.badge(r.type === 'incident' ? '#dc3545' : '#007bff')}>{r.type}</span>
                  </td>
                  <td style={s.td} title={r.keywords}>{r.keywords.substring(0, 60)}{r.keywords.length > 60 ? '…' : ''}</td>
                  <td style={s.td}>{r.priority}</td>
                  <td style={s.td}><button style={s.btn('#dc3545')} onClick={() => deleteRule(r.id)}>✕ Supprimer</button></td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#6c757d', padding: '30px' }}>Aucune règle</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {/* ── LOGS ── */}
      {selectedTab === 'logs' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <select
              style={{ ...s.input, maxWidth: '280px' }}
              value={selectedCollectorId || ''}
              onChange={e => {
                const id = parseInt(e.target.value);
                setSelectedCollectorId(id);
                loadLogs(id);
              }}
            >
              <option value="">— Choisir une boîte —</option>
              {collectors.length === 0
                ? null
                : collectors.map(c => <option key={c.id} value={c.id}>{c.name} ({c.mailbox})</option>)
              }
            </select>
            {selectedCollectorId && (
              <button style={s.btn('#6c757d')} onClick={() => loadLogs(selectedCollectorId)}>↺ Actualiser</button>
            )}
          </div>

          {/* Charger les collectors si pas encore chargés */}
          {collectors.length === 0 && (
            <button style={s.btn('#007bff')} onClick={() => loadCollectors().then(() => {})}>Charger les boîtes</button>
          )}

          {logs.length === 0 && selectedCollectorId ? (
            <p style={{ color: '#6c757d', padding: '20px 0' }}>Aucun log pour cette boîte.</p>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Statut</th>
                  <th style={s.th}>Reçus</th>
                  <th style={s.th}>Importés</th>
                  <th style={s.th}>Skippés</th>
                  <th style={s.th}>Échoués</th>
                  <th style={s.th}>Tickets créés</th>
                  <th style={s.th}>Commentaires</th>
                  <th style={s.th}>Pièces jointes</th>
                  <th style={s.th}>Erreurs</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  let errors: string[] = [];
                  try { errors = log.errors ? JSON.parse(log.errors) : []; } catch { errors = log.errors ? [log.errors] : []; }
                  return (
                    <tr key={log.id}>
                      <td style={s.td}>{new Date(log.run_at).toLocaleString('fr')}</td>
                      <td style={s.td}><span style={s.badge(statusColor(log.status))}>{log.status}</span></td>
                      <td style={{ ...s.td, textAlign: 'center' as const }}>{log.emails_received}</td>
                      <td style={{ ...s.td, textAlign: 'center' as const, color: log.emails_imported > 0 ? '#28a745' : undefined, fontWeight: log.emails_imported > 0 ? 700 : undefined }}>{log.emails_imported}</td>
                      <td style={{ ...s.td, textAlign: 'center' as const, color: '#6c757d' }}>{log.emails_skipped}</td>
                      <td style={{ ...s.td, textAlign: 'center' as const, color: log.emails_failed > 0 ? '#dc3545' : undefined }}>{log.emails_failed}</td>
                      <td style={{ ...s.td, textAlign: 'center' as const }}>{log.tickets_created}</td>
                      <td style={{ ...s.td, textAlign: 'center' as const }}>{log.comments_added}</td>
                      <td style={{ ...s.td, textAlign: 'center' as const }}>{log.attachments_processed}</td>
                      <td style={{ ...s.td, maxWidth: '200px' }}>
                        {errors.length > 0 ? (
                          <details>
                            <summary style={{ cursor: 'pointer', color: '#dc3545', fontSize: '12px' }}>{errors.length} erreur(s)</summary>
                            <ul style={{ margin: '4px 0', paddingLeft: '16px', fontSize: '11px' }}>
                              {errors.map((e, i) => <li key={i}>{e}</li>)}
                            </ul>
                          </details>
                        ) : <span style={{ color: '#adb5bd' }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
