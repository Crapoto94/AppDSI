import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';

interface MailCollector {
  id: number;
  name: string;
  mailbox: string;
  domain_filter: string | null;
  frequency: string;
  is_enabled: boolean;
  last_run: string | null;
  next_run: string | null;
  recentLogs?: any[];
}

interface MailRule {
  id: number;
  name: string;
  type: 'demande' | 'incident';
  keywords: string;
  priority: number;
  is_active: boolean;
}

export default function MailCollector() {
  const { user } = useAuth();
  const [collectors, setCollectors] = useState<MailCollector[]>([]);
  const [rules, setRules] = useState<MailRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'collectors' | 'rules' | 'logs'>('collectors');
  const [showNewCollector, setShowNewCollector] = useState(false);
  const [showNewRule, setShowNewRule] = useState(false);
  const [formData, setFormData] = useState<Partial<MailCollector>>({});
  const [ruleData, setRuleData] = useState<Partial<MailRule>>({});

  const getHeaders = () => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  };

  useEffect(() => {
    if (selectedTab === 'collectors') loadCollectors();
    else if (selectedTab === 'rules') loadRules();
  }, [selectedTab]);

  const loadCollectors = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/mail-collector', { headers: getHeaders() });
      setCollectors(res.data);
    } catch (error) {
      console.error('Erreur chargement collecteurs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/mail-collector/rules', { headers: getHeaders() });
      setRules(res.data);
    } catch (error) {
      console.error('Erreur chargement règles:', error);
    } finally {
      setLoading(false);
    }
  };

  const createCollector = async () => {
    try {
      await axios.post('/api/mail-collector', formData, { headers: getHeaders() });
      setFormData({});
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
    } catch (error: any) {
      const errorData = error.response?.data;
      let errorMsg = error.message;

      if (errorData) {
        errorMsg = errorData.message || error.message;
        if (errorData.detail) {
          errorMsg += '\n\nDétail: ' + (typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail));
        }
        if (errorData.error) {
          errorMsg += '\n\nErreur: ' + errorData.error;
        }
      }

      console.error('Erreur collecte:', error.response?.data, error);
      alert('Erreur collecte:\n' + errorMsg);
    }
  };

  const toggleCollector = async (id: number, enabled: boolean) => {
    try {
      await axios.put(`/api/mail-collector/${id}`, { is_enabled: !enabled }, { headers: getHeaders() });
      loadCollectors();
    } catch (error: any) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  const deleteCollector = async (id: number) => {
    if (!confirm('Confirmer la suppression?')) return;
    try {
      await axios.delete(`/api/mail-collector/${id}`, { headers: getHeaders() });
      loadCollectors();
    } catch (error: any) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  const deleteRule = async (id: number) => {
    if (!confirm('Confirmer la suppression?')) return;
    try {
      await axios.delete(`/api/mail-collector/rules/${id}`, { headers: getHeaders() });
      loadRules();
    } catch (error: any) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  const style = {
    container: { padding: '20px' },
    tabs: { display: 'flex', gap: '10px', marginBottom: '20px' },
    tab: (active: boolean) => ({
      padding: '10px 20px',
      backgroundColor: active ? '#007bff' : '#e9ecef',
      color: active ? 'white' : 'black',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer'
    }),
    button: { padding: '8px 16px', marginRight: '10px', marginBottom: '10px', borderRadius: '4px' },
    form: { marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '4px' },
    formRow: { marginBottom: '10px' },
    input: { padding: '8px', width: '100%', maxWidth: '400px', borderRadius: '4px', border: '1px solid #ddd' },
    table: { width: '100%', borderCollapse: 'collapse' as const },
    th: { padding: '10px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', textAlign: 'left' as const },
    td: { padding: '10px', border: '1px solid #ddd' }
  };

  return (
    <div style={style.container}>
      <h1>Collecteur d'emails</h1>

      <div style={style.tabs}>
        <button
          style={style.tab(selectedTab === 'collectors')}
          onClick={() => setSelectedTab('collectors')}
        >
          Boites mail
        </button>
        <button
          style={style.tab(selectedTab === 'rules')}
          onClick={() => setSelectedTab('rules')}
        >
          Règles de classification
        </button>
      </div>

      {selectedTab === 'collectors' && (
        <>
          <button
            style={{
              ...style.button,
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              cursor: 'pointer',
              borderRadius: '4px'
            }}
            onClick={() => setShowNewCollector(!showNewCollector)}
          >
            {showNewCollector ? 'Annuler' : '+ Nouvelle boite'}
          </button>

          {showNewCollector && (
            <div style={style.form}>
              <div style={style.formRow}>
                <label>Nom: </label>
                <input
                  style={style.input}
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Support - Tickets"
                />
              </div>
              <div style={style.formRow}>
                <label>Email (mailbox):</label>
                <input
                  style={style.input}
                  value={formData.mailbox || ''}
                  onChange={(e) => setFormData({ ...formData, mailbox: e.target.value })}
                  placeholder="support@company.com"
                />
              </div>
              <div style={style.formRow}>
                <label>Filtrer par domaine (optionnel):</label>
                <input
                  style={style.input}
                  value={formData.domain_filter || ''}
                  onChange={(e) => setFormData({ ...formData, domain_filter: e.target.value })}
                  placeholder="ivry94.fr"
                />
              </div>
              <div style={style.formRow}>
                <label>Fréquence:</label>
                <select
                  style={style.input}
                  value={formData.frequency || 'hourly'}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                >
                  <option value="every_15_min">Toutes les 15 minutes</option>
                  <option value="hourly">Chaque heure</option>
                  <option value="4_hours">Tous les 4 heures</option>
                  <option value="daily">Quotidien (2h du matin)</option>
                  <option value="manual">Manuel</option>
                </select>
              </div>
              <button
                onClick={createCollector}
                style={{
                  ...style.button,
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  cursor: 'pointer'
                }}
              >
                Créer
              </button>
            </div>
          )}

          <table style={style.table}>
            <thead>
              <tr>
                <th style={style.th}>Nom</th>
                <th style={style.th}>Boite</th>
                <th style={style.th}>Domaine</th>
                <th style={style.th}>Fréquence</th>
                <th style={style.th}>Dernier passage</th>
                <th style={style.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {collectors.map((c) => (
                <tr key={c.id}>
                  <td style={style.td}>{c.name}</td>
                  <td style={style.td}>{c.mailbox}</td>
                  <td style={style.td}>{c.domain_filter || '-'}</td>
                  <td style={style.td}>{c.frequency}</td>
                  <td style={style.td}>{c.last_run ? new Date(c.last_run).toLocaleString('fr') : '-'}</td>
                  <td style={style.td}>
                    <button
                      style={{ ...style.button, backgroundColor: c.is_enabled ? '#dc3545' : '#28a745', color: 'white', border: 'none', cursor: 'pointer' }}
                      onClick={() => toggleCollector(c.id, c.is_enabled)}
                    >
                      {c.is_enabled ? 'Désactiver' : 'Activer'}
                    </button>
                    <button
                      style={{ ...style.button, backgroundColor: '#007bff', color: 'white', border: 'none', cursor: 'pointer' }}
                      onClick={() => runCollector(c.id)}
                    >
                      Collecter maintenant
                    </button>
                    <button
                      style={{ ...style.button, backgroundColor: '#dc3545', color: 'white', border: 'none', cursor: 'pointer' }}
                      onClick={() => deleteCollector(c.id)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {selectedTab === 'rules' && (
        <>
          <button
            style={{
              ...style.button,
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              cursor: 'pointer',
              borderRadius: '4px'
            }}
            onClick={() => setShowNewRule(!showNewRule)}
          >
            {showNewRule ? 'Annuler' : '+ Nouvelle règle'}
          </button>

          {showNewRule && (
            <div style={style.form}>
              <div style={style.formRow}>
                <label>Nom:</label>
                <input
                  style={style.input}
                  value={ruleData.name || ''}
                  onChange={(e) => setRuleData({ ...ruleData, name: e.target.value })}
                  placeholder="Règle de classification"
                />
              </div>
              <div style={style.formRow}>
                <label>Type:</label>
                <select
                  style={style.input}
                  value={ruleData.type || 'demande'}
                  onChange={(e) => setRuleData({ ...ruleData, type: e.target.value as any })}
                >
                  <option value="demande">Demande</option>
                  <option value="incident">Incident</option>
                </select>
              </div>
              <div style={style.formRow}>
                <label>Mots-clés (séparés par |):</label>
                <textarea
                  style={{ ...style.input, minHeight: '100px' }}
                  value={ruleData.keywords || ''}
                  onChange={(e) => setRuleData({ ...ruleData, keywords: e.target.value })}
                  placeholder="créer|ajouter|nouveau|demande"
                />
              </div>
              <div style={style.formRow}>
                <label>Priorité:</label>
                <input
                  type="number"
                  style={style.input}
                  value={ruleData.priority || 100}
                  onChange={(e) => setRuleData({ ...ruleData, priority: parseInt(e.target.value) })}
                />
              </div>
              <button
                onClick={createRule}
                style={{
                  ...style.button,
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  cursor: 'pointer'
                }}
              >
                Créer
              </button>
            </div>
          )}

          <table style={style.table}>
            <thead>
              <tr>
                <th style={style.th}>Nom</th>
                <th style={style.th}>Type</th>
                <th style={style.th}>Mots-clés</th>
                <th style={style.th}>Priorité</th>
                <th style={style.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td style={style.td}>{r.name}</td>
                  <td style={style.td}>{r.type}</td>
                  <td style={style.td}>{r.keywords.substring(0, 50)}...</td>
                  <td style={style.td}>{r.priority}</td>
                  <td style={style.td}>
                    <button
                      style={{ ...style.button, backgroundColor: '#dc3545', color: 'white', border: 'none', cursor: 'pointer' }}
                      onClick={() => deleteRule(r.id)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
