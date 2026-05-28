import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { ChevronLeft, ChevronRight, Play, Edit2, Trash2, ToggleLeft, ToggleRight, Plus, AlertCircle, CheckCircle, Clock } from 'lucide-react';

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

const ITEMS_PER_PAGE = 10;

export default function MailCollector() {
  const { user } = useAuth();
  const [collectors, setCollectors] = useState<MailCollector[]>([]);
  const [rules, setRules] = useState<MailRule[]>([]);
  const [logs, setLogs] = useState<CollectorLog[]>([]);
  const [selectedTab, setSelectedTab] = useState<'collectors' | 'rules' | 'logs'>('collectors');
  const [selectedCollectorId, setSelectedCollectorId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showNewCollector, setShowNewCollector] = useState(false);
  const [editingCollectorId, setEditingCollectorId] = useState<number | null>(null);
  const [showNewRule, setShowNewRule] = useState(false);
  const [formData, setFormData] = useState<Partial<MailCollector>>({ frequency: 'hourly', module: 'tickets' });
  const [ruleData, setRuleData] = useState<Partial<MailRule>>({});
  const [logPage, setLogPage] = useState(1);

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

  const saveCollector = async () => {
    try {
      if (editingCollectorId) {
        await axios.put(`/api/mail-collector/${editingCollectorId}`, formData, { headers: getHeaders() });
      } else {
        await axios.post('/api/mail-collector', formData, { headers: getHeaders() });
      }
      setFormData({ frequency: 'hourly', module: 'tickets' });
      setShowNewCollector(false);
      setEditingCollectorId(null);
      loadCollectors();
    } catch (error: any) {
      alert('Erreur sauvegarde: ' + (error.response?.data?.message || error.message));
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

  const statusColor = (s: string) => s === 'success' ? '#10b981' : s === 'partial_error' ? '#f59e0b' : '#ef4444';
  const statusIcon = (s: string) => s === 'success' ? '✓' : s === 'partial_error' ? '⚠' : '✕';

  const purgeInvalidTickets = async () => {
    if (!confirm('Supprimer tous les tickets sans numéro (glpi_id null ou 0) et les mappings orphelins ?')) return;
    try {
      const res = await axios.post('/api/mail-collector/purge-invalid-tickets', {}, { headers: getHeaders() });
      alert(res.data.message);
    } catch (error: any) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  const paginatedLogs = logs.slice((logPage - 1) * ITEMS_PER_PAGE, logPage * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(logs.length / ITEMS_PER_PAGE);

  const s = {
    container: { padding: '24px', maxWidth: '1400px', margin: '0 auto' },
    header: { marginBottom: '32px' },
    title: { fontSize: '28px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px 0' },
    subtitle: { fontSize: '14px', color: '#6b7280', margin: '0' },
    tabs: { display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '2px solid #e5e7eb' },
    tab: (active: boolean): React.CSSProperties => ({
      padding: '12px 24px', backgroundColor: 'transparent', color: active ? '#0ea5e9' : '#6b7280',
      border: 'none', borderBottom: active ? '2px solid #0ea5e9' : '2px solid transparent',
      cursor: 'pointer', fontWeight: active ? '600' : '500', marginBottom: '-2px', fontSize: '15px', transition: 'all 0.2s'
    }),
    btn: (variant: 'primary' | 'success' | 'danger' | 'warning' | 'secondary' = 'primary'): React.CSSProperties => {
      const colors = {
        primary: { bg: '#0ea5e9', text: 'white' },
        success: { bg: '#10b981', text: 'white' },
        danger: { bg: '#ef4444', text: 'white' },
        warning: { bg: '#f59e0b', text: 'white' },
        secondary: { bg: '#6b7280', text: 'white' }
      };
      const c = colors[variant];
      return { padding: '8px 16px', marginRight: '8px', borderRadius: '6px', border: 'none', backgroundColor: c.bg, color: c.text, cursor: 'pointer', fontSize: '14px', fontWeight: '500', transition: 'all 0.2s' };
    },
    form: { marginBottom: '24px', padding: '20px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#f9fafb' },
    row: { marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px' },
    label: { minWidth: '180px', fontWeight: '600', fontSize: '14px', color: '#374151' },
    input: { padding: '8px 12px', width: '100%', maxWidth: '350px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' as const },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' },
    th: { padding: '12px 16px', backgroundColor: '#f3f4f6', border: 'none', textAlign: 'left' as const, fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' },
    td: { padding: '12px 16px', border: 'none', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' as const, color: '#111827' },
    badge: (color: string): React.CSSProperties => ({
      display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '16px',
      fontSize: '12px', fontWeight: '600', backgroundColor: color + '20', color: color
    }),
    pagination: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', marginTop: '24px' },
    pageBtn: (active: boolean): React.CSSProperties => ({
      padding: '8px 12px', borderRadius: '6px', border: '1px solid ' + (active ? '#0ea5e9' : '#e5e7eb'),
      backgroundColor: active ? '#0ea5e9' : 'white', color: active ? 'white' : '#374151', cursor: 'pointer', fontSize: '13px', fontWeight: '500'
    })
  };

  return (
    <div style={s.container}>
      <div style={s.header}>
        <h1 style={s.title}>Collecteur d'Emails</h1>
        <p style={s.subtitle}>
          Configurez vos boîtes mail pour la collecte automatique de tickets ou d'interventions.
        </p>
      </div>

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
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <button style={s.btn(showNewCollector ? 'secondary' : 'success')} onClick={() => {
              if (showNewCollector) {
                setShowNewCollector(false);
                setEditingCollectorId(null);
                setFormData({ frequency: 'hourly', module: 'tickets' });
              } else {
                setShowNewCollector(true);
              }
            }}>
              {showNewCollector ? '✕ Annuler' : <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Nouvelle boîte</span>}
            </button>
            <button style={s.btn('danger')} onClick={purgeInvalidTickets}>
              Supprimer tickets sans numéro
            </button>
          </div>

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
              <button style={s.btn('#007bff')} onClick={saveCollector}>
                {editingCollectorId ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          )}

          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Boîte mail</th>
                <th style={s.th}>Module</th>
                <th style={s.th}>Fréquence</th>
                <th style={s.th}>Dernier import</th>
                <th style={s.th}>État</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {collectors.map(c => (
                <tr key={c.id} style={{ background: c.is_enabled ? 'white' : '#f9fafb' }}>
                  <td style={s.td}>
                    <div style={{ fontWeight: '600', color: '#111827' }}>{c.name}</div>
                    <code style={{ fontSize: '12px', color: '#6b7280' }}>{c.mailbox}</code>
                    {c.domain_filter && <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>Domaine: {c.domain_filter}</div>}
                  </td>
                  <td style={s.td}>{modLabel(c.module || 'tickets')}</td>
                  <td style={s.td}><span style={s.badge('#8b5cf6')}>{freqLabel(c.frequency)}</span></td>
                  <td style={s.td}>
                    <div style={{ fontSize: '13px' }}>
                      {c.last_run ? new Date(c.last_run).toLocaleString('fr', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : <span style={{ color: '#9ca3af' }}>jamais</span>}
                    </div>
                  </td>
                  <td style={s.td}>
                    <span style={s.badge(c.is_enabled ? '#10b981' : '#ef4444')}>
                      {c.is_enabled ? '✓ Actif' : '✕ Inactif'}
                    </span>
                  </td>
                  <td style={{ ...s.td, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button style={{ ...s.btn('primary'), padding: '6px 10px', fontSize: '12px' }} onClick={() => toggleCollector(c.id, c.is_enabled)} title={c.is_enabled ? 'Désactiver' : 'Activer'}>
                      {c.is_enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    </button>
                    <button style={{ ...s.btn('warning'), padding: '6px 10px', fontSize: '12px' }} onClick={() => {
                      setFormData(c);
                      setEditingCollectorId(c.id);
                      setShowNewCollector(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }} title="Éditer">
                      <Edit2 size={16} />
                    </button>
                    <button style={{ ...s.btn('primary'), padding: '6px 10px', fontSize: '12px' }} onClick={() => runCollector(c.id)} title="Lancer la collecte">
                      <Play size={16} />
                    </button>
                    <button style={{ ...s.btn('secondary'), padding: '6px 10px', fontSize: '12px' }} onClick={() => { setSelectedCollectorId(c.id); setSelectedTab('logs'); }} title="Voir les logs">
                      📊
                    </button>
                    <button style={{ ...s.btn('danger'), padding: '6px 10px', fontSize: '12px' }} onClick={() => deleteCollector(c.id)} title="Supprimer">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {collectors.length === 0 && (
                <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: '#9ca3af', padding: '40px' }}>Aucune boîte mail configurée</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {/* ── RULES ── */}
      {selectedTab === 'rules' && (
        <>
          <button style={s.btn(showNewRule ? 'secondary' : 'success')} onClick={() => setShowNewRule(!showNewRule)}>
            {showNewRule ? '✕ Annuler' : <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Nouvelle règle</span>}
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
              <button style={s.btn('primary')} onClick={createRule}>Créer</button>
            </div>
          )}

          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Nom de la règle</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Mots-clés</th>
                <th style={s.th}>Priorité</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id}>
                  <td style={s.td}><strong>{r.name}</strong></td>
                  <td style={s.td}>
                    <span style={s.badge(r.type === 'incident' ? '#ef4444' : '#0ea5e9')}>{r.type === 'incident' ? '⚠ Incident' : '📋 Demande'}</span>
                  </td>
                  <td style={{ ...s.td, maxWidth: '300px', whiteSpace: 'normal' }}>
                    <details style={{ cursor: 'pointer' }}>
                      <summary style={{ color: '#6b7280', fontSize: '13px' }}>{r.keywords.substring(0, 40)}{r.keywords.length > 40 ? '…' : ''}</summary>
                      <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f3f4f6', borderRadius: '4px', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {r.keywords}
                      </div>
                    </details>
                  </td>
                  <td style={s.td}><span style={s.badge('#8b5cf6')}>{r.priority}</span></td>
                  <td style={s.td}><button style={{ ...s.btn('danger'), padding: '6px 10px', fontSize: '12px' }} onClick={() => deleteRule(r.id)}><Trash2 size={16} /></button></td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#9ca3af', padding: '40px' }}>Aucune règle configurée</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {/* ── LOGS ── */}
      {selectedTab === 'logs' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <select
              style={{ ...s.input, maxWidth: '320px' }}
              value={selectedCollectorId || ''}
              onChange={e => {
                const id = parseInt(e.target.value);
                setSelectedCollectorId(id);
                setLogPage(1);
                loadLogs(id);
              }}
            >
              <option value="">— Sélectionner une boîte mail —</option>
              {collectors.length === 0
                ? null
                : collectors.map(c => <option key={c.id} value={c.id}>{c.name} ({c.mailbox})</option>)
              }
            </select>
            {selectedCollectorId && (
              <button style={{ ...s.btn('secondary'), display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => loadLogs(selectedCollectorId)}>
                <Clock size={16} /> Actualiser
              </button>
            )}
          </div>

          {collectors.length === 0 && (
            <button style={s.btn('primary')} onClick={() => loadCollectors().then(() => {})}>Charger les boîtes</button>
          )}

          {selectedCollectorId && logs.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9ca3af' }}>
              <Clock size={48} style={{ margin: '0 auto 16px', opacity: '0.5' }} />
              <p style={{ fontSize: '16px', margin: '0' }}>Aucun log pour cette boîte mail</p>
            </div>
          ) : selectedCollectorId ? (
            <>
              <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>
                  Total: <strong>{logs.length}</strong> exécution(s) | Page {logPage} sur {totalPages}
                </span>
              </div>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Date (dernières en premier)</th>
                    <th style={s.th}>Statut</th>
                    <th style={{ ...s.th, textAlign: 'center' as const }}>Reçus</th>
                    <th style={{ ...s.th, textAlign: 'center' as const }}>Importés</th>
                    <th style={{ ...s.th, textAlign: 'center' as const }}>Ignorés</th>
                    <th style={{ ...s.th, textAlign: 'center' as const }}>Échoués</th>
                    <th style={{ ...s.th, textAlign: 'center' as const }}>Tickets</th>
                    <th style={{ ...s.th, textAlign: 'center' as const }}>Commentaires</th>
                    <th style={{ ...s.th, textAlign: 'center' as const }}>PJ</th>
                    <th style={s.th}>Détails</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.map(log => {
                    let errors: string[] = [];
                    try { errors = log.errors ? JSON.parse(log.errors) : []; } catch { errors = log.errors ? [log.errors] : []; }
                    return (
                      <tr key={log.id}>
                        <td style={s.td}>
                          <div style={{ fontWeight: '500' }}>{new Date(log.run_at).toLocaleString('fr', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td style={s.td}>
                          <span style={s.badge(statusColor(log.status))}>
                            {statusIcon(log.status)} {log.status}
                          </span>
                        </td>
                        <td style={{ ...s.td, textAlign: 'center' as const, fontWeight: '500' }}>{log.emails_received}</td>
                        <td style={{ ...s.td, textAlign: 'center' as const, color: log.emails_imported > 0 ? '#10b981' : '#6b7280', fontWeight: log.emails_imported > 0 ? '600' : '400' }}>{log.emails_imported}</td>
                        <td style={{ ...s.td, textAlign: 'center' as const, color: '#6b7280' }}>{log.emails_skipped}</td>
                        <td style={{ ...s.td, textAlign: 'center' as const, color: log.emails_failed > 0 ? '#ef4444' : '#6b7280', fontWeight: log.emails_failed > 0 ? '600' : '400' }}>{log.emails_failed}</td>
                        <td style={{ ...s.td, textAlign: 'center' as const, fontWeight: '500' }}>{log.tickets_created}</td>
                        <td style={{ ...s.td, textAlign: 'center' as const, fontWeight: '500' }}>{log.comments_added}</td>
                        <td style={{ ...s.td, textAlign: 'center' as const, fontSize: '12px' }}>{log.attachments_processed}</td>
                        <td style={s.td}>
                          {errors.length > 0 ? (
                            <details style={{ cursor: 'pointer' }}>
                              <summary style={{ cursor: 'pointer', color: '#ef4444', fontSize: '12px', fontWeight: '600' }}>
                                <AlertCircle size={14} style={{ display: 'inline', marginRight: '4px' }} />{errors.length} erreur(s)
                              </summary>
                              <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '12px', backgroundColor: '#fef2f2', padding: '8px', borderRadius: '4px', marginTop: '6px' }}>
                                {errors.map((e, i) => <li key={i} style={{ marginBottom: '4px', color: '#b91c1c' }}>{e}</li>)}
                              </ul>
                            </details>
                          ) : (
                            <span style={{ color: '#d1d5db', fontSize: '12px' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {totalPages > 1 && (
                <div style={s.pagination}>
                  <button
                    style={{ ...s.pageBtn(false), cursor: logPage === 1 ? 'not-allowed' : 'pointer', opacity: logPage === 1 ? 0.5 : 1 }}
                    onClick={() => setLogPage(Math.max(1, logPage - 1))}
                    disabled={logPage === 1}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      style={s.pageBtn(p === logPage)}
                      onClick={() => setLogPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    style={{ ...s.pageBtn(false), cursor: logPage === totalPages ? 'not-allowed' : 'pointer', opacity: logPage === totalPages ? 0.5 : 1 }}
                    onClick={() => setLogPage(Math.min(totalPages, logPage + 1))}
                    disabled={logPage === totalPages}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
