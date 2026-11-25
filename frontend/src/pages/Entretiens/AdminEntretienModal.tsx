import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  X, Loader2, Save, AlertCircle, CheckCircle2, CalendarPlus,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { Campaign, Entretien } from './types';
import AgentSearch from '../../components/AgentSearch';
import type { AgentOption } from '../../components/AgentSearch';
import FreeSlots from './FreeSlots';
import DateTimeQuart from './DateTimeQuart';
import { COLORS, Field, btnGhost, btnPrimary, card, input, textarea } from './ui';

interface DsiAgent {
  username: string; email: string; matricule: string; nom: string; prenom: string;
  direction: string; service: string; poste: string;
}

function todayTime(): string {
  const d = new Date(Math.ceil(Date.now() / 900000) * 900000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fullName = (a: DsiAgent) => `${a.prenom} ${a.nom}`.trim();

export default function AdminEntretienModal({ entretien, prefillAgent, campaigns, defaultCampaignId, onClose, onSaved }: {
  entretien: Entretien | null;
  prefillAgent?: DsiAgent | null;
  campaigns: Campaign[];
  defaultCampaignId?: number;
  onClose: () => void;
  onSaved: (result: { entretien: Entretien; outlook?: any }) => void;
}) {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [form, setForm] = useState({
    campaign_id: entretien?.campaign_id || defaultCampaignId || campaigns[0]?.id || 0,
    agent_nom: entretien?.agent_nom || prefillAgent?.nom || '',
    agent_prenom: entretien?.agent_prenom || prefillAgent?.prenom || '',
    agent_email: entretien?.agent_email || prefillAgent?.email || '',
    agent_username: entretien?.agent_username || prefillAgent?.username || '',
    direction: entretien?.direction || prefillAgent?.direction || '',
    service: entretien?.service || prefillAgent?.service || '',
    poste: entretien?.poste || prefillAgent?.poste || '',
    evaluator_nom: entretien?.evaluator_nom || '',
    evaluator_email: entretien?.evaluator_email || '',
    evaluator_username: entretien?.evaluator_username || '',
    date_entretien: entretien?.date_entretien || todayTime(),
    duree_minutes: entretien?.date_entretien && [60, 90, 120, 150].includes(Number(entretien.duree_minutes)) ? Number(entretien.duree_minutes) : 90,
    lieu: entretien?.lieu || '',
    notes_admin: entretien?.notes_admin || '',
  });

  const [agents, setAgents] = useState<DsiAgent[]>([]);
  const [dirLoading, setDirLoading] = useState(true);
  const [dirError, setDirError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string; webLink?: string | null } | null>(null);

  // Agents évalués ET évaluateurs : uniquement les agents du calendrier DSI.
  useEffect(() => {
    let alive = true;
    axios.get('/api/entretiens/directory', { headers })
      .then(r => { if (alive) setAgents(r.data.agents || []); })
      .catch(e => { if (alive) setDirError(e.response?.data?.message || 'Impossible de charger l’annuaire DSI'); })
      .finally(() => { if (alive) setDirLoading(false); });
    return () => { alive = false; };
  }, [token]);

  const set = (key: keyof typeof form, value: any) => setForm(f => ({ ...f, [key]: value }));

  const agentName = `${form.agent_prenom} ${form.agent_nom}`.trim();

  // Mêmes agents que le sélecteur du module /tickets (composant partagé AgentSearch), limités aux agents DSI.
  const options = useMemo<Array<AgentOption & { raw: DsiAgent }>>(
    () => agents.map(a => ({ username: a.username, displayName: fullName(a), email: a.email, service: a.service, raw: a })),
    [agents]
  );

  const pickAgent = (a: DsiAgent) => setForm(f => ({
    ...f,
    agent_username: a.username, agent_email: a.email, agent_prenom: a.prenom, agent_nom: a.nom,
    direction: a.direction, service: a.service, poste: a.poste,
  }));
  const clearAgent = () => setForm(f => ({ ...f, agent_username: '', agent_email: '', agent_prenom: '', agent_nom: '', direction: '', service: '', poste: '' }));
  const pickEvaluator = (a: DsiAgent) => setForm(f => ({ ...f, evaluator_username: a.username, evaluator_email: a.email, evaluator_nom: fullName(a) }));
  const clearEvaluator = () => setForm(f => ({ ...f, evaluator_username: '', evaluator_email: '', evaluator_nom: '' }));

  const submit = async () => {
    setError(null);
    if (!form.agent_nom.trim()) { setError('Choisissez l’agent évalué.'); return; }
    if (!form.campaign_id) { setError('Sélectionnez une campagne.'); return; }
    if (!form.date_entretien) { setError('La date et l’heure sont requises.'); return; }
    setSaving(true);
    try {
      const payload = { ...form, duree_minutes: Number(form.duree_minutes) || 90 };
      const r = entretien
        ? await axios.put(`/api/entretiens/${entretien.id}`, payload, { headers })
        : await axios.post('/api/entretiens', payload, { headers });
      const outlook = r.data.outlook;
      setResult({
        ok: outlook ? outlook.ok !== false : true,
        message: outlook
          ? (outlook.ok ? 'Entretien enregistré et invitation Outlook envoyée.' : `Entretien enregistré, mais l’invitation Outlook a échoué : ${outlook.error}`)
          : 'Entretien enregistré.',
        webLink: outlook?.webLink || r.data.entretien?.outlook_web_link || null,
      });
      onSaved({ entretien: r.data.entretien, outlook });
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Erreur lors de l’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2100,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto',
    }}>
      <div style={{ ...card, width: '100%', maxWidth: 760, overflow: 'visible' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: 'flex', gap: 9, alignItems: 'center', fontWeight: 800, fontSize: 15, color: COLORS.text }}>
            <CalendarPlus size={18} color={COLORS.primary} />
            {entretien ? 'Modifier l’entretien professionnel' : 'Programmer un entretien professionnel'}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', color: '#475569' }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ padding: '18px 20px 20px' }}>
          {result ? (
            <div>
              <div style={{
                display: 'flex', gap: 9, alignItems: 'flex-start', borderRadius: 10, padding: '12px 14px', fontSize: 13, lineHeight: 1.5,
                background: result.ok ? '#f0fdf4' : '#fffbeb',
                border: `1px solid ${result.ok ? '#bbf7d0' : '#fde68a'}`,
                color: result.ok ? '#166534' : '#92400e',
              }}>
                {result.ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <div>
                  <div>{result.message}</div>
                  {result.webLink && (
                    <a href={result.webLink} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.primary, fontWeight: 600 }}>
                      Ouvrir l’événement Outlook
                    </a>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
                <button style={btnPrimary} onClick={onClose}>Fermer</button>
                {!result.ok && (
                  <button style={btnGhost} disabled={saving} onClick={submit}>
                    {saving ? <Loader2 size={14} /> : <Save size={14} />} Réessayer
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {dirError && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 11px', fontSize: 12, marginBottom: 12 }}>{dirError}</div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Campagne" required>
                  <select style={input} value={form.campaign_id} onChange={e => set('campaign_id', Number(e.target.value))}>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.libelle || `Campagne ${c.annee}`} ({c.statut})</option>)}
                  </select>
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                  <Field label="Agent évalué" required>
                    <AgentSearch key={`agent-${dirLoading}`} agents={options} loading={dirLoading}
                      initialName={agentName} initialEmail={form.agent_email}
                      placeholder="Agent du calendrier DSI…"
                      onSelect={u => pickAgent(u.raw)} onClear={clearAgent} />
                  </Field>
                  <Field label="Évaluateur">
                    <AgentSearch key={`eval-${dirLoading}`} agents={options} loading={dirLoading}
                      initialName={form.evaluator_nom} initialEmail={form.evaluator_email}
                      placeholder="Agent du calendrier DSI…"
                      onSelect={u => pickEvaluator(u.raw)} onClear={clearEvaluator} />
                  </Field>
                </div>

                <div style={grid}>
                  <Field label="Date et heure" required>
                    <DateTimeQuart value={form.date_entretien} onChange={v => set('date_entretien', v)} />
                  </Field>
                  <Field label="Durée (minutes)">
                    <select style={input} value={form.duree_minutes} onChange={e => set('duree_minutes', Number(e.target.value))}>
                      {[60, 90, 120, 150].map(m => <option key={m} value={m}>{m} minutes</option>)}
                    </select>
                  </Field>
                  <Field label="Lieu / visioconférence">
                    <input style={input} placeholder="Bureau, salle, Teams…" value={form.lieu} onChange={e => set('lieu', e.target.value)} />
                  </Field>
                </div>

                <FreeSlots
                  participants={[
                    { email: form.agent_email, name: agentName || form.agent_email },
                    { email: form.evaluator_email, name: form.evaluator_nom || form.evaluator_email },
                  ]}
                  dureeMinutes={Number(form.duree_minutes) || 90}
                  value={form.date_entretien}
                  onPick={start => set('date_entretien', start)}
                />

                <Field label="Notes internes (non visibles par l’agent)" hint="À l’enregistrement, une invitation Outlook est envoyée à l’agent et à l’évaluateur (organisateur : votre compte).">
                  <textarea style={textarea} rows={2} value={form.notes_admin} onChange={e => set('notes_admin', e.target.value)} />
                </Field>
              </div>

              {error && (
                <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, padding: '9px 11px', fontSize: 12.5, marginTop: 12 }}>{error}</div>
              )}

              <div style={{ display: 'flex', gap: 9, marginTop: 16, justifyContent: 'flex-end' }}>
                <button style={btnGhost} disabled={saving} onClick={onClose}>Annuler</button>
                <button style={btnPrimary} disabled={saving} onClick={submit}>
                  {saving ? <Loader2 size={15} /> : <Save size={15} />} {entretien ? 'Enregistrer' : 'Programmer et inviter'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
