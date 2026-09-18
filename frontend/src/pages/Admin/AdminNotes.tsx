import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Save, RefreshCw, Sparkles, AlertCircle, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const card: React.CSSProperties = { background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,.04)' };
const label: React.CSSProperties = { display: 'block', fontWeight: 700, color: '#334155', fontSize: 13, marginBottom: 6 };
const input: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' };
const mono: React.CSSProperties = { ...input, fontFamily: 'Consolas, monospace', fontSize: 12.5, lineHeight: 1.5, resize: 'vertical' };
const btnPrimary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 };
const btnGhost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12 };

interface Settings {
  notes_apm_model: string;
  notes_auto_analyze: string;
  notes_auto_classify: string;
  notes_analysis_max_chars: string;
  notes_analysis_prompt: string;
  notes_task_prompt: string;
  notes_classify_prompt: string;
  notes_reorganize_prompt: string;
  notes_wordcloud_stopwords: string;
  [key: string]: string;
}

interface PromptBlockProps {
  title: string;
  hint: string;
  value: string;
  minHeight?: number;
  onChange: (value: string) => void;
  onReset: () => void;
}

const PromptBlock: React.FC<PromptBlockProps> = ({ title, hint, value, minHeight = 260, onChange, onReset }) => (
  <div style={card}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
      <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a', fontWeight: 800 }}>{title}</h3>
      <button style={btnGhost} onClick={onReset} type="button">
        <RefreshCw size={13} /> Réinitialiser
      </button>
    </div>
    <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#64748b' }}>{hint}</p>
    <textarea style={{ ...mono, minHeight }} value={value} onChange={e => onChange(e.target.value)} />
  </div>
);

const AdminNotes: React.FC = () => {
  const { token } = useAuth();
  const [config, setConfig] = useState<Settings | null>(null);
  const [defaults, setDefaults] = useState<Settings | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  async function load() {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([
        axios.get('/api/notes/ai-settings', { headers }),
        axios.get('/api/notes/ai-defaults', { headers }),
      ]);
      setConfig(s.data);
      setDefaults(d.data);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.response?.data?.message || 'Erreur de chargement' });
    } finally {
      setLoading(false);
    }
    try {
      const r = await axios.get('/api/notes/models', { headers });
      setModels(Array.isArray(r.data?.models) ? r.data.models : []);
      setModelsError(null);
    } catch (e: any) {
      setModelsError(e.response?.data?.message || 'API IA (APM) injoignable');
    }
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      await axios.post('/api/notes/ai-settings', config, { headers });
      setMessage({ type: 'success', text: 'Paramètres enregistrés' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.response?.data?.message || 'Erreur d\'enregistrement' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  }

  const set = (key: keyof Settings, value: string) => setConfig(prev => (prev ? { ...prev, [key]: value } : prev));
  const resetPrompt = (key: keyof Settings) => { if (defaults) set(key, defaults[key]); };

  if (loading || !config) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>;
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={22} color="#2563eb" /> Mes Notes — Intelligence Artificielle
          </h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13.5 }}>
            Prompts, modèle local (API IA Ville / APM) et comportement automatique du module Notes.
          </p>
        </div>
        <button style={btnPrimary} onClick={save} disabled={saving}>
          <Save size={16} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {message && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: message.type === 'success' ? '#dcfce7' : '#fee2e2', color: message.type === 'success' ? '#166534' : '#991b1b', display: 'flex', alignItems: 'center', gap: 8 }}>
          {message.type === 'success' ? <Check size={15} /> : <AlertCircle size={15} />} {message.text}
        </div>
      )}

      <div style={card}>
        <h3 style={{ margin: '0 0 14px', fontSize: 16, color: '#0f172a', fontWeight: 800 }}>Modèle & comportement</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div>
            <label style={label}>Modèle par défaut (API Ville / APM)</label>
            <select style={input} value={config.notes_apm_model} onChange={e => set('notes_apm_model', e.target.value)}>
              <option value="">Modèle par défaut de l'APM</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {modelsError && <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>⚠ {modelsError}</div>}
            {!modelsError && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>{models.length} modèle(s) actif(s) détecté(s)</div>}
          </div>
          <div>
            <label style={label}>Modèle — analyse unitaire (par note)</label>
            <select style={input} value={config.notes_analysis_model} onChange={e => set('notes_analysis_model', e.target.value)}>
              <option value="">Modèle par défaut</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Correction, reformulation, résumé, tags, tâches.</div>
          </div>
          <div>
            <label style={label}>Modèle — classement global (toutes les notes)</label>
            <select style={input} value={config.notes_classify_model} onChange={e => set('notes_classify_model', e.target.value)}>
              <option value="">Modèle par défaut</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Classement / réorganisation de l'arborescence.</div>
          </div>
          <div>
            <label style={label}>Taille maximale du texte analysé (caractères)</label>
            <input type="number" style={input} value={config.notes_analysis_max_chars} onChange={e => set('notes_analysis_max_chars', e.target.value)} />
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Au-delà, le texte est tronqué avant l'analyse.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 18, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: '#334155' }}>
            <input type="checkbox" checked={config.notes_auto_analyze !== 'false'} onChange={e => set('notes_auto_analyze', e.target.checked ? 'true' : 'false')} />
            Analyse unitaire automatique (3 min après la dernière modification)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: '#334155' }}>
            <input type="checkbox" checked={config.notes_auto_classify !== 'false'} onChange={e => set('notes_auto_classify', e.target.checked ? 'true' : 'false')} />
            Classement global automatique (1 h après la dernière modification)
          </label>
        </div>
      </div>

      <PromptBlock
        title="Prompt d'analyse d'une note"
        hint="Variables : {{TITLE}}, {{CONTENT}}, {{NOTEBOOKS}}, {{DATE}}. L'IA doit renvoyer un JSON (titre, résumé, corrigé, reformulé, tags, carnet, section, mentions, tâches)."
        value={config.notes_analysis_prompt}
        onChange={v => set('notes_analysis_prompt', v)}
        onReset={() => resetPrompt('notes_analysis_prompt')}
      />
      <PromptBlock
        title="Prompt d'extraction des tâches"
        hint="Variables : {{CONTENT}}. Utilisé par le bouton « Proposer des tâches » et la réanalyse. L'IA renvoie un JSON { taches: [{ description, responsable, echeance }] }."
        value={config.notes_task_prompt}
        minHeight={220}
        onChange={v => set('notes_task_prompt', v)}
        onReset={() => resetPrompt('notes_task_prompt')}
      />
      <PromptBlock
        title="Prompt de classement d'un lot de notes"
        hint="Variables : {{NOTES}} (liste #id | titre | tags | résumé). L'IA renvoie une arborescence JSON { carnets: [...] }."
        value={config.notes_classify_prompt}
        onChange={v => set('notes_classify_prompt', v)}
        onReset={() => resetPrompt('notes_classify_prompt')}
      />
      <PromptBlock
        title="Prompt de réorganisation de l'arborescence"
        hint="Variables : {{TREE}} (arborescence actuelle) et {{NOTES}}. L'IA renvoie une arborescence complète réorganisée."
        value={config.notes_reorganize_prompt}
        onChange={v => set('notes_reorganize_prompt', v)}
        onReset={() => resetPrompt('notes_reorganize_prompt')}
      />
      <PromptBlock
        title="Mots vides du nuage de mots"
        hint="Mots ignorés dans le nuage. Séparés par des virgules ou des retours à la ligne."
        value={config.notes_wordcloud_stopwords}
        minHeight={120}
        onChange={v => set('notes_wordcloud_stopwords', v)}
        onReset={() => resetPrompt('notes_wordcloud_stopwords')}
      />
    </div>
  );
};

export default AdminNotes;
