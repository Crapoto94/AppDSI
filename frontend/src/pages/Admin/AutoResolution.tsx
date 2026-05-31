import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

const s: any = {
  page: { padding: 24 },
  card: { background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24, marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 },
  subtitle: { fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 },
  row: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151', minWidth: 200 },
  input: { padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', flex: 1, maxWidth: 400, boxSizing: 'border-box' as const },
  textarea: { padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', width: '100%', minHeight: 100, boxSizing: 'border-box' as const, fontFamily: 'monospace' },
  checkbox: { width: 20, height: 20, cursor: 'pointer' },
  btn: (color: string): React.CSSProperties => ({ padding: '9px 20px', border: 'none', borderRadius: 8, cursor: 'pointer', background: color, color: '#fff', fontWeight: 600, fontSize: 14 }),
  btnOutline: (color: string): React.CSSProperties => ({ padding: '9px 20px', border: `1.5px solid ${color}`, borderRadius: 8, cursor: 'pointer', background: '#fff', color, fontWeight: 600, fontSize: 14 }),
  tabBar: { display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', marginBottom: 20 },
  tab: (active: boolean): React.CSSProperties => ({ padding: '10px 20px', border: 'none', background: active ? '#6366f1' : 'transparent', color: active ? '#fff' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', borderRadius: '8px 8px 0 0' }),
  pre: { background: '#f8fafc', padding: 16, borderRadius: 8, fontSize: 13, maxHeight: 400, overflow: 'auto', fontFamily: 'monospace', lineHeight: 1.6 },
  badge: (color: string): React.CSSProperties => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: color + '20', color }),
};

const LOG_COLORS: Record<string, string> = {
  reminder_sent: '#f59e0b',
  keep_alive: '#22c55e',
  closed: '#ef4444',
};

const LOG_LABELS: Record<string, string> = {
  reminder_sent: 'Relance',
  keep_alive: 'Confirmé',
  closed: 'Clôturé',
};

export default function AutoResolution() {
  const { user } = useAuth();
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const [tab, setTab] = useState<'settings' | 'logs' | 'pending' | 'test'>('settings');
  const [settings, setSettings] = useState<any>({
    enabled: false, inactivity_days: 30, max_reminders: 3,
    reminder_frequency_days: 7, notify_observers: false,
    reminder_subject: '', reminder_message: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [logs, setLogs] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tab === 'settings') fetchSettings();
    if (tab === 'logs') fetchLogs();
    if (tab === 'pending') fetchPending();
  }, [tab]);

  async function fetchSettings() {
    try {
      const { data } = await axios.get('/api/auto-resolution/settings', { headers });
      setSettings(data);
    } catch (e) { console.error(e); }
  }

  async function saveSettings() {
    setSaving(true);
    setSaveMsg('');
    try {
      const { data } = await axios.put('/api/auto-resolution/settings', settings, { headers });
      setSettings(data);
      setSaveMsg('Paramètres enregistrés');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e: any) {
      setSaveMsg('Erreur: ' + (e.response?.data?.message || e.message));
    } finally { setSaving(false); }
  }

  async function fetchLogs() {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/auto-resolution/logs', { headers });
      setLogs(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function fetchPending() {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/auto-resolution/pending', { headers });
      setPending(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function runProcess() {
    setProcessing(true);
    try {
      const { data } = await axios.post('/api/auto-resolution/process', {}, { headers });
      alert(data.message);
      fetchLogs();
      fetchPending();
    } catch (e: any) {
      alert('Erreur: ' + (e.response?.data?.message || e.message));
    } finally { setProcessing(false); }
  }

  async function runTest() {
    if (!testEmail.trim()) return;
    setProcessing(true);
    setTestResult(null);
    try {
      const { data } = await axios.post('/api/auto-resolution/test', { email: testEmail.trim() }, { headers });
      setTestResult(data);
      fetchLogs();
    } catch (e: any) {
      alert('Erreur: ' + (e.response?.data?.message || e.message));
    } finally { setProcessing(false); }
  }

  const st = settings || {};

  return (
    <div style={s.page}>
      <div style={s.title}>
        <span>⚙️ Résolution automatique des tickets</span>
      </div>

      <div style={s.tabBar}>
        <button style={s.tab(tab === 'settings')} onClick={() => setTab('settings')}>Paramètres</button>
        <button style={s.tab(tab === 'logs')} onClick={() => setTab('logs')}>Logs</button>
        <button style={s.tab(tab === 'pending')} onClick={() => setTab('pending')}>En attente</button>
        <button style={s.tab(tab === 'test')} onClick={() => setTab('test')}>Test</button>
      </div>

      {/* ── Paramètres ─────────────────────── */}
      {tab === 'settings' && (
        <div style={s.card}>
          <div style={s.row}>
            <span style={s.label}>Activer la résolution automatique</span>
            <input type="checkbox" style={s.checkbox} checked={!!st.enabled}
              onChange={e => setSettings({ ...st, enabled: e.target.checked })} />
          </div>

          <div style={s.row}>
            <span style={s.label}>Jours d'inactivité avant relance</span>
            <input type="number" style={s.input} value={st.inactivity_days || 30}
              onChange={e => setSettings({ ...st, inactivity_days: parseInt(e.target.value) || 30 })} />
          </div>

          <div style={s.row}>
            <span style={s.label}>Nombre maximum de relances</span>
            <input type="number" style={s.input} value={st.max_reminders || 3}
              onChange={e => setSettings({ ...st, max_reminders: parseInt(e.target.value) || 3 })} />
          </div>

          <div style={s.row}>
            <span style={s.label}>Fréquence des relances (tous les X jours)</span>
            <input type="number" style={s.input} value={st.reminder_frequency_days || 7}
              onChange={e => setSettings({ ...st, reminder_frequency_days: parseInt(e.target.value) || 7 })} />
          </div>

          <div style={s.row}>
            <span style={s.label}>Relancer également les observateurs</span>
            <input type="checkbox" style={s.checkbox} checked={!!st.notify_observers}
              onChange={e => setSettings({ ...st, notify_observers: e.target.checked })} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={s.label}>Sujet du mail de relance</div>
            <input style={s.input} value={st.reminder_subject || ''}
              onChange={e => setSettings({ ...st, reminder_subject: e.target.value })} />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Variables : {'{{ticket_id}}'} {'{{ticket_title}}'} {'{{inactivity_days}}'} {'{{max_reminders}}'} {'{{reminder_count}}'}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={s.label}>Message du mail de relance (HTML)</div>
            <textarea style={s.textarea} value={st.reminder_message || ''}
              onChange={e => setSettings({ ...st, reminder_message: e.target.value })} />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Variables : {'{{ticket_id}}'} {'{{ticket_title}}'} {'{{requester_name}}'} {'{{inactivity_days}}'} {'{{keep_alive_url}}'} {'{{max_reminders}}'} {'{{reminder_count}}'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20 }}>
            <button style={s.btn('#6366f1')} onClick={saveSettings} disabled={saving}>
              {saving ? 'Enregistrement...' : '💾 Enregistrer'}
            </button>
            {saveMsg && <span style={{ fontSize: 13, color: saveMsg.includes('Erreur') ? '#ef4444' : '#22c55e' }}>{saveMsg}</span>}
          </div>

          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
            <div style={s.subtitle}>Exécution manuelle</div>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
              Déclencher le processus de résolution automatique immédiatement
              (normalement planifié à 2h du matin).
            </p>
            <button style={s.btn('#f59e0b')} onClick={runProcess} disabled={processing}>
              {processing ? 'Traitement...' : '▶️ Lancer le processus'}
            </button>
          </div>
        </div>
      )}

      {/* ── Logs ───────────────────────────── */}
      {tab === 'logs' && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={s.subtitle}>Historique des actions</div>
            <button style={s.btnOutline('#6366f1')} onClick={fetchLogs}>🔄 Actualiser</button>
          </div>
          {loading ? <div style={{ color: '#94a3b8' }}>Chargement...</div> : logs.length === 0 ? (
            <div style={{ color: '#94a3b8' }}>Aucune action pour le moment</div>
          ) : (
            <div style={s.pre}>
              {logs.map((l: any, i: number) => (
                <div key={l.id || i} style={{ marginBottom: 6, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {l.created_at ? new Date(l.created_at).toLocaleString('fr-FR') : ''}
                  </span>
                  <span style={s.badge(LOG_COLORS[l.action] || '#64748b')}>
                    {LOG_LABELS[l.action] || l.action}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#6366f1' }}>#{l.ticket_id}</span>
                  <span style={{ fontSize: 13, color: '#374151' }}>{l.ticket_title || ''}</span>
                  {l.details && <span style={{ fontSize: 12, color: '#64748b' }}>— {l.details}</span>}
                  {l.requester_email_22 && <span style={{ fontSize: 11, color: '#94a3b8' }}>({l.requester_email_22})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── En attente ─────────────────────── */}
      {tab === 'pending' && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={s.subtitle}>Tickets en attente de traitement</div>
            <button style={s.btnOutline('#6366f1')} onClick={fetchPending}>🔄 Actualiser</button>
          </div>
          {loading ? <div style={{ color: '#94a3b8' }}>Chargement...</div> : pending.length === 0 ? (
            <div style={{ color: '#94a3b8' }}>Aucun ticket en attente</div>
          ) : (
            <div style={s.pre}>
              {pending.map((t: any, i: number) => (
                <div key={t.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: '#6366f1' }}>#{t.id}</span>
                    <span style={{ fontSize: 13 }}>{t.title}</span>
                    <span style={s.badge(t.reminder_count >= (settings?.max_reminders || 3) ? '#ef4444' : '#f59e0b')}>
                      {t.reminder_count}/{settings?.max_reminders || 3} relances
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Demandeur: {t.requester_name || t.requester_email} —
                    Dernière activité: {t.date_mod ? new Date(t.date_mod).toLocaleDateString('fr-FR') : '?'} —
                    Créé: {t.date_creation ? new Date(t.date_creation).toLocaleDateString('fr-FR') : '?'}
                  </div>
                  {t.last_reminder_at && (
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      Dernière relance: {new Date(t.last_reminder_at).toLocaleString('fr-FR')}
                    </div>
                  )}
                  {t.logs?.length > 0 && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                      {t.logs.map((l: any) => (
                        <span key={l.id} style={{ marginRight: 8 }}>
                          [{new Date(l.created_at).toLocaleString('fr-FR')}] {LOG_LABELS[l.action] || l.action}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Test ───────────────────────────── */}
      {tab === 'test' && (
        <div style={s.card}>
          <div style={s.subtitle}>Tester la résolution automatique pour un demandeur</div>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
            Entrez l'email d'un demandeur pour lancer le processus complet
            (relances, clôture) uniquement sur ses tickets ouverts.
          </p>
          <div style={s.row}>
            <span style={s.label}>Email du demandeur</span>
            <input style={s.input} type="email" value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder="exemple@ville-ivry.fr" />
            <button style={s.btn('#6366f1')} onClick={runTest} disabled={processing || !testEmail.trim()}>
              {processing ? 'Traitement...' : '▶️ Tester'}
            </button>
          </div>

          {testResult && (
            <div style={{ marginTop: 20, padding: 16, background: '#f8fafc', borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#1e293b' }}>Résultat du test</div>
              <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>{testResult.message}</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                <span>Total tickets: <strong>{testResult.total_tickets}</strong></span>
                <span style={{ color: '#f59e0b' }}>Relances: <strong>{testResult.reminders_sent}</strong></span>
                <span style={{ color: '#22c55e' }}>Confirmés: <strong>{testResult.keep_alive}</strong></span>
                <span style={{ color: '#ef4444' }}>Clôturés: <strong>{testResult.closed}</strong></span>
                <span style={{ color: '#94a3b8' }}>Erreurs: <strong>{testResult.errors}</strong></span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
