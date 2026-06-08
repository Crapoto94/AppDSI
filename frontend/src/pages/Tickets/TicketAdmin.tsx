import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import AutoResolution from '../Admin/AutoResolution';
import ResponseTemplatesAdmin from './ResponseTemplatesAdmin';
import KnowledgeBaseAdmin from './KnowledgeBaseAdmin';
type Tab = 'categories' | 'category_mapping' | 'sla' | 'rules' | 'vip' | 'journal' | 'templates' | 'triggers' | 'technicians' | 'groups' | 'group_mapping' | 'escalade' | 'roles' | 'params' | 'closure' | 'live_config' | 'satisfaction' | 'auto_resolution' | 'response_auto' | 'knowledge_base' | 'teams';

const btn = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer',
  fontSize: 13, fontWeight: 500,
  background: active ? '#6366f1' : '#f1f5f9',
  color: active ? '#fff' : '#475569',
});

export default function TicketAdmin() {
  const [tab, setTab] = useState<Tab>('categories');
  const [categories, setCategories] = useState<any[]>([]);
  const [slas, setSlas] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [triggers, setTriggers] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [liveEnabled, setLiveEnabled] = useState<boolean | null>(null);
  const [liveToggling, setLiveToggling] = useState(false);
  const [liveUseSchedule, setLiveUseSchedule] = useState(false);
  const [liveCalendarId, setLiveCalendarId] = useState<number | null>(null);
  const [liveCalendars, setLiveCalendars] = useState<any[]>([]);
  const [liveScheduleToggling, setLiveScheduleToggling] = useState(false);
  const [liveStats, setLiveStats] = useState<any>(null);
  const [closingMessage, setClosingMessage] = useState('');
  const [closingMessageSaving, setClosingMessageSaving] = useState(false);
  const [waEnabled, setWaEnabled] = useState(false);
  const [waPhoneNumberId, setWaPhoneNumberId] = useState('');
  const [waAccessToken, setWaAccessToken] = useState('');
  const [waSaving, setWaSaving] = useState(false);

  const DAY_NAMES: Record<number, string> = { 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam', 7: 'Dim' };

  // Load live config once
  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get('/api/live/config', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        setLiveEnabled(r.data.live_enabled);
        setLiveUseSchedule(!!r.data.live_use_schedule);
        setLiveCalendarId(r.data.live_calendar_id ?? null);
        setClosingMessage(r.data.closing_message || '');
        setWaEnabled(!!r.data.whatsapp_enabled);
        setWaPhoneNumberId(r.data.whatsapp_phone_number_id || '');
        setWaAccessToken(r.data.whatsapp_access_token || '');
      })
      .catch(() => setLiveEnabled(true));
    axios.get('/api/live/calendars', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setLiveCalendars(r.data || []))
      .catch(() => {});
    axios.get('/api/live/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setLiveStats(r.data))
      .catch(() => {});
  }, []);

  async function toggleLive() {
    if (liveUseSchedule) return; // controlled by schedule
    const token = localStorage.getItem('token');
    const next = !liveEnabled;
    setLiveToggling(true);
    try {
      const r = await axios.put('/api/live/config', { live_enabled: next }, { headers: { Authorization: `Bearer ${token}` } });
      setLiveEnabled(r.data.live_enabled);
    } catch (e) { console.error(e); }
    finally { setLiveToggling(false); }
  }

  async function toggleSchedule() {
    const token = localStorage.getItem('token');
    const next = !liveUseSchedule;
    setLiveScheduleToggling(true);
    try {
      const r = await axios.put('/api/live/config', { live_use_schedule: next, live_calendar_id: liveCalendarId }, { headers: { Authorization: `Bearer ${token}` } });
      setLiveUseSchedule(next);
      setLiveEnabled(r.data.live_enabled);
    } catch (e) { console.error(e); }
    finally { setLiveScheduleToggling(false); }
  }

  async function changeCalendar(calId: number) {
    const token = localStorage.getItem('token');
    setLiveCalendarId(calId);
    try {
      const r = await axios.put('/api/live/config', { live_calendar_id: calId }, { headers: { Authorization: `Bearer ${token}` } });
      setLiveEnabled(r.data.live_enabled);
    } catch (e) { console.error(e); }
  }

  async function saveClosingMessage() {
    const token = localStorage.getItem('token');
    setClosingMessageSaving(true);
    try {
      await axios.put('/api/live/config', { closing_message: closingMessage }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) { console.error(e); }
    finally { setClosingMessageSaving(false); }
  }

  async function saveWhatsAppConfig() {
    const token = localStorage.getItem('token');
    setWaSaving(true);
    try {
      await axios.put('/api/live/config', {
        whatsapp_enabled: waEnabled,
        whatsapp_phone_number_id: waPhoneNumberId,
        whatsapp_access_token: waAccessToken,
      }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) { console.error(e); }
    finally { setWaSaving(false); }
  }

  useEffect(() => {
    switch (tab) {
      case 'categories': loadData('/api/tickets/admin/categories', setCategories); break;
      case 'sla':        loadData('/api/tickets/admin/sla', setSlas); break;
      case 'rules':      loadData('/api/tickets/admin/assignment-rules', setRules); break;
      case 'templates':  loadData('/api/tickets/admin/notification-templates', setTemplates); break;
      case 'triggers':   loadData('/api/tickets/admin/notification-triggers', setTriggers); break;
      case 'technicians':loadData('/api/tickets/admin/technicians', setTechnicians); break;
    }
  }, [tab]);

  async function loadData(url: string, setter: Function) {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      setter(res.data);
    } catch (e) { console.error(e); }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'categories',  label: 'Catégories' },
    { key: 'category_mapping', label: '🗂️ Transposition' },
    { key: 'sla',         label: 'SLA' },
    { key: 'rules',       label: 'Règles' },
    { key: 'vip',         label: '⭐ VIP' },
    { key: 'journal',     label: '📜 Journal' },
    { key: 'templates',   label: 'Templates' },
    { key: 'triggers',    label: 'Déclencheurs' },
    { key: 'technicians', label: 'Équipe' },
    { key: 'groups',      label: '👥 Groupes' },
    { key: 'group_mapping', label: '🔄 Transposition groupes' },
    { key: 'escalade',    label: '⬆️ Escalade' },
    { key: 'roles',       label: '🔐 Rôles' },
    { key: 'params',      label: '⚙️ Paramètres' },
    { key: 'closure',     label: '🔒 Clôture' },
    { key: 'live_config',  label: '🟢 Live' },
    { key: 'auto_resolution', label: '🤖 Résolution auto' },
    { key: 'satisfaction', label: '⭐ Satisfaction' },
    { key: 'response_auto', label: '💬 Réponses auto' },
    { key: 'knowledge_base', label: '📚 Base documentaire' },
    { key: 'teams',          label: '🔄 Teams' },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Administration des tickets</h1>
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={btn(tab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
        {tab === 'categories'  && <CategoryManager data={categories} onUpdate={() => loadData('/api/tickets/admin/categories', setCategories)} />}
        {tab === 'category_mapping' && <CategoryMappingManager />}
        {tab === 'sla'         && <SLAManager data={slas} categories={categories} onUpdate={() => loadData('/api/tickets/admin/sla', setSlas)} />}
        {tab === 'rules'       && <RuleManager data={rules} onUpdate={() => loadData('/api/tickets/admin/assignment-rules', setRules)} />}
        {tab === 'vip'         && <VipManager />}
        {tab === 'journal'     && <JournalTab />}
        {tab === 'templates'   && <TemplateManager data={templates} onUpdate={() => loadData('/api/tickets/admin/notification-templates', setTemplates)} />}
        {tab === 'triggers'    && <TriggerManager data={triggers} onUpdate={() => loadData('/api/tickets/admin/notification-triggers', setTriggers)} />}
        {tab === 'technicians' && <TeamManager data={technicians} onUpdate={() => loadData('/api/tickets/admin/technicians', setTechnicians)} />}
        {tab === 'groups'      && <GroupManager />}
        {tab === 'group_mapping' && <GroupMappingManager />}
        {tab === 'escalade'    && <EscaladeManager />}
        {tab === 'roles'       && <RolePermissionsManager />}
        {tab === 'params'       && <TicketParamsManager />}
        {tab === 'closure'      && <ClosureManager />}
        {tab === 'satisfaction' && <SatisfactionTab />}
        {tab === 'auto_resolution' && <div style={{ margin: -24 }}><AutoResolution /></div>}
        {tab === 'response_auto' && <ResponseTemplatesAdmin />}
        {tab === 'knowledge_base' && <KnowledgeBaseAdmin />}
        {tab === 'teams' && <TeamsConfig />}
        {tab === 'live_config' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── Toggle manuel ─────────────────────────────────────── */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: liveEnabled ? '#f0fdf4' : '#f8fafc',
              border: `1px solid ${liveEnabled ? '#bbf7d0' : '#e2e8f0'}`,
              borderRadius: 12, padding: '14px 20px',
              opacity: liveUseSchedule ? 0.55 : 1,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 2 }}>
                  {liveEnabled ? '🟢 Chat live activé' : '⚫ Chat live désactivé'}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {liveUseSchedule
                    ? 'Contrôlé automatiquement par les horaires du calendrier ci-dessous.'
                    : liveEnabled
                      ? 'Le widget de chat est visible pour tous les utilisateurs.'
                      : 'Le widget de chat est masqué pour tous les utilisateurs.'}
                </div>
              </div>
              <button
                onClick={toggleLive}
                disabled={liveToggling || liveEnabled === null || liveUseSchedule}
                style={{
                  width: 52, height: 28, borderRadius: 14, border: 'none',
                  cursor: liveUseSchedule ? 'not-allowed' : 'pointer',
                  background: liveEnabled ? '#22c55e' : '#cbd5e1',
                  position: 'relative', transition: 'background 0.2s',
                  opacity: liveToggling ? 0.6 : 1,
                }}
                title={liveUseSchedule ? 'Désactiver les horaires automatiques pour contrôler manuellement' : liveEnabled ? 'Désactiver' : 'Activer'}
              >
                <span style={{
                  position: 'absolute', top: 3, left: liveEnabled ? 27 : 3,
                  width: 22, height: 22, borderRadius: '50%', background: '#fff',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s', display: 'block',
                }} />
              </button>
            </div>

            {/* ── Ouverture automatique par horaires ───────────────── */}
            <div style={{
              background: liveUseSchedule ? '#eff6ff' : '#f8fafc',
              border: `1px solid ${liveUseSchedule ? '#bfdbfe' : '#e2e8f0'}`,
              borderRadius: 12, padding: '16px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: liveUseSchedule ? 16 : 0 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 2 }}>
                    🕐 Ouverture automatique par horaires
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Le live s'ouvre et se ferme automatiquement selon les plages horaires du calendrier SLA sélectionné.
                  </div>
                </div>
                <button
                  onClick={toggleSchedule}
                  disabled={liveScheduleToggling}
                  style={{
                    width: 52, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: liveUseSchedule ? '#6366f1' : '#cbd5e1',
                    position: 'relative', transition: 'background 0.2s',
                    opacity: liveScheduleToggling ? 0.6 : 1, flexShrink: 0, marginLeft: 16,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 3, left: liveUseSchedule ? 27 : 3,
                    width: 22, height: 22, borderRadius: '50%', background: '#fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s', display: 'block',
                  }} />
                </button>
              </div>

              {liveUseSchedule && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Calendar selector */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                      Calendrier utilisé
                    </label>
                    <select
                      value={liveCalendarId ?? ''}
                      onChange={e => changeCalendar(Number(e.target.value))}
                      style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', minWidth: 200 }}
                    >
                      <option value="">— Calendrier par défaut —</option>
                      {liveCalendars.map(c => (
                        <option key={c.id} value={c.id}>{c.name}{c.is_default ? ' (défaut)' : ''}</option>
                      ))}
                    </select>
                  </div>

                  {/* Show hours for selected calendar */}
                  {liveCalendars.filter(c => liveCalendarId ? c.id === liveCalendarId : c.is_default).map(cal => (
                    <div key={cal.id}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                        Plages horaires — {cal.name} ({cal.timezone})
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {[1,2,3,4,5,6,7].map(d => {
                          const slots = (cal.hours || []).filter((h: any) => h.day_of_week === d);
                          return (
                            <div key={d} style={{
                              background: slots.length ? '#fff' : '#f1f5f9',
                              border: `1px solid ${slots.length ? '#bfdbfe' : '#e2e8f0'}`,
                              borderRadius: 8, padding: '6px 10px', minWidth: 80, textAlign: 'center',
                            }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: slots.length ? '#1d4ed8' : '#94a3b8', marginBottom: 2 }}>
                                {DAY_NAMES[d]}
                              </div>
                              {slots.length ? slots.map((s: any, i: number) => (
                                <div key={i} style={{ fontSize: 10, color: '#374151' }}>
                                  {s.start_time.substring(0,5)}–{s.end_time.substring(0,5)}
                                </div>
                              )) : (
                                <div style={{ fontSize: 10, color: '#94a3b8' }}>Fermé</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <div style={{ fontSize: 12, color: '#6366f1', background: '#e0e7ff', borderRadius: 8, padding: '8px 12px' }}>
                    💡 Le statut est vérifié toutes les minutes. Les sessions en cours ne sont pas interrompues lors d'une fermeture automatique.
                  </div>
                </div>
              )}
            </div>

            {/* ── Message de fermeture ──────────────────────────────── */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 12, padding: '16px 20px',
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 4 }}>
                💬 Message affiché lorsque le chat est fermé
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                Ce message est affiché aux utilisateurs quand le live chat est désactivé (hors horaires ou fermé manuellement).
              </div>
              <textarea
                value={closingMessage}
                onChange={e => setClosingMessage(e.target.value)}
                placeholder="Ex : Le support live est actuellement fermé. Nos horaires sont du lundi au vendredi de 8h à 17h. Vous pouvez créer un ticket ou nous contacter par email."
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px',
                  border: '1.5px solid #e2e8f0', borderRadius: 8,
                  fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
                  outline: 'none', boxSizing: 'border-box', color: '#1e293b',
                }}
                onFocus={e => (e.target.style.borderColor = '#6366f1')}
                onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
              />
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={saveClosingMessage}
                  disabled={closingMessageSaving}
                  style={{
                    padding: '8px 20px',
                    background: closingMessageSaving ? '#a5b4fc' : '#6366f1',
                    color: '#fff', border: 'none', borderRadius: 8,
                    fontWeight: 600, cursor: 'pointer', fontSize: 13,
                    opacity: closingMessageSaving ? 0.7 : 1,
                  }}
                >
                  {closingMessageSaving ? '⏳ Enregistrement…' : '💾 Enregistrer'}
                </button>
              </div>
            </div>

            {/* ── WhatsApp / Messages d'urgence ────────────────────── */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 12, padding: '16px 20px',
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 4 }}>
                💬 WhatsApp (Meta Cloud API) — Messages d'urgence
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
                Configurez l'API WhatsApp Business pour envoyer des messages d'urgence aux contacts d'astreinte directement depuis le chat live.
              </div>

              {/* Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: 'pointer', userSelect: 'none' }}>
                <div
                  onClick={() => setWaEnabled(v => !v)}
                  style={{
                    width: 44, height: 24, borderRadius: 12, position: 'relative', cursor: 'pointer',
                    background: waEnabled ? '#6366f1' : '#d1d5db', transition: 'background 0.2s',
                  }}>
                  <div style={{
                    position: 'absolute', top: 3, left: waEnabled ? 23 : 3, width: 18, height: 18,
                    borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                  }} />
                </div>
                <span style={{ fontSize: 13, color: '#1e293b', fontWeight: 600 }}>
                  {waEnabled ? '✅ WhatsApp activé' : '⬜ WhatsApp désactivé'}
                </span>
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: waEnabled ? 1 : 0.5, pointerEvents: waEnabled ? 'auto' : 'none' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Phone Number ID
                  </label>
                  <input
                    type="text"
                    value={waPhoneNumberId}
                    onChange={e => setWaPhoneNumberId(e.target.value)}
                    placeholder="Ex : 123456789012345"
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    onFocus={e => (e.target.style.borderColor = '#6366f1')}
                    onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Access Token (Bearer)
                  </label>
                  <input
                    type="password"
                    value={waAccessToken}
                    onChange={e => setWaAccessToken(e.target.value)}
                    placeholder="EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    onFocus={e => (e.target.style.borderColor = '#6366f1')}
                    onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                  />
                </div>
              </div>

              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={saveWhatsAppConfig}
                  disabled={waSaving}
                  style={{
                    padding: '8px 20px',
                    background: waSaving ? '#a5b4fc' : '#6366f1',
                    color: '#fff', border: 'none', borderRadius: 8,
                    fontWeight: 600, cursor: 'pointer', fontSize: 13,
                    opacity: waSaving ? 0.7 : 1,
                  }}
                >
                  {waSaving ? '⏳ Enregistrement…' : '💾 Enregistrer'}
                </button>
              </div>
            </div>

            {/* ── KPIs live chat ────────────────────────────────────── */}
            {liveStats && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>📊 Statistiques des sessions live</div>

                {/* KPI counters row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                  {[
                    { label: 'Total',        value: liveStats.total,            icon: '💬', color: '#6366f1' },
                    { label: 'Ce mois',      value: liveStats.this_month,       icon: '📅', color: '#8b5cf6' },
                    { label: 'Cette semaine',value: liveStats.this_week,        icon: '📆', color: '#3b82f6' },
                    { label: "Aujourd'hui",  value: liveStats.today,            icon: '🌅', color: '#06b6d4' },
                    { label: 'En cours',     value: liveStats.active,           icon: '🟢', color: '#22c55e' },
                    { label: 'Durée moy.',   value: liveStats.avg_duration_min ? `${liveStats.avg_duration_min} min` : '—', icon: '⏱️', color: '#f59e0b' },
                    { label: 'Rép. moy.',    value: liveStats.avg_response_min  ? `${liveStats.avg_response_min} min` : '—', icon: '⚡', color: '#f97316' },
                  ].map(k => (
                    <div key={k.label} style={{
                      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
                      padding: '12px 14px', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 18 }}>{k.icon}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: k.color, lineHeight: 1.2 }}>{k.value}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{k.label}</div>
                    </div>
                  ))}
                </div>

                {/* Daily trend chart */}
                {liveStats.daily?.length > 0 && (
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 10 }}>
                      Évolution des sessions — 30 derniers jours
                    </div>
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={liveStats.daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="lgLive" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={d => d.substring(5)} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip formatter={(v: any) => [v, 'Sessions']} labelFormatter={l => `Jour : ${l}`} />
                        <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} fill="url(#lgLive)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* By tech table */}
                {liveStats.by_tech?.length > 0 && (
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 10 }}>
                      Sessions par technicien
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {liveStats.by_tech.map((t: any) => {
                        const pct = Math.round(t.count / liveStats.total * 100);
                        return (
                          <div key={t.tech} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 120, fontSize: 12, color: '#374151', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.tech || '—'}
                            </div>
                            <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, background: '#6366f1', height: '100%', borderRadius: 6 }} />
                            </div>
                            <div style={{ width: 40, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6366f1' }}>{t.count}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY MANAGER
// ─────────────────────────────────────────────────────────────────────────────
const SUGGESTED_CATEGORIES = [
  { name: '🖥️ Matériel', subs: ['Ordinateurs de bureau', 'Portables', 'Imprimantes', 'Serveurs', 'Écrans', 'Autres équipements'] },
  { name: '📱 Logiciels', subs: ['Systèmes d\'exploitation', 'Bureautique', 'Métier', 'Sécurité', 'Utilitaires', 'Antivirus/Protection'] },
  { name: '🌐 Réseau et Connectivité', subs: ['Connexion Internet', 'WiFi', 'VPN', 'Accès à distance', 'Proxy'] },
  { name: '👤 Utilisateurs et Permissions', subs: ['Création/Suppression de compte', 'Permissions/Droits d\'accès', 'Mot de passe', '2FA/Authentification'] },
  { name: '⚙️ Services IT', subs: ['Email', 'Partage de fichiers', 'Backup/Sauvegarde', 'Serveur d\'impression', 'Services web'] },
  { name: '⚡ Performance', subs: ['Lenteur système', 'Application lente', 'Problème de disque', 'RAM insuffisante', 'Processeur'] },
  { name: '📚 Support et Documentation', subs: ['Formation utilisateur', 'Documentation technique', 'FAQ'] },
];

function CategoryManager({ data, onUpdate }: { data: any[], onUpdate: () => void }) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [icon, setIcon] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);
  const [apps, setApps] = useState<any[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [expandedParent, setExpandedParent] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');

  useEffect(() => {
    if (showSuggest && apps.length === 0) {
      loadApps();
    }
  }, [showSuggest]);

  async function loadApps() {
    setLoadingApps(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/magapp/apps', { headers: { Authorization: `Bearer ${token}` } });
      setApps((res.data || []).filter((a: any) => a.present_magapp === 'oui'));
    } catch (e) {
      console.error('Failed to load apps:', e);
    } finally {
      setLoadingApps(false);
    }
  }

  async function add() {
    if (!name.trim()) return;
    const token = localStorage.getItem('token');
    try {
      const res = await axios.post('/api/tickets/admin/categories', { name, parent_id: parentId ? parseInt(parentId) : null, icon: icon.trim() || null }, { headers: { Authorization: `Bearer ${token}` } });
      setName('');
      setParentId('');
      setIcon('');
      onUpdate();
    } catch (e: any) {
      console.error('Error adding category:', e.response?.data || e.message);
      alert(e.response?.data?.message || 'Erreur lors de l\'ajout');
    }
  }

  async function addSuggested(catName: string, subNames: string[]) {
    const token = localStorage.getItem('token');
    try {
      const catRes = await axios.post('/api/tickets/admin/categories', { name: catName, parent_id: null }, { headers: { Authorization: `Bearer ${token}` } });
      for (const subName of subNames) {
        await axios.post('/api/tickets/admin/categories', { name: subName, parent_id: catRes.data.id }, { headers: { Authorization: `Bearer ${token}` } });
      }
      setShowSuggest(false);
      onUpdate();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de l\'ajout');
    }
  }

  async function addAppAsCategory(app: any, parentId: number) {
    const token = localStorage.getItem('token');
    try {
      await axios.post('/api/tickets/admin/categories', { name: app.name, parent_id: parentId }, { headers: { Authorization: `Bearer ${token}` } });
      setShowSuggest(false);
      onUpdate();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de l\'ajout');
    }
  }

  async function updateCategory(id: number, newName: string, newIcon?: string) {
    if (!newName.trim()) return;
    const token = localStorage.getItem('token');
    try {
      await axios.put(`/api/tickets/admin/categories/${id}`, { name: newName, icon: newIcon !== undefined ? newIcon : undefined }, { headers: { Authorization: `Bearer ${token}` } });
      setEditingId(null);
      setEditName('');
      setEditIcon('');
      onUpdate();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de la modification');
    }
  }

  async function deleteCategory(id: number) {
    if (!confirm('Supprimer cette catégorie ?')) return;
    const token = localStorage.getItem('token');
    try {
      await axios.delete(`/api/tickets/admin/categories/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      onUpdate();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de la suppression');
    }
  }

  const rootCategories = data.filter(c => !c.parent_id);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Catégories et sous-catégories</h3>
        <button onClick={() => setShowSuggest(true)} style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          💡 Ajouter depuis suggestions
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={name} onChange={e => setName(e.target.value)} onKeyPress={e => e.key === 'Enter' && add()} placeholder="Nom de la catégorie"
          style={{ flex: 1, minWidth: 180, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
        <input value={icon} onChange={e => setIcon(e.target.value)} placeholder="Icône (emoji ou lucide)"
          style={{ width: 160, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
        <select value={parentId} onChange={e => setParentId(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff', minWidth: 150 }}>
          <option value="">— Catégorie principale —</option>
          {rootCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={add} style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Ajouter</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rootCategories.map(c => {
          const subs = data.filter(sub => sub.parent_id === c.id);
          return (
            <div key={c.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: 12, background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpandedParent(expandedParent === c.id ? null : c.id)}>
                <div style={{ flex: 1 }}>
                  {editingId === c.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input value={editIcon} onChange={e => setEditIcon(e.target.value)} onClick={e => e.stopPropagation()} placeholder="icone"
                        style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13, width: 70 }} />
                      <input value={editName} onChange={e => setEditName(e.target.value)} onClick={e => e.stopPropagation()}
                        style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13, flex: 1 }}
                        onKeyPress={e => { if (e.key === 'Enter') updateCategory(c.id, editName, editIcon); if (e.key === 'Escape') setEditingId(null); }} />
                    </div>
                  ) : (
                    <strong style={{ fontSize: 14 }}>{c.icon ? <span style={{ marginRight: 6 }}>{c.icon}</span> : null}{c.name}</strong>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                  {editingId === c.id ? (
                    <>
                      <button onClick={() => updateCategory(c.id, editName, editIcon)} style={{ padding: '4px 8px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>✓</button>
                      <button onClick={() => setEditingId(null)} style={{ padding: '4px 8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>✕</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditingId(c.id); setEditName(c.name); setEditIcon(c.icon || ''); }} style={{ padding: '4px 8px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>✎</button>
                      <button onClick={() => deleteCategory(c.id)} style={{ padding: '4px 8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>🗑</button>
                      <span style={{ fontSize: 18, marginLeft: 8 }}>{expandedParent === c.id ? '▼' : '▶'}</span>
                    </>
                  )}
                </div>
              </div>
              {expandedParent === c.id && (
                <div style={{ padding: 12, background: '#fff', borderTop: '1px solid #e2e8f0' }}>
                  {subs.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {subs.map(sub => (
                        <div key={sub.id} style={{ padding: 8, background: '#f1f5f9', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13 }}>↳ {sub.icon ? <span style={{ marginRight: 4 }}>{sub.icon}</span> : null}{sub.name}</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => deleteCategory(sub.id)} style={{ padding: '2px 6px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>🗑</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>Aucune sous-catégorie</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showSuggest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 600, maxHeight: '80vh', overflow: 'auto', width: '90%' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18 }}>Catégories prédéfinies pour le support IT</h3>
            <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              {SUGGESTED_CATEGORIES.map(cat => (
                <div key={cat.name} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <button onClick={() => addSuggested(cat.name, cat.subs)} style={{ width: '100%', textAlign: 'left', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{cat.name}</span> <span>+ Ajouter</span>
                  </button>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 6, marginLeft: 8 }}>
                    {cat.subs.map(sub => <div key={sub} style={{ fontSize: 12, color: '#64748b', padding: '4px 0' }}>↳ {sub}</div>)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: 14 }}>Ou ajouter les logiciels comme sous-catégories</h4>
              {loadingApps && <div style={{ fontSize: 13, color: '#94a3b8' }}>Chargement des logiciels...</div>}
              {!loadingApps && apps.length > 0 && (
                <div style={{ display: 'grid', gap: 6, maxHeight: 300, overflow: 'auto' }}>
                  {apps.map(app => (
                    <div key={app.id} style={{ padding: 8, background: '#f1f5f9', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <span>{app.name}</span>
                      <select onChange={e => { if (e.target.value) addAppAsCategory(app, parseInt(e.target.value)); }} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #cbd5e1' }}>
                        <option value="">Ajouter à...</option>
                        {data.filter(c => !c.parent_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSuggest(false)} style={{ padding: '8px 16px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSPOSITION DES CATÉGORIES (ancienne texte GLPI → nouvelle catégorie)
// ─────────────────────────────────────────────────────────────────────────────
interface CatMapRow { old_category: string; ticket_count: number; category_id: number | null; suggested_category_id?: number | null; _suggested?: boolean; software_id?: number | null; software_name?: string | null; suggested_software_id?: number | null; suggested_software_name?: string | null; }
interface BizApp { id: number; name: string; category_name?: string; icon?: string; }
interface CatRef { id: number; name: string; full_path?: string; parent_id?: number | null; sort_order?: number | null; }

// Aplatit les catégories en ordre arborescent (DFS) avec une profondeur,
// pour afficher la liste déroulante indentée en utilisant le NOM donné par l'utilisateur.
function flattenCatsTree(cats: CatRef[]): Array<CatRef & { depth: number }> {
  const byParent = new Map<number | null, CatRef[]>();
  for (const c of cats) {
    const key = (c.parent_id ?? null) as number | null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }
  const sortFn = (a: CatRef, b: CatRef) =>
    (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.name || '').localeCompare(b.name || '');
  const ids = new Set(cats.map(c => c.id));
  const out: Array<CatRef & { depth: number }> = [];
  const walk = (parentId: number | null, depth: number) => {
    const children = (byParent.get(parentId) || []).slice().sort(sortFn);
    for (const c of children) { out.push({ ...c, depth }); walk(c.id, depth + 1); }
  };
  walk(null, 0);
  // Catégories dont le parent est absent/inactif → rattachées à la racine
  for (const c of cats) {
    if (!out.find(o => o.id === c.id)) {
      const pid = (c.parent_id ?? null) as number | null;
      if (pid == null || !ids.has(pid)) out.push({ ...c, depth: 0 });
    }
  }
  return out;
}
function CategoryMappingManager() {
  const [rows, setRows] = useState<CatMapRow[]>([]);
  const [cats, setCats] = useState<CatRef[]>([]);
  const [apps, setApps] = useState<BizApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [msg, setMsg] = useState('');
  const [pickerFor, setPickerFor] = useState<string | null>(null); // old_category dont on choisit le logiciel
  const [appSearch, setAppSearch] = useState('');
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/tickets/admin/category-mapping/used', { headers: { Authorization: `Bearer ${token}` } });
      // Pré-remplir avec la suggestion auto quand aucun mapping existant
      const r = (res.data.rows || []).map((row: CatMapRow) => ({
        ...row,
        category_id: row.category_id ?? row.suggested_category_id ?? null,
        software_id: row.software_id ?? row.suggested_software_id ?? null,
        software_name: row.software_name ?? row.suggested_software_name ?? null,
        _suggested: row.category_id == null && (row.suggested_category_id != null || row.suggested_software_id != null),
      }));
      setRows(r);
      setCats(res.data.categories || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get('/api/magapp/apps', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setApps((r.data || []).map((a: any) => ({ id: a.id, name: a.name, category_name: a.category_name, icon: a.icon }))))
      .catch(() => {});
  }, []);

  // Affecte un logiciel métier (app magapp) + catégorie Logiciels/Métier
  async function assignSoftware(oldCategory: string, app: BizApp) {
    setPickerFor(null);
    setAppSearch('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/tickets/admin/category-mapping/assign-metier',
        { old_category: oldCategory, software_id: app.id },
        { headers: { Authorization: `Bearer ${token}` } });
      setRows(prev => prev.map(r => r.old_category === oldCategory
        ? { ...r, category_id: res.data.category_id, software_id: app.id, software_name: app.name, _suggested: false }
        : r));
      setMsg(`« ${oldCategory} » → logiciel « ${app.name} » (Logiciels / Métier).`);
    } catch { setMsg('Erreur lors de l\'association au logiciel métier'); }
  }

  async function saveOne(oldCategory: string, categoryId: number | null) {
    setRows(prev => prev.map(r => r.old_category === oldCategory ? { ...r, category_id: categoryId, _suggested: false } : r));
    try {
      const token = localStorage.getItem('token');
      await axios.put('/api/tickets/admin/category-mapping',
        { old_category: oldCategory, category_id: categoryId },
        { headers: { Authorization: `Bearer ${token}` } });
    } catch { setMsg('Erreur lors de l\'enregistrement'); }
  }

  async function saveAllSuggestions() {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      for (const r of rows.filter(r => r._suggested)) {
        if (r.software_id != null) {
          // suggestion logiciel métier → assign-metier (logiciel + catégorie Logiciels/Métier)
          await axios.post('/api/tickets/admin/category-mapping/assign-metier',
            { old_category: r.old_category, software_id: r.software_id },
            { headers: { Authorization: `Bearer ${token}` } });
        } else if (r.category_id != null) {
          await saveOne(r.old_category, r.category_id);
        }
      }
      setRows(prev => prev.map(r => ({ ...r, _suggested: false })));
      setMsg('Suggestions enregistrées.');
    } catch { setMsg('Erreur lors de l\'enregistrement des suggestions'); }
    finally { setSaving(false); }
  }

  async function applyMapping() {
    if (!confirm('Appliquer les correspondances à tous les tickets (renseigne la nouvelle catégorie pour les stats) ?')) return;
    setApplying(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/tickets/admin/category-mapping/apply', {}, { headers: { Authorization: `Bearer ${token}` } });
      setMsg(`Transposition appliquée : ${res.data.updated} ticket(s) mis à jour.`);
    } catch { setMsg('Erreur lors de l\'application'); }
    finally { setApplying(false); }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>;

  const isMapped = (r: CatMapRow) => !r._suggested && r.category_id != null;
  const mappedCount = rows.filter(isMapped).length;
  const displayedRows = onlyUnmapped ? rows.filter(r => !isMapped(r)) : rows;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Transposition des catégories</h3>
          <p style={{ margin: 0, fontSize: 12, color: '#71717a' }}>
            Associez chaque ancienne catégorie GLPI (texte) à une nouvelle catégorie pour les statistiques. {mappedCount}/{rows.length} mappées.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setOnlyUnmapped(v => !v)}
            title="N'afficher que les catégories non mappées"
            style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${onlyUnmapped ? '#fbbf24' : '#e2e8f0'}`, background: onlyUnmapped ? '#fffbeb' : '#fff', color: onlyUnmapped ? '#92400e' : '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {onlyUnmapped ? '☑' : '☐'} Non mappées
          </button>
          <button onClick={saveAllSuggestions} disabled={saving} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {saving ? '…' : '✨ Enregistrer les suggestions'}
          </button>
          <button onClick={applyMapping} disabled={applying} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#2563eb,#4f46e5)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {applying ? '…' : '✅ Appliquer aux tickets'}
          </button>
        </div>
      </div>
      {msg && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#166534', fontSize: 13 }}>{msg}</div>}

      <div style={{ maxHeight: '60vh', overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
              <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700, color: '#475569' }}>Ancienne catégorie (GLPI)</th>
              <th style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 700, color: '#475569', width: 90 }}>Tickets</th>
              <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700, color: '#475569', width: 320 }}>Nouvelle catégorie</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map(r => (
              <tr key={r.old_category} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 12px', color: '#1e293b' }}>{r.old_category}</td>
                <td style={{ padding: '8px 12px', textAlign: 'center', color: '#64748b' }}>{r.ticket_count}</td>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={r.category_id ?? ''}
                    onChange={e => saveOne(r.old_category, e.target.value ? parseInt(e.target.value) : null)}
                    style={{ flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 6, border: `1.5px solid ${r._suggested ? '#c7d2fe' : '#e2e8f0'}`, background: r._suggested ? '#eef2ff' : '#fff', fontSize: 13 }}
                  >
                    <option value="">— Non mappée —</option>
                    {flattenCatsTree(cats).map(c => (
                      <option key={c.id} value={c.id}>
                        {`${'   '.repeat(c.depth)}${c.depth > 0 ? '└ ' : ''}${c.name}`}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => { setPickerFor(r.old_category); setAppSearch(''); }}
                    title="Choisir un logiciel metier (affecte le logiciel au ticket + categorie Logiciels / Metier)"
                    style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    🧩 Logiciel métier
                  </button>
                  </div>
                  {(r.software_name || r._suggested) && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                      {r.software_name && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '1px 8px' }}>🧩 {r.software_name}</span>
                      )}
                      {r._suggested && <span style={{ fontSize: 10, color: '#6366f1', fontWeight: 600 }}>suggestion auto</span>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {displayedRows.length === 0 && <tr><td colSpan={3} style={{ padding: 30, textAlign: 'center', color: '#cbd5e1' }}>{onlyUnmapped ? 'Toutes les catégories sont mappées 🎉' : 'Aucune ancienne catégorie utilisée.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Picker logiciel métier */}
      {pickerFor && (
        <div onClick={() => setPickerFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 500, maxWidth: '92%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Choisir un logiciel métier</h3>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
              « {pickerFor} » → affecte le logiciel aux tickets + catégorie <strong>Logiciels / Métier</strong>
            </div>
            <input autoFocus value={appSearch} onChange={e => setAppSearch(e.target.value)} placeholder="Rechercher un logiciel…"
              style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, marginBottom: 10 }} />
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360 }}>
              {apps.filter(a => !appSearch || a.name.toLowerCase().includes(appSearch.toLowerCase()) || (a.category_name || '').toLowerCase().includes(appSearch.toLowerCase())).map(a => (
                <div key={a.id} onClick={() => assignSoftware(pickerFor, a)}
                  style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: '#f8fafc', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#eef2ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#f8fafc')}>
                  {a.icon && <img src={a.icon} alt="" style={{ width: 18, height: 18, objectFit: 'contain', borderRadius: 4 }} />}
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{a.name}</span>
                  {a.category_name && <span style={{ fontSize: 11, color: '#94a3b8' }}>{a.category_name}</span>}
                </div>
              ))}
              {apps.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13, padding: 12, textAlign: 'center' }}>Aucun logiciel trouvé dans MagApp</div>}
            </div>
            <button onClick={() => setPickerFor(null)} style={{ marginTop: 12, padding: 8, background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLA MANAGER (complet)
// ─────────────────────────────────────────────────────────────────────────────
type SlaTab = 'definitions' | 'calendars' | 'breaches';

function SLAManager({ data: initialData, categories, onUpdate: parentOnUpdate }: { data: any[], categories: any[], onUpdate: () => void }) {
  const [subTab, setSubTab] = useState<SlaTab>('definitions');
  const [definitions, setDefinitions] = useState<any[]>(initialData);
  const [calendars, setCalendars] = useState<any[]>([]);
  const [breaches, setBreaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setDefinitions(initialData); }, [initialData]);

  useEffect(() => {
    if (subTab === 'definitions') refreshDefinitions();
    if (subTab === 'calendars') loadCalendars();
    if (subTab === 'breaches') loadBreaches();
  }, [subTab]);

  async function loadCalendars() {
    setLoading(true); setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/tickets/admin/sla/calendars', { headers: { Authorization: `Bearer ${token}` } });
      setCalendars(res.data);
    } catch (e: any) { setError(e.response?.data?.message || e.message); }
    setLoading(false);
  }

  async function loadBreaches() {
    setLoading(true); setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/tickets/dashboard/sla-breaches', { headers: { Authorization: `Bearer ${token}` } });
      setBreaches(res.data);
    } catch (e: any) { setError(e.response?.data?.message || e.message); }
    setLoading(false);
  }

  async function refreshDefinitions() {
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/tickets/admin/sla', { headers: { Authorization: `Bearer ${token}` } });
      setDefinitions(res.data);
    } catch (e: any) {
      const msg = e.response?.data?.message || e.message;
      setError(`GET /api/tickets/admin/sla → ${msg}`);
    }
  }

  const subTabs: { key: SlaTab; label: string }[] = [
    { key: 'definitions', label: 'Définitions' },
    { key: 'calendars', label: 'Calendriers' },
    { key: 'breaches', label: 'Dépassements' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {subTabs.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)} style={btn(subTab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#dc2626', borderRadius: 8, fontSize: 13, marginBottom: 16, border: '1px solid #fecaca' }}>
          ⚠️ {error}
        </div>
      )}
      {subTab === 'definitions' && <SLADefinitions data={definitions} categories={categories} onUpdate={refreshDefinitions} />}
      {subTab === 'calendars' && <SLACalendars data={calendars} onUpdate={loadCalendars} loading={loading} />}
      {subTab === 'breaches' && <SLABreaches data={breaches} loading={loading} onRefresh={loadBreaches} />}
    </div>
  );
}

// ── SLA Definitions CRUD ──────────────────────────────────────────
const PRIORITY_OPTIONS = [
  { value: '1', label: '1 - Très basse' },
  { value: '2', label: '2 - Basse' },
  { value: '3', label: '3 - Normale' },
  { value: '4', label: '4 - Haute' },
  { value: '5', label: '5 - Critique' },
];

const IMPACT_OPTIONS = [
  { value: '1', label: '1 - Très faible' },
  { value: '2', label: '2 - Faible' },
  { value: '3', label: '3 - Moyen' },
  { value: '4', label: '4 - Fort' },
  { value: '5', label: '5 - Très fort' },
];

const getPriorityLabel = (v: any) => PRIORITY_OPTIONS.find(o => o.value === String(v))?.label || v || '—';
const getImpactLabel = (v: any) => IMPACT_OPTIONS.find(o => o.value === String(v))?.label || v || '—';

function SLADefinitions({ data, categories, onUpdate }: { data: any[], categories: any[], onUpdate: () => void }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', priority: '', impact: '', match_operator: 'AND', first_response_min: '', resolution_min: '', type: '', category_id: '', is_active: true });

  const token = localStorage.getItem('token');
  const h = { Authorization: `Bearer ${token}` };

  function resetForm() { setForm({ name: '', description: '', priority: '', impact: '', match_operator: 'AND', first_response_min: '', resolution_min: '', type: '', category_id: '', is_active: true }); }

  async function create() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await axios.post('/api/tickets/admin/sla', {
        name: form.name, description: form.description,
        priority: form.priority ? parseInt(form.priority) : null,
        impact: form.impact ? parseInt(form.impact) : null,
        match_operator: form.match_operator,
        first_response_min: form.first_response_min ? parseInt(form.first_response_min) : null,
        resolution_min: form.resolution_min ? parseInt(form.resolution_min) : null,
        type: form.type || null,
        category_id: form.category_id ? parseInt(form.category_id) : null,
      }, { headers: h });
      setShowCreate(false);
      resetForm();
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setSaving(false);
  }

  function startEdit(s: any) {
    setEditingId(s.id);
    setForm({
      name: s.name || '', description: s.description || '',
      priority: s.priority?.toString() || '',
      impact: s.impact?.toString() || '',
      match_operator: s.match_operator || 'AND',
      first_response_min: s.first_response_min?.toString() || '',
      resolution_min: s.resolution_min?.toString() || '',
      type: s.type || '',
      category_id: s.category_id?.toString() || '',
      is_active: s.is_active !== false,
    });
  }

  async function saveEdit() {
    if (!editingId || !form.name.trim()) return;
    setSaving(true);
    try {
      await axios.put(`/api/tickets/admin/sla/${editingId}`, {
        name: form.name, description: form.description,
        priority: form.priority ? parseInt(form.priority) : null,
        impact: form.impact ? parseInt(form.impact) : null,
        match_operator: form.match_operator,
        first_response_min: form.first_response_min ? parseInt(form.first_response_min) : null,
        resolution_min: form.resolution_min ? parseInt(form.resolution_min) : null,
        type: form.type || null,
        category_id: form.category_id ? parseInt(form.category_id) : null,
        is_active: form.is_active,
      }, { headers: h });
      setEditingId(null);
      resetForm();
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setSaving(false);
  }

  async function toggleActive(s: any) {
    try {
      await axios.put(`/api/tickets/admin/sla/${s.id}`, { is_active: !s.is_active }, { headers: h });
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function remove(s: any) {
    if (!confirm(`Désactiver « ${s.name} » ?`)) return;
    try {
      await axios.delete(`/api/tickets/admin/sla/${s.id}`, { headers: h });
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  const select = (val: string, set: (v: string) => void, options: { value: string; label: string }[], placeholder = '—') => (
    <select value={val} onChange={e => set(e.target.value)}
      style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff' }}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  const inputStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' };

  const input = (val: string, set: (v: string) => void, extra?: any) => {
    const { style, ...rest } = extra || {};
    return <input value={val} onChange={e => set(e.target.value)} style={{ ...inputStyle, ...(style || {}) }} {...rest} />;
  };

  const catOptions = categories
    .filter((c: any) => !c.parent_id)
    .sort((a: any, b: any) => a.name.localeCompare(b.name))
    .map((c: any) => ({ value: String(c.id), label: c.name }));

  const getCatName = (id: any) => categories.find((c: any) => c.id === id)?.name || '—';

  // Tableau de conversion : jours ouvrés ↔ minutes (8 h/j = 480 min, Lun-Ven)
  const CONVERSION_ROWS = [
    { label: '1 j',         min: 480 },
    { label: '2 j',         min: 960 },
    { label: '3 j',         min: 1440 },
    { label: '5 j (1 sem)', min: 2400 },
    { label: '10 j (2 sem)',min: 4800 },
    { label: '15 j (3 sem)',min: 7200 },
    { label: '20 j (1 mois)',min: 9600 },
    { label: '33 j',        min: 15840 },
    { label: '40 j',        min: 19200 },
    { label: '60 j (3 mois)',min: 28800 },
  ];

  return (
    <div>
      {/* Aide : tableau de conversion jours ouvrés ↔ minutes */}
      <details style={{ marginBottom: 14 }}>
        <summary style={{ fontSize: 12, color: '#6366f1', cursor: 'pointer', fontWeight: 600, userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          📐 Aide — Conversion jours ouvrés → minutes (8 h/j, Lun-Ven)
        </summary>
        <div style={{ marginTop: 8, display: 'inline-block', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#eef2ff' }}>
                <th style={{ padding: '6px 14px', textAlign: 'left', color: '#4338ca', fontWeight: 700, borderBottom: '1px solid #c7d2fe' }}>Jours ouvrés</th>
                <th style={{ padding: '6px 14px', textAlign: 'right', color: '#4338ca', fontWeight: 700, borderBottom: '1px solid #c7d2fe' }}>Minutes à saisir</th>
                <th style={{ padding: '6px 14px', textAlign: 'right', color: '#4338ca', fontWeight: 700, borderBottom: '1px solid #c7d2fe' }}>Heures</th>
              </tr>
            </thead>
            <tbody>
              {CONVERSION_ROWS.map((r, i) => (
                <tr key={r.min} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={{ padding: '5px 14px', color: '#374151', fontWeight: 500 }}>{r.label}</td>
                  <td style={{ padding: '5px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#6366f1' }}>{r.min.toLocaleString('fr-FR')}</td>
                  <td style={{ padding: '5px 14px', textAlign: 'right', color: '#64748b' }}>{(r.min / 60).toFixed(0)} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Définitions SLA</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onUpdate} title="Rafraîchir"
            style={{ padding: '8px 12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            ⟳
          </button>
          <button onClick={() => setShowCreate(true)}
            style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            + Nouveau SLA
          </button>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
            <th style={{ padding: 10, textAlign: 'left', minWidth: 160 }}>Nom</th>
            <th style={{ padding: 10, textAlign: 'center', width: 60 }}>Priorité</th>
            <th style={{ padding: 10, textAlign: 'center', width: 48 }}>ET/OU</th>
            <th style={{ padding: 10, textAlign: 'center', width: 60 }}>Impact</th>
            <th style={{ padding: 10, textAlign: 'center', width: 110 }}>1ère réponse</th>
            <th style={{ padding: 10, textAlign: 'center', width: 110 }}>Résolution</th>
            <th style={{ padding: 10, textAlign: 'center', width: 80 }}>Type</th>
            <th style={{ padding: 10, textAlign: 'center', width: 80 }}>Catégorie</th>
            <th style={{ padding: 10, textAlign: 'center', width: 60 }}>Actif</th>
            <th style={{ padding: 10, textAlign: 'center', width: 90 }}></th>
          </tr>
        </thead>
        <tbody>
          {showCreate && (
            <tr style={{ borderBottom: '1px solid #dbeafe', background: '#eff6ff' }}>
              <td style={{ padding: 8 }}>{input(form.name, v => setForm(f => ({ ...f, name: v })), { placeholder: 'Nom du SLA' })}</td>
              <td style={{ padding: 8 }}>{select(form.priority, v => setForm(f => ({ ...f, priority: v })), PRIORITY_OPTIONS)}</td>
              <td style={{ padding: 8, textAlign: 'center' }}>
                <select value={form.match_operator} onChange={e => setForm(f => ({ ...f, match_operator: e.target.value }))}
                  style={{ padding: '4px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, width: '100%', background: '#fff', textAlign: 'center', fontWeight: 700, color: '#6366f1' }}>
                  <option value="AND">ET</option>
                  <option value="OR">OU</option>
                </select>
              </td>
              <td style={{ padding: 8 }}>{select(form.impact, v => setForm(f => ({ ...f, impact: v })), IMPACT_OPTIONS)}</td>
              <td style={{ padding: 8 }}>{input(form.first_response_min, v => setForm(f => ({ ...f, first_response_min: v })), { placeholder: 'min', style: { textAlign:'center', width: '100%' } })}</td>
              <td style={{ padding: 8 }}>{input(form.resolution_min, v => setForm(f => ({ ...f, resolution_min: v })), { placeholder: 'min', style: { textAlign:'center', width: '100%' } })}</td>
              <td style={{ padding: 8 }}>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  style={{ padding: '6px 6px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, width: '100%', background: '#fff' }}>
                  <option value="">—</option>
                  <option value="1">Incident</option>
                  <option value="2">Demande</option>
                </select>
              </td>
              <td style={{ padding: 8 }}>{select(form.category_id, v => setForm(f => ({ ...f, category_id: v })), catOptions)}</td>
              <td style={{ padding: 8, textAlign: 'center' }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              </td>
              <td style={{ padding: 8, textAlign: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={create} disabled={saving}
                    style={{ padding: '5px 10px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✓</button>
                  <button onClick={() => { setShowCreate(false); resetForm(); }}
                    style={{ padding: '5px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✕</button>
                </div>
              </td>
            </tr>
          )}
          {data.map(s => {
            const isEditing = editingId === s.id;
            return (
              <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9', background: isEditing ? '#fffbeb' : undefined }}>
                {isEditing ? (
                  <>
                    <td style={{ padding: 8 }}>{input(form.name, v => setForm(f => ({ ...f, name: v })))}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{select(form.priority, v => setForm(f => ({ ...f, priority: v })), PRIORITY_OPTIONS)}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <select value={form.match_operator} onChange={e => setForm(f => ({ ...f, match_operator: e.target.value }))}
                        style={{ padding: '4px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, width: '100%', background: '#fff', textAlign: 'center', fontWeight: 700, color: '#6366f1' }}>
                        <option value="AND">ET</option>
                        <option value="OR">OU</option>
                      </select>
                    </td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{select(form.impact, v => setForm(f => ({ ...f, impact: v })), IMPACT_OPTIONS)}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{input(form.first_response_min, v => setForm(f => ({ ...f, first_response_min: v })), { style: { textAlign:'center', width: '100%' } })}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{input(form.resolution_min, v => setForm(f => ({ ...f, resolution_min: v })), { style: { textAlign:'center', width: '100%' } })}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                        style={{ padding: '4px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, background: '#fff' }}>
                        <option value="">—</option>
                        <option value="1">Incident</option>
                        <option value="2">Demande</option>
                      </select>
                    </td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{select(form.category_id, v => setForm(f => ({ ...f, category_id: v })), catOptions)}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                    </td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={saveEdit} disabled={saving}
                          style={{ padding: '4px 8px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>✓</button>
                        <button onClick={() => setEditingId(null)}
                          style={{ padding: '4px 8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>✕</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: 10, fontWeight: 500 }}>{s.name}</td>
                    <td style={{ padding: 10, textAlign: 'center' }}>
                      {s.priority ? <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{getPriorityLabel(s.priority)}</span> : '—'}
                    </td>
                    <td style={{ padding: 10, textAlign: 'center' }}>
                      {s.priority || s.impact ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: s.match_operator === 'OR' ? '#f59e0b' : '#6366f1' }}>
                          {s.match_operator === 'OR' ? 'OU' : 'ET'}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: 10, textAlign: 'center' }}>
                      {s.impact ? <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{getImpactLabel(s.impact)}</span> : '—'}
                    </td>
                    <td style={{ padding: 10, textAlign: 'center' }}>{s.first_response_min ? `${s.first_response_min} min` : '—'}</td>
                    <td style={{ padding: 10, textAlign: 'center' }}>{s.resolution_min ? `${(s.resolution_min / 60).toFixed(1)}h` : '—'}</td>
                    <td style={{ padding: 10, textAlign: 'center' }}>{s.type === '1' ? 'Incident' : s.type === '2' ? 'Demande' : '—'}</td>
                    <td style={{ padding: 10, textAlign: 'center' }}>{s.category_id ? <span style={{ background: '#e0f2fe', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{getCatName(s.category_id)}</span> : '—'}</td>
                    <td style={{ padding: 10, textAlign: 'center' }}>
                      <span onClick={() => toggleActive(s)} style={{ cursor: 'pointer', color: s.is_active ? '#22c55e' : '#ef4444', fontWeight: 600, userSelect: 'none' }}>
                        {s.is_active ? '✓ Oui' : '✕ Non'}
                      </span>
                    </td>
                    <td style={{ padding: 10, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => startEdit(s)}
                          style={{ padding: '4px 10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✎</button>
                        <button onClick={() => remove(s)}
                          style={{ padding: '4px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>🗑</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
          {data.length === 0 && !showCreate && (
            <tr><td colSpan={10} style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Aucune définition SLA</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── SLA Calendars ──────────────────────────────────────────────────
function SLACalendars({ data, onUpdate, loading }: { data: any[], onUpdate: () => void, loading: boolean }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTz, setEditTz] = useState('');
  const [addingHour, setAddingHour] = useState<number | null>(null);
  const [hourDay, setHourDay] = useState('1');
  const [hourStart, setHourStart] = useState('08:00');
  const [hourEnd, setHourEnd] = useState('12:00');

  const token = localStorage.getItem('token');
  const h = { Authorization: `Bearer ${token}` };

  const DAY_LABELS = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await axios.post('/api/tickets/admin/sla/calendars', { name }, { headers: h });
      setName('');
      setShowCreate(false);
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setSaving(false);
  }

  function startEdit(c: any) {
    setEditingId(c.id);
    setEditName(c.name || '');
    setEditDesc(c.description || '');
    setEditTz(c.timezone || 'Europe/Paris');
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    try {
      await axios.put(`/api/tickets/admin/sla/calendars/${editingId}`, { name: editName, description: editDesc, timezone: editTz }, { headers: h });
      setEditingId(null);
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setSaving(false);
  }

  async function addHour(calendarId: number) {
    setSaving(true);
    try {
      await axios.post(`/api/tickets/admin/sla/calendars/${calendarId}/hours`, { day_of_week: parseInt(hourDay), start_time: hourStart, end_time: hourEnd }, { headers: h });
      setAddingHour(null);
      setHourDay('1'); setHourStart('08:00'); setHourEnd('12:00');
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setSaving(false);
  }

  async function deleteHour(calendarId: number, hourId: number) {
    if (!confirm('Supprimer cette plage horaire ?')) return;
    try {
      await axios.delete(`/api/tickets/admin/sla/calendars/${calendarId}/hours/${hourId}`, { headers: h });
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Calendriers SLA</h3>
        <button onClick={() => setShowCreate(true)}
          style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          + Nouveau calendrier
        </button>
      </div>

      {showCreate && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, padding: 12, background: '#eff6ff', borderRadius: 8, border: '1px solid #dbeafe' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du calendrier"
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
          <button onClick={create} disabled={saving}
            style={{ padding: '8px 16px', background: saving ? '#94a3b8' : '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            {saving ? '...' : 'Créer'}
          </button>
          <button onClick={() => { setShowCreate(false); setName(''); }}
            style={{ padding: '8px 16px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Annuler</button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {data.map(c => (
            <div key={c.id} style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}>
              {editingId === c.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nom"
                    style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
                  <input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description"
                    style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Fuseau:</span>
                    <input value={editTz} onChange={e => setEditTz(e.target.value)}
                      style={{ flex: 1, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditingId(null)}
                      style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 }}>Annuler</button>
                    <button onClick={saveEdit} disabled={saving}
                      style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: saving ? '#94a3b8' : '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                      {saving ? '...' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {c.description || '—'} · {c.timezone || 'Europe/Paris'}
                        {c.is_default && <span style={{ marginLeft: 8, color: '#6366f1', fontWeight: 600 }}>Défaut</span>}
                      </div>
                    </div>
                    <button onClick={() => startEdit(c)} style={{ padding: '4px 10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>✎ Modifier</button>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {(c.hours || []).map((hSlot: any) => (
                      <span key={hSlot.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#eef2ff', color: '#6366f1', borderRadius: 6, fontSize: 12 }}>
                        {DAY_LABELS[hSlot.day_of_week] || `J${hSlot.day_of_week}`} {hSlot.start_time?.substring(0, 5)}-{hSlot.end_time?.substring(0, 5)}
                        <button onClick={() => deleteHour(c.id, hSlot.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14, padding: 0, marginLeft: 2, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>

                  {addingHour === c.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: 8, background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <select value={hourDay} onChange={e => setHourDay(e.target.value)}
                        style={{ padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, background: '#fff' }}>
                        {[1, 2, 3, 4, 5, 6, 7].map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                      </select>
                      <input type="time" value={hourStart} onChange={e => setHourStart(e.target.value)}
                        style={{ padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12 }} />
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>-</span>
                      <input type="time" value={hourEnd} onChange={e => setHourEnd(e.target.value)}
                        style={{ padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12 }} />
                      <button onClick={() => addHour(c.id)} disabled={saving}
                        style={{ padding: '4px 10px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>+</button>
                      <button onClick={() => setAddingHour(null)}
                        style={{ padding: '4px 8px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingHour(c.id)} style={{ padding: '4px 10px', background: 'none', border: '1px dashed #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#64748b' }}>
                      + Ajouter une plage horaire
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          {data.length === 0 && !loading && (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Aucun calendrier</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SLA Breaches ────────────────────────────────────────────────────
function SLABreaches({ data, loading, onRefresh }: { data: any[], loading: boolean, onRefresh: () => void }) {
  const [slaChecking, setSlaChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    warning: { label: 'Alerte', color: '#f59e0b', bg: '#fffbeb' },
    breached: { label: 'Dépassé', color: '#ef4444', bg: '#fef2f2' },
  };
  const BREACH_LABELS: Record<string, string> = {
    first_response: '1ère réponse',
    resolution: 'Résolution',
  };

  async function handleCheckSla() {
    setSlaChecking(true);
    setCheckMsg(null);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/tickets/admin/sla/check', {}, { headers: { Authorization: `Bearer ${token}` } });
      setCheckMsg(`✅ ${res.data.message} (${res.data.breaches} dépassement(s))`);
      onRefresh();
    } catch (e: any) {
      setCheckMsg(`❌ Erreur : ${e.response?.data?.message || e.message}`);
    }
    setSlaChecking(false);
  }

  async function handleResetSla() {
    if (!confirm('Réinitialiser tous les SLA ?\n\nLes statuts SLA existants seront purgés, puis recalculés uniquement pour les définitions ACTIVES.')) return;
    setSlaChecking(true);
    setCheckMsg(null);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/tickets/admin/sla/reset', {}, { headers: { Authorization: `Bearer ${token}` } });
      setCheckMsg(`✅ ${res.data.message} — ${res.data.purged} purgé(s), ${res.data.breaches} dépassement(s) actif(s)`);
      onRefresh();
    } catch (e: any) {
      setCheckMsg(`❌ Erreur : ${e.response?.data?.message || e.message}`);
    }
    setSlaChecking(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Dépassements SLA actifs</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleResetSla}
            disabled={slaChecking}
            title="Purge les statuts SLA existants puis recalcule pour les définitions actives"
            style={{
              padding: '8px 16px', background: '#fff', color: '#dc2626',
              border: '1px solid #fecaca', borderRadius: 6,
              cursor: 'pointer', fontWeight: 600, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 6, opacity: slaChecking ? 0.7 : 1,
            }}
          >
            ♻️ Réinitialiser les SLA
          </button>
          <button
            onClick={handleCheckSla}
            disabled={slaChecking}
            style={{
              padding: '8px 16px',
              background: slaChecking ? '#a5b4fc' : '#6366f1',
              color: '#fff', border: 'none', borderRadius: 6,
              cursor: 'pointer', fontWeight: 600, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: slaChecking ? 0.7 : 1,
            }}
          >
            {slaChecking ? '⏳ Vérification…' : '🔍 Vérifier les SLA maintenant'}
          </button>
        </div>
      </div>
      {checkMsg && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: checkMsg.startsWith('✅') ? '#f0fdf4' : '#fef2f2', border: `1px solid ${checkMsg.startsWith('✅') ? '#bbf7d0' : '#fecaca'}`, borderRadius: 8, fontSize: 13, color: checkMsg.startsWith('✅') ? '#166534' : '#dc2626' }}>
          {checkMsg}
        </div>
      )}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {data.map(s => {
            const st = STATUS_LABELS[s.sla_status] || { label: s.sla_status, color: '#64748b', bg: '#f1f5f9' };
            return (
              <div key={s.id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
                  {st.label}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    <a href={`/tickets/${s.glpi_id}`} style={{ color: '#6366f1', textDecoration: 'none' }}>#{s.glpi_id}</a>
                    {' — '}{s.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    <span style={{ fontWeight: 500, color: '#ef4444' }}>{s.sla_name}</span>
                    {' · '}
                    <span style={{ fontWeight: 500, color: s.breach_type === 'first_response' ? '#dc2626' : s.breach_type === 'resolution' ? '#ea580c' : '#64748b' }}>
                      {BREACH_LABELS[s.breach_type] || s.breach_type}
                    </span>
                    {' · Statut: '}{s.status_label || `#${s.status}`}
                    {s.first_response_target && (
                      <span style={{ color: s.breach_type === 'first_response' ? '#dc2626' : undefined, fontWeight: s.breach_type === 'first_response' ? 600 : undefined }}>
                        {' · 1ère réponse: '}{new Date(s.first_response_target).toLocaleString('fr-FR')}
                      </span>
                    )}
                    {s.resolution_target && (
                      <span style={{ color: s.breach_type === 'resolution' ? '#ea580c' : undefined, fontWeight: s.breach_type === 'resolution' ? 600 : undefined }}>
                        {' · Résolution: '}{new Date(s.resolution_target).toLocaleString('fr-FR')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {data.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
              ✅ Aucun dépassement SLA en cours
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// JOURNAL TAB
// ─────────────────────────────────────────────────────────────────────────────
function JournalTab() {
  const token = localStorage.getItem('token');
  const h = { Authorization: `Bearer ${token}` };
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 100;
  const [filterAction, setFilterAction] = useState('');
  const [filterTicket, setFilterTicket] = useState('');

  useEffect(() => { loadJournal(); }, [page]);

  async function loadJournal() {
    setLoading(true);
    try {
      let offset = page * PAGE_SIZE;
      let url = `/api/tickets/admin/journal?limit=${PAGE_SIZE}&offset=${offset}`;
      const res = await axios.get(url, { headers: h });
      setRows(res.data.rows || []);
      setTotal(res.data.total || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  const filtered = rows.filter(r => {
    if (filterAction && !(r.action || '').toLowerCase().includes(filterAction.toLowerCase())) return false;
    if (filterTicket && !String(r.ticket_id).includes(filterTicket) && !(r.ticket_title || '').toLowerCase().includes(filterTicket.toLowerCase())) return false;
    return true;
  });

  function formatAction(action: string): { label: string; color: string; icon: string } {
    switch (action) {
      case 'created': return { label: 'Créé', color: '#6366f1', icon: '✦' };
      case 'status_changed': return { label: 'Statut modifié', color: '#f59e0b', icon: '↻' };
      case 'assigned': return { label: 'Assigné', color: '#3b82f6', icon: '👤' };
      case 'assigned_group': return { label: 'Assigné (groupe)', color: '#3b82f6', icon: '👥' };
      case 'priority_changed': return { label: 'Priorité modifiée', color: '#ef4444', icon: '🔺' };
      case 'type_changed': return { label: 'Type modifié', color: '#8b5cf6', icon: '📋' };
      case 'category_changed': return { label: 'Catégorie modifiée', color: '#14b8a6', icon: '📁' };
      case 'set_vip': return { label: 'VIP activé', color: '#d97706', icon: '⭐' };
      case 'tag_added': return { label: 'Tag ajouté', color: '#6366f1', icon: '🏷' };
      case 'comment_added': return { label: 'Commentaire', color: '#22c55e', icon: '💬' };
      case 'closed': return { label: 'Fermé', color: '#64748b', icon: '✓' };
      default: return { label: action, color: '#64748b', icon: '•' };
    }
  }

  function formatFieldLabel(field: string): string {
    const map: Record<string, string> = {
      status: 'Statut', priority: 'Priorité', type: 'Type', category_id: 'Catégorie',
      technician_id: 'Technicien', group_id: 'Groupe', is_vip: 'VIP', tag: 'Tag',
    };
    return map[field] || field;
  }

  const STATUS_MAP: Record<string, string> = {
    '1': 'Nouveau', '2': 'En cours (attribué)', '3': 'En cours (planifié)', '4': 'En attente', '5': 'Résolu', '6': 'Clos', '8': 'Rejeté',
  };

  const PRIORITY_MAP: Record<string, string> = {
    '1': 'Très basse', '2': 'Basse', '3': 'Moyenne', '4': 'Haute', '5': 'Très haute',
  };

  function formatValue(field: string, val: string): string {
    if (field === 'status') return STATUS_MAP[val] || val;
    if (field === 'priority') return PRIORITY_MAP[val] || val;
    return val;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>📜 Journal des tickets</h3>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
        Historique séquentiel de toutes les actions sur les tickets ({total} entrées)
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={filterAction} onChange={e => setFilterAction(e.target.value)} placeholder="Filtrer par action..."
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
        <input value={filterTicket} onChange={e => setFilterTicket(e.target.value)} placeholder="Filtrer par ticket (# ou titre)..."
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chargement...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Aucune entrée</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {filtered.map(r => {
            const a = formatAction(r.action);
            const isAuto = !r.user_id || r.user_name === 'Système';
            return (
              <div key={r.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f5f9', alignItems: 'flex-start' }}>
                <div style={{ width: 32, textAlign: 'center', flexShrink: 0, fontSize: 16, paddingTop: 2 }}>{a.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: a.color }}>{a.label}</span>
                    <span style={{ fontSize: 12, color: '#6366f1', cursor: 'pointer' }} title={r.ticket_title}>
                      #{r.ticket_id}
                    </span>
                    {r.ticket_title && <span style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{r.ticket_title}</span>}
                  </div>
                  {(r.field_name || r.comment) && (
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                      {r.field_name && (
                        <>
                          <span style={{ fontWeight: 600 }}>{formatFieldLabel(r.field_name)}</span>
                          {r.old_value !== null && r.old_value !== '' && <span> : {formatValue(r.field_name, r.old_value)}</span>}
                          {r.new_value !== null && r.new_value !== '' && <span> → <strong>{formatValue(r.field_name, r.new_value)}</strong></span>}
                        </>
                      )}
                      {r.comment && <span> — {r.comment}</span>}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 120 }}>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {r.created_at ? new Date(r.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                  <div style={{ fontSize: 11, color: isAuto ? '#94a3b8' : '#475569', fontStyle: isAuto ? 'italic' : 'normal' }}>
                    {isAuto ? '🤖 Automatique' : `👤 ${r.user_name}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
            style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}>← Précédent</button>
          <span style={{ fontSize: 13, color: '#64748b' }}>Page {page + 1} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
            style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.5 : 1 }}>Suivant →</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIP MANAGER
// ─────────────────────────────────────────────────────────────────────────────
function VipManager() {
  const token = localStorage.getItem('token');
  const h = { Authorization: `Bearer ${token}` };
  const [vipUsers, setVipUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [adResults, setAdResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);

  useEffect(() => { loadVipUsers(); }, []);

  function loadVipUsers() {
    axios.get('/api/tickets/admin/vip-users', { headers: h }).then(r => setVipUsers(r.data)).catch(() => {});
  }

  async function searchAD() {
    if (!search.trim()) return;
    setSearching(true);
    setAdResults([]);
    try {
      const res = await axios.get('/api/ad/search', { headers: h, params: { q: search.trim() } });
      setAdResults(res.data || []);
    } catch { setAdResults([]); }
    setSearching(false);
  }

  async function addVip(user: any) {
    setAdding(user.id || 0);
    try {
      await axios.post('/api/tickets/admin/vip-users', {
        user_id: user.id || null,
        username: user.sAMAccountName || user.username || user.mail?.split('@')[0],
        display_name: user.displayName || user.cn || user.name || '',
        email: user.mail || user.email || '',
      }, { headers: h });
      loadVipUsers();
      setSearch('');
      setAdResults([]);
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setAdding(null);
  }

  async function removeVip(id: number) {
    if (!confirm('Retirer cet utilisateur VIP ?')) return;
    try {
      await axios.delete(`/api/tickets/admin/vip-users/${id}`, { headers: h });
      loadVipUsers();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  const [applying, setApplying] = useState(false);
  async function applyVipToAll() {
    if (!confirm('Ré-appliquer le caractère VIP à tous les tickets dont le demandeur est VIP/élu ?\n(À lancer notamment après une récupération GLPI.)')) return;
    setApplying(true);
    try {
      const res = await axios.post('/api/tickets/admin/vip-users/apply-all', {}, { headers: h });
      alert(`✅ ${res.data?.flagged ?? 0} ticket(s) marqué(s) VIP (sur ${res.data?.scanned ?? 0} analysés).`);
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setApplying(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>⭐ Utilisateurs VIP</h3>
        <button onClick={applyVipToAll} disabled={applying}
          title="Marque comme VIP tous les tickets dont le demandeur est VIP/élu (à lancer après une récupération GLPI)"
          style={{ padding: '8px 14px', background: applying ? '#a5b4fc' : '#15803d', color: '#fff', border: 'none', borderRadius: 6, cursor: applying ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13 }}>
          {applying ? 'Application…' : '🔄 Appliquer VIP à tous les tickets'}
        </button>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
        Les utilisateurs VIP sont automatiquement détectés lors de la création de tickets. Les élus de Param Ville sont hérités automatiquement et ne peuvent pas être retirés ici.
        Le bouton ci-dessus ré-applique le caractère VIP à l'ensemble des tickets existants (utile après une récupération GLPI qui réinitialise le flag).
      </p>

      {/* Search AD */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchAD()}
          placeholder="Rechercher dans l'AD (nom, prénom, email...)"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
        <button onClick={searchAD} disabled={searching}
          style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: searching ? 0.6 : 1 }}>
          {searching ? 'Recherche...' : 'Rechercher'}
        </button>
      </div>

      {/* AD search results */}
      {adResults.length > 0 && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: '#f8fafc', fontSize: 12, fontWeight: 600, color: '#64748b' }}>
            Résultats AD ({adResults.length})
          </div>
          <div style={{ maxHeight: 250, overflow: 'auto' }}>
            {adResults.map((u, i) => {
              const username = u.sAMAccountName || u.username || u.mail?.split('@')[0] || '';
              const alreadyVip = vipUsers.some(v => v.username?.toLowerCase() === username.toLowerCase());
              return (
                <div key={i} style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{u.displayName || u.cn || u.name}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{username}</span>
                    {(u.mail || u.email) && <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{u.mail || u.email}</span>}
                  </div>
                  {alreadyVip ? (
                    <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Déjà VIP</span>
                  ) : (
                    <button onClick={() => addVip(u)} disabled={adding !== null}
                      style={{ padding: '4px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                      + Ajouter VIP
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIP users list */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
        Utilisateurs VIP ({vipUsers.length})
        <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 8, fontSize: 12 }}>
          — les élus de Param Ville sont automatiquement hérités ⭐
        </span>
      </div>
      {vipUsers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 13 }}>
          Aucun utilisateur VIP. Recherchez dans l'AD pour en ajouter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {vipUsers.map(v => {
            const isElu = v.is_elu;
            return (
              <div key={v.id} style={{ padding: '10px 14px', background: isElu ? '#f0fdf4' : '#fffbeb', border: `1px solid ${isElu ? '#86efac' : '#fde68a'}`, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>⭐ {v.display_name || v.username}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>@{v.username}</span>
                  {v.email && <span style={{ fontSize: 12, color: '#94a3b8' }}>{v.email}</span>}
                  {isElu && (
                    <span style={{ fontSize: 11, background: '#dcfce7', color: '#16a34a', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                      🏛️ Élu (hérité)
                    </span>
                  )}
                </div>
                {!isElu && (
                  <button onClick={() => removeVip(v.id)}
                    style={{ padding: '4px 10px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    Retirer
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE MANAGER
// ─────────────────────────────────────────────────────────────────────────────
function RuleManager({ data, onUpdate }: { data: any[], onUpdate: () => void }) {
  const token = localStorage.getItem('token');
  const h = { Authorization: `Bearer ${token}` };
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);

  const [form, setForm] = useState({
    name: '', match_type: 'any', match_value: '', assign_type: 'group', assign_to_id: 0, assign_to_value: '', priority: 0, is_active: true,
  });

  useEffect(() => {
    axios.get('/api/tickets/admin/categories', { headers: h }).then(r => setCategories(r.data)).catch(() => {});
    axios.get('/api/tickets/admin/technicians', { headers: h }).then(r => setTechnicians(r.data)).catch(() => {});
    axios.get('/api/tickets/admin/groups', { headers: h }).then(r => setGroups(r.data)).catch(() => {});
  }, []); // eslint-disable-line

  const sortedCategories = React.useMemo(() => {
    const parents = categories.filter(c => !c.parent_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));
    const result: any[] = [];
    for (const p of parents) {
      result.push(p);
      const children = categories.filter(c => c.parent_id === p.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));
      result.push(...children);
    }
    const orphans = categories.filter(c => c.parent_id && !parents.find(p => p.id === c.parent_id));
    result.push(...orphans);
    return result;
  }, [categories]);

  function startCreate() {
    setIsNew(true); setEditingId(null);
    setForm({ name: '', match_type: 'any', match_value: '', assign_type: 'group', assign_to_id: 0, assign_to_value: '', priority: data.length, is_active: true });
  }

  function startEdit(r: any) {
    setIsNew(false); setEditingId(r.id);
    setForm({
      name: r.name || '', match_type: r.match_type || 'any', match_value: r.match_value || '',
      assign_type: r.assign_type || 'group', assign_to_id: r.assign_to_id || 0, assign_to_value: r.assign_to_value || '',
      priority: r.priority || 0, is_active: r.is_active !== false,
    });
  }

  function cancel() { setEditingId(null); setIsNew(false); }

  async function save() {
    setSaving(true);
    try {
      if (isNew) {
        await axios.post('/api/tickets/admin/assignment-rules', form, { headers: h });
      } else {
        await axios.put(`/api/tickets/admin/assignment-rules/${editingId}`, form, { headers: h });
      }
      cancel();
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setSaving(false);
  }

  async function remove(id: number) {
    if (!confirm('Supprimer cette règle ?')) return;
    try {
      await axios.delete(`/api/tickets/admin/assignment-rules/${id}`, { headers: h });
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function toggleActive(r: any) {
    try {
      await axios.put(`/api/tickets/admin/assignment-rules/${r.id}`, { ...r, is_active: !r.is_active }, { headers: h });
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  function setField(key: string, value: any) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  const matchTypeOptions = [
    { value: 'any', label: 'Tous les tickets' },
    { value: 'category', label: 'Catégorie' },
    { value: 'priority', label: 'Priorité' },
    { value: 'type', label: 'Type' },
    { value: 'title_contains', label: 'Titre contient' },
    { value: 'requester', label: 'Demandeur' },
    { value: 'source', label: 'Source' },
    { value: 'vip_requester', label: 'Demandeur VIP' },
  ];

  const priorityOptions = [
    { value: '1', label: 'Très basse' }, { value: '2', label: 'Basse' },
    { value: '3', label: 'Moyenne' }, { value: '4', label: 'Haute' }, { value: '5', label: 'Très haute' },
  ];

  const typeOptions = [
    { value: '1', label: 'Incident' }, { value: '2', label: 'Demande' },
  ];

  const sourceOptions = [
    { value: 'hub', label: 'Hub (formulaire)' },
    { value: 'magapp', label: 'MagApp' },
    { value: 'live', label: 'Live chat' },
    { value: 'glpi', label: 'GLPI (importé)' },
  ];

  function renderMatchValueSelect() {
    if (form.match_type === 'category') {
      return (
        <select value={form.match_value} onChange={e => setField('match_value', e.target.value)} style={selectStyle}>
          <option value="">— Choisir une catégorie —</option>
          {sortedCategories.map((c: any) => (
            <option key={c.id} value={String(c.id)}>
              {c.parent_id ? '  └ ' : ''}{c.full_path || c.name}
            </option>
          ))}
        </select>
      );
    }
    if (form.match_type === 'priority') {
      return (
        <select value={form.match_value} onChange={e => setField('match_value', e.target.value)} style={selectStyle}>
          <option value="">— Choisir une priorité —</option>
          {priorityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (form.match_type === 'type') {
      return (
        <select value={form.match_value} onChange={e => setField('match_value', e.target.value)} style={selectStyle}>
          <option value="">— Choisir un type —</option>
          {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (form.match_type === 'source') {
      return (
        <select value={form.match_value} onChange={e => setField('match_value', e.target.value)} style={selectStyle}>
          <option value="">— Choisir une source —</option>
          {sourceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (form.match_type === 'title_contains') {
      return (
        <input value={form.match_value} onChange={e => setField('match_value', e.target.value)}
          placeholder="Texte à rechercher (insensible à la casse et aux accents)"
          style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
      );
    }
    if (form.match_type === 'requester') {
      return (
        <input value={form.match_value} onChange={e => setField('match_value', e.target.value)}
          placeholder="Nom ou email du demandeur"
          style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
      );
    }
    if (form.match_type === 'vip_requester') {
      return <span style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', padding: '4px 10px', borderRadius: 6 }}>Demandeur présent dans la liste VIP</span>;
    }
    return null;
  }

  function renderAssignToSelect() {
    if (form.assign_type === 'technician') {
      return (
        <select value={form.assign_to_id} onChange={e => setField('assign_to_id', parseInt(e.target.value))} style={selectStyle}>
          <option value={0}>— Choisir un technicien —</option>
          {technicians.map((t: any) => <option key={t.user_id} value={t.user_id}>{t.display_name || t.username}</option>)}
        </select>
      );
    }
    if (form.assign_type === 'group') {
      return (
        <select value={form.assign_to_id} onChange={e => setField('assign_to_id', parseInt(e.target.value))} style={selectStyle}>
          <option value={0}>— Choisir un groupe —</option>
          {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      );
    }
    if (form.assign_type === 'set_category') {
      return (
        <select value={form.assign_to_id} onChange={e => setField('assign_to_id', parseInt(e.target.value))} style={selectStyle}>
          <option value={0}>— Choisir une catégorie —</option>
          {sortedCategories.map((c: any) => (
            <option key={c.id} value={c.id}>{c.parent_id ? '  └ ' : ''}{c.full_path || c.name}</option>
          ))}
        </select>
      );
    }
    if (form.assign_type === 'set_type') {
      return (
        <select value={form.assign_to_value} onChange={e => setField('assign_to_value', e.target.value)} style={selectStyle}>
          <option value="">— Choisir un type —</option>
          {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (form.assign_type === 'add_tag') {
      return (
        <input value={form.assign_to_value} onChange={e => setField('assign_to_value', e.target.value)}
          placeholder="Nom du tag à ajouter" style={{ ...inputStyle, flex: 1 }} />
      );
    }
    return null;
  }

  function describeAction(r: any): string {
    const t = r.assign_type;
    if (t === 'technician') return `→ Technicien : ${technicians.find((x: any) => x.user_id === r.assign_to_id)?.display_name || '#' + r.assign_to_id}`;
    if (t === 'group') return `→ Groupe : ${groups.find((x: any) => x.id === r.assign_to_id)?.name || '#' + r.assign_to_id}`;
    if (t === 'set_vip') return '→ ⭐ Définir VIP';
    if (t === 'boost_priority') return '→ 🔺 Augmenter priorité +1';
    if (t === 'set_type') return `→ Type : ${typeOptions.find(o => o.value === String(r.assign_to_value))?.label || r.assign_to_value || '?'}`;
    if (t === 'add_tag') return `→ 🏷 Ajouter tag : ${r.assign_to_value || '?'}`;
    if (t === 'set_category') return `→ Catégorie : ${sortedCategories.find((c: any) => String(c.id) === String(r.assign_to_id))?.full_path || '#' + r.assign_to_id}`;
    return `→ ${t}`;
  }

  function describeRule(r: any): string {
    const condition = r.match_type === 'any' ? 'Tous les tickets'
      : r.match_type === 'category' ? `Catégorie = ${sortedCategories.find((c: any) => String(c.id) === String(r.match_value))?.full_path || r.match_value}`
      : r.match_type === 'priority' ? `Priorité = ${priorityOptions.find(o => o.value === String(r.match_value))?.label || r.match_value}`
      : r.match_type === 'type' ? `Type = ${typeOptions.find(o => o.value === String(r.match_value))?.label || r.match_value}`
      : r.match_type === 'title_contains' ? `Titre contient "${r.match_value}"`
      : r.match_type === 'requester' ? `Demandeur = ${r.match_value}`
      : r.match_type === 'source' ? `Source = ${sourceOptions.find(o => o.value === String(r.match_value))?.label || r.match_value}`
      : r.match_type === 'vip_requester' ? 'Demandeur VIP'
      : `${r.match_type} = ${r.match_value}`;
    return `${condition} ${describeAction(r)}`;
  }

  const isEditing = editingId !== null || isNew;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Règles d'assignation automatique</h3>
        {!isEditing && (
          <button onClick={startCreate} style={{ padding: '6px 14px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + Nouvelle règle
          </button>
        )}
      </div>

      <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
        Les règles sont évaluées par ordre de priorité (plus bas = plus prioritaire). Les actions ⭐ VIP, 🔺 priorité, 🏷 tag, 📋 type et 📁 catégorie s'accumulent. Seule la première assignation (groupe/technicien) est appliquée.
      </p>

      {/* Edit / Create form */}
      {isEditing && (
        <div style={{ padding: 16, border: '2px solid #6366f1', borderRadius: 10, marginBottom: 16, background: '#fafaff' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{isNew ? 'Nouvelle règle' : 'Modifier la règle'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={labelStyle}>Nom</label>
              <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Ex : Incidents réseau → groupe ID"
                style={{ flex: 1, ...inputStyle }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={labelStyle}>Si</label>
              <select value={form.match_type} onChange={e => { setField('match_type', e.target.value); setField('match_value', ''); }}
                style={{ ...selectStyle, minWidth: 160 }}>
                {matchTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {renderMatchValueSelect()}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={labelStyle}>Action</label>
              <select value={form.assign_type} onChange={e => { setField('assign_type', e.target.value); setField('assign_to_id', 0); setField('assign_to_value', ''); }}
                style={{ ...selectStyle, minWidth: 160 }}>
                <option value="group">Assigner à un groupe</option>
                <option value="technician">Assigner à un technicien</option>
                <option value="set_vip">⭐ Définir VIP</option>
                <option value="boost_priority">🔺 Augmenter la priorité</option>
                <option value="set_type">📋 Définir le type</option>
                <option value="set_category">📁 Définir la catégorie</option>
                <option value="add_tag">🏷 Ajouter un tag</option>
              </select>
              {renderAssignToSelect()}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={labelStyle}>Priorité</label>
              <input type="number" value={form.priority} onChange={e => setField('priority', parseInt(e.target.value) || 0)}
                style={{ width: 70, ...inputStyle }} min={0} />
              <span style={{ fontSize: 11, color: '#94a3b8' }}>0 = plus prioritaire</span>
              <label style={{ ...labelStyle, marginLeft: 16 }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setField('is_active', e.target.checked)}
                  style={{ marginRight: 6, accentColor: '#6366f1' }} />
                Active
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={cancel} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={save} disabled={saving || !form.name.trim() || (!form.assign_to_id && !['set_vip','boost_priority'].includes(form.assign_type)) && form.assign_type !== 'add_tag' && form.assign_type !== 'set_type'}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: (saving || !form.name.trim()) ? '#94a3b8' : '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules list */}
      <div style={{ display: 'grid', gap: 8 }}>
        {data.length === 0 && !isEditing && (
          <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 13 }}>Aucune règle définie</div>
        )}
        {data.map(r => (
          <div key={r.id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: r.is_active ? 1 : 0.5 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#f1f5f9', color: '#64748b', fontFamily: 'monospace' }}>P{r.priority}</span>
                <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: r.is_active ? '#dcfce7' : '#fef2f2', color: r.is_active ? '#16a34a' : '#dc2626', cursor: 'pointer' }}
                  onClick={() => toggleActive(r)}>
                  {r.is_active ? 'Actif' : 'Inactif'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{describeRule(r)}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => startEdit(r)} style={{ padding: '4px 10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>✎</button>
              <button onClick={() => remove(r.id)} style={{ padding: '4px 10px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, minWidth: 80, flexShrink: 0 };
const inputStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none' };
const selectStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff', cursor: 'pointer' };

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE / TRIGGER MANAGERS
// ─────────────────────────────────────────────────────────────────────────────
function TemplateManager({ data, onUpdate }: { data: any[], onUpdate: () => void }) {
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);

  function startEdit(t: any) {
    setEditingSlug(t.slug);
    setEditLabel(t.label || '');
    setEditSubject(t.subject || '');
    setEditBody(t.body_html || '');
  }

  async function save() {
    if (!editingSlug) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/tickets/admin/notification-templates/${editingSlug}`, {
        label: editLabel, subject: editSubject, body_html: editBody,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setEditingSlug(null);
      onUpdate();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de la sauvegarde');
    }
    setSaving(false);
  }

  async function reinitNotifications() {
    const token = localStorage.getItem('token');
    setSaving(true);
    try {
      const res = await axios.post('/api/tickets/admin/reinit-notifications', {}, { headers: { Authorization: `Bearer ${token}` } });
      alert('✅ ' + res.data.message);
      onUpdate();
    } catch (e: any) {
      alert('❌ ' + (e.response?.data?.message || e.message));
    }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>Templates de notification</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#64748b' }}>
            Variables : {'{{ticket_id}}, {{ticket_title}}, {{priority_label}}, {{requester_name}}, {{author_name}}, {{comment_content}}, ...'}
          </p>
        </div>
        <button onClick={reinitNotifications} disabled={saving}
          style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
          {saving ? '⏳ Réinitialisation...' : '🔄 Réinitialiser templates'}
        </button>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {data.map(t => (
          <div key={t.slug} style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 8 }}>
            {editingSlug === t.slug ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', minWidth: 140 }}>{t.slug}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ fontSize: 13, fontWeight: 600, minWidth: 60 }}>Libellé</label>
                  <input value={editLabel} onChange={e => setEditLabel(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ fontSize: 13, fontWeight: 600, minWidth: 60 }}>Sujet</label>
                  <input value={editSubject} onChange={e => setEditSubject(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Corps HTML</label>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                    <ReactQuill value={editBody} onChange={setEditBody} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditingSlug(null)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
                  <button onClick={save} disabled={saving}
                    style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: saving ? '#94a3b8' : '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{t.label}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', marginLeft: 8 }}>{t.slug}</span>
                  </div>
                  <button onClick={() => startEdit(t)} style={{ padding: '4px 12px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>✎ Modifier</button>
                </div>
                <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>{t.subject}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.body_html?.replace(/<[^>]*>/g, ' ').substring(0, 150)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TriggerManager({ data, onUpdate }: { data: any[], onUpdate?: () => void }) {
  const token = localStorage.getItem('token');
  const h = { Authorization: `Bearer ${token}` };

  async function toggleActive(t: any) {
    try {
      await axios.put(`/api/tickets/admin/notification-triggers/${t.id}`, { is_active: !t.is_active }, { headers: h });
      onUpdate?.();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Déclencheurs de notifications</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {data.map(t => (
          <div key={`${t.event}|${t.recipient_type}`} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => toggleActive(t)}
                style={{ width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', position: 'relative', background: t.is_active ? '#22c55e' : '#cbd5e1', transition: 'background 0.2s' }}>
                <span style={{ position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', left: t.is_active ? 18 : 2 }} />
              </button>
              <span style={{ fontWeight: 600 }}>{t.event}</span>
              <span style={{ color: '#64748b' }}>→</span>
              <span>{t.recipient_type}</span>
            </div>
            <span style={{ color: '#94a3b8', fontSize: 12 }}>{t.template_label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEAM MANAGER (ex-Techniciens)
// ─────────────────────────────────────────────────────────────────────────────
const TECH_STATUS_COLORS: Record<string, string> = {
  active: '#22c55e', paused: '#f59e0b', inactive: '#ef4444'
};
const TECH_STATUS_LABELS: Record<string, string> = {
  active: 'Actif', paused: 'En pause', inactive: 'Inactif'
};
const MODULE_ROLE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  technician: { label: 'Technicien',  color: '#6366f1', bg: '#eef2ff' },
  supervisor: { label: 'Superviseur', color: '#f59e0b', bg: '#fffbeb' },
  admin:      { label: 'Admin',       color: '#ef4444', bg: '#fef2f2' },
};

function TeamManager({ data, onUpdate }: { data: any[], onUpdate: () => void }) {
  const [filter, setFilter] = useState<string>('all');
  const [showAdSearch, setShowAdSearch] = useState(false);
  const [adQuery, setAdQuery] = useState('');
  const [adResults, setAdResults] = useState<any[]>([]);
  const [selectedAdUser, setSelectedAdUser] = useState<any>(null);
  const [pauseModal, setPauseModal] = useState<any>(null);
  const [editingPhone, setEditingPhone] = useState<number | null>(null);
  const [phoneValue, setPhoneValue] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingEmergency, setSavingEmergency] = useState<number | null>(null);
  const [reapplying, setReapplying] = useState(false);

  const filtered = filter === 'all' ? data : data.filter(t => t.status === filter);

  async function reapplyAssignments() {
    setReapplying(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/tickets/admin/technicians/reapply-assignments', {}, { headers: { Authorization: `Bearer ${token}` } });
      const d = res.data;
      alert(`${d.message}\n\nTickets assignés dans GLPI : ${d.glpi_assigned_tickets}\nRésolus (login → utilisateur) : ${d.resolvable_tickets}`);
      onUpdate();
    } catch (e: any) {
      alert('❌ ' + (e.response?.data?.message || e.message));
    }
    finally { setReapplying(false); }
  }

  async function searchAD(q: string) {
    if (q.length < 2) { setAdResults([]); return; }
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/tickets/admin/technicians/ad-search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
      setAdResults(res.data);
    } catch (e) { console.error(e); }
  }

  async function addFromAD(user: any) {
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/tickets/admin/technicians', {
        username: user.username, displayName: user.displayName, email: user.email
      }, { headers: { Authorization: `Bearer ${token}` } });
      setShowAdSearch(false); setAdQuery(''); setAdResults([]); setSelectedAdUser(null);
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function updateStatus(tech: any, status: string) {
    if (status === 'paused') { setPauseModal(tech); return; }
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/tickets/admin/technicians/${tech.user_id}/status`, { status }, { headers: { Authorization: `Bearer ${token}` } });
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function updateRole(userId: number, role: string) {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/tickets/admin/technicians/${userId}/role`, { role }, { headers: { Authorization: `Bearer ${token}` } });
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function confirmPause(techId: number, pausedUntil: string, mode: string, targetId?: number) {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/tickets/admin/technicians/${techId}/status`, { status: 'paused', paused_until: pausedUntil || null }, { headers: { Authorization: `Bearer ${token}` } });
      if (mode) {
        await axios.post(`/api/tickets/admin/technicians/${techId}/reassign`, { mode, target_id: targetId }, { headers: { Authorization: `Bearer ${token}` } });
      }
      setPauseModal(null); onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function deleteTechnician(tech: any) {
    if (!confirm(`Retirer ${tech.displayname || tech.displayName} de l'équipe ?`)) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/tickets/admin/technicians/${tech.user_id}`, { headers: { Authorization: `Bearer ${token}` } });
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function savePhone(userId: number) {
    setSavingPhone(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/tickets/admin/technicians/${userId}`, { mobile_phone: phoneValue }, { headers: { Authorization: `Bearer ${token}` } });
      setEditingPhone(null);
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    finally { setSavingPhone(false); }
  }

  async function toggleEmergency(userId: number, current: boolean) {
    setSavingEmergency(userId);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/tickets/admin/technicians/${userId}`, { is_emergency_contact: !current }, { headers: { Authorization: `Bearer ${token}` } });
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    finally { setSavingEmergency(null); }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <button onClick={() => setShowAdSearch(true)}
          style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          + Ajouter depuis l'AD
        </button>
        <button onClick={reapplyAssignments} disabled={reapplying}
          title="Rejoue la transposition des tickets assignés GLPI vers les techniciens (sans reset complet)"
          style={{ padding: '8px 16px', background: reapplying ? '#94a3b8' : '#0ea5e9', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          {reapplying ? '⏳ Réapplication...' : '🔄 Réappliquer assignations'}
        </button>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {['all', 'active', 'paused', 'inactive'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: filter === f ? '#6366f1' : '#fff', color: filter === f ? '#fff' : '#475569', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
              {f === 'all' ? 'Tous' : TECH_STATUS_LABELS[f] || f}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {filtered.map((t: any) => {
          const memberRole = t.module_role || t.role || 'technician';
          const roleConf = MODULE_ROLE_CONFIG[memberRole] || MODULE_ROLE_CONFIG.technician;
          return (
            <div key={t.user_id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, background: '#f8fafc', flexWrap: 'wrap' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: TECH_STATUS_COLORS[t.status] || '#94a3b8', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t.displayname || t.displayName || `User #${t.user_id}`}</div>
                <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>{t.email}</span>
                  <span style={{ color: '#94a3b8' }}>@{t.username}</span>
                  {(t.service_complement || t.service_code) && (
                    <span style={{ color: '#6366f1', fontWeight: 500 }}>
                      🏢 {t.service_complement || t.service_code}
                    </span>
                  )}
                </div>
                {/* Mobile phone inline editor */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>📱</span>
                  {editingPhone === t.user_id ? (
                    <>
                      <input
                        type="tel"
                        value={phoneValue}
                        onChange={e => setPhoneValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') savePhone(t.user_id); if (e.key === 'Escape') setEditingPhone(null); }}
                        placeholder="Ex : 0612345678"
                        autoFocus
                        style={{ padding: '2px 8px', border: '1.5px solid #6366f1', borderRadius: 6, fontSize: 12, outline: 'none', width: 130 }}
                      />
                      <button onClick={() => savePhone(t.user_id)} disabled={savingPhone}
                        style={{ padding: '2px 8px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                        {savingPhone ? '…' : '✓'}
                      </button>
                      <button onClick={() => setEditingPhone(null)}
                        style={{ padding: '2px 6px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
                        ✕
                      </button>
                    </>
                  ) : (
                    <span
                      onClick={() => { setEditingPhone(t.user_id); setPhoneValue(t.mobile_phone || ''); }}
                      style={{ fontSize: 12, color: t.mobile_phone ? '#1e293b' : '#94a3b8', cursor: 'pointer', borderBottom: '1px dashed #cbd5e1' }}
                      title="Cliquer pour modifier">
                      {t.mobile_phone || 'Ajouter un numéro…'}
                    </span>
                  )}
                </div>
                {/* Emergency contact checkbox */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={!!t.is_emergency_contact}
                    disabled={savingEmergency === t.user_id}
                    onChange={() => toggleEmergency(t.user_id, !!t.is_emergency_contact)}
                    style={{ width: 13, height: 13, cursor: 'pointer', accentColor: '#dc2626' }}
                  />
                  <span style={{ fontSize: 11, color: t.is_emergency_contact ? '#dc2626' : '#94a3b8', fontWeight: t.is_emergency_contact ? 700 : 400 }}>
                    {t.is_emergency_contact ? '🚨 Contact d\'urgence' : 'Joindre en cas d\'urgence'}
                  </span>
                </label>
              </div>

              {/* Role selector */}
              <select
                value={memberRole}
                onChange={e => updateRole(t.user_id, e.target.value)}
                style={{
                  padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${roleConf.color}40`,
                  background: roleConf.bg, color: roleConf.color,
                  outline: 'none', minWidth: 110,
                }}>
                <option value="technician">🔧 Technicien</option>
                <option value="supervisor">🎯 Superviseur</option>
                <option value="admin">⚙️ Admin</option>
              </select>

              <div style={{ textAlign: 'center', minWidth: 64 }} title={`${t.active_tickets || 0} ticket(s) en cours · ${t.total_tickets || 0} au total`}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
                  {t.active_tickets || 0}
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8' }}> / {t.total_tickets || 0}</span>
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>actifs / total</div>
              </div>

              <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: (TECH_STATUS_COLORS[t.status] || '#94a3b8') + '20', color: TECH_STATUS_COLORS[t.status] || '#64748b' }}>
                {TECH_STATUS_LABELS[t.status] || t.status}
              </span>

              <div style={{ display: 'flex', gap: 4 }}>
                {t.status !== 'active' && (
                  <button onClick={() => updateStatus(t, 'active')} style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#22c55e' }}>▶ Activer</button>
                )}
                {t.status === 'active' && (
                  <button onClick={() => updateStatus(t, 'paused')} style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#f59e0b' }}>⏸ Pause</button>
                )}
                {t.status !== 'inactive' && (
                  <button onClick={() => deleteTechnician(t)} style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#ef4444' }}>🗑</button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 }}>
            Aucun membre {filter !== 'all' ? TECH_STATUS_LABELS[filter]?.toLowerCase() : ''}
          </div>
        )}
      </div>

      {showAdSearch && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => { setShowAdSearch(false); setAdResults([]); setSelectedAdUser(null); setAdQuery(''); }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 500, maxHeight: '80vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600 }}>Ajouter un membre depuis l'AD</h3>
            <input value={adQuery} onChange={e => { setAdQuery(e.target.value); searchAD(e.target.value); }}
              placeholder="Rechercher un utilisateur (nom, email, login)..."
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', marginBottom: 12 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {adResults.map((u: any) => (
                <div key={u.username} onClick={() => setSelectedAdUser(u)}
                  style={{ padding: '10px 14px', border: `2px solid ${selectedAdUser?.username === u.username ? '#6366f1' : '#e2e8f0'}`, borderRadius: 8, cursor: 'pointer', background: selectedAdUser?.username === u.username ? '#eef2ff' : '#fff' }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{u.displayName}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{u.email} · {u.username}</div>
                </div>
              ))}
              {adQuery.length > 1 && adResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>Aucun résultat</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowAdSearch(false); setAdResults([]); setSelectedAdUser(null); setAdQuery(''); }}
                style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={() => selectedAdUser && addFromAD(selectedAdUser)} disabled={!selectedAdUser}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 6, cursor: selectedAdUser ? 'pointer' : 'default', background: selectedAdUser ? '#6366f1' : '#e2e8f0', color: selectedAdUser ? '#fff' : '#94a3b8', fontWeight: 600, fontSize: 13 }}>
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {pauseModal && <PauseModal tech={pauseModal} onConfirm={confirmPause} onClose={() => setPauseModal(null)} />}
    </div>
  );
}

function PauseModal({ tech, onConfirm, onClose }: { tech: any, onConfirm: (id: number, until: string, mode: string, target?: number) => void, onClose: () => void }) {
  const [untilDate, setUntilDate] = useState('');
  const [mode, setMode] = useState<string>('');
  const [targetId, setTargetId] = useState<number | undefined>(undefined);
  const [availableTechs, setAvailableTechs] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    if (tech.active_tickets > 0) {
      const token = localStorage.getItem('token');
      const h = { headers: { Authorization: `Bearer ${token}` } };
      axios.get('/api/tickets/admin/technicians/available', h)
        .then(r => setAvailableTechs(r.data.filter((t: any) => t.user_id !== tech.user_id)))
        .catch(() => {});
      axios.get('/api/tickets/admin/groups', h)
        .then(r => setGroups(r.data || []))
        .catch(() => {});
    }
  }, [tech.active_tickets]);

  // Sélection encodée "user:<id>" / "group:<id>" pour distinguer technicien et groupe
  const selValue = mode === 'single' && targetId ? `user:${targetId}`
    : mode === 'group' && targetId ? `group:${targetId}` : '';
  function onSelectTarget(v: string) {
    if (v.startsWith('group:')) { setMode('group'); setTargetId(Number(v.slice(6))); }
    else if (v.startsWith('user:')) { setMode('single'); setTargetId(Number(v.slice(5))); }
    else { setTargetId(undefined); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 450 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600 }}>Mettre en pause : {tech.displayname || tech.displayName}</h3>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Date de reprise (optionnelle)</label>
          <input type="date" value={untilDate} onChange={e => setUntilDate(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        {tech.active_tickets > 0 && (
          <div style={{ background: '#fef2f2', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', marginBottom: 8 }}>
              ⚠️ {tech.active_tickets} ticket(s) en cours assigné(s)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="reassign" checked={mode === 'single' || mode === 'group'} onChange={() => { setMode('single'); setTargetId(undefined); }} />
                <span>Réassigner à :</span>
                <select disabled={mode !== 'single' && mode !== 'group'} value={selValue} onChange={e => onSelectTarget(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, background: '#fff' }}>
                  <option value="">Choisir...</option>
                  {availableTechs.length > 0 && (
                    <optgroup label="👤 Techniciens">
                      {availableTechs.map((t: any) => (
                        <option key={`u${t.user_id}`} value={`user:${t.user_id}`}>{t.displayname || t.displayName || t.email || `#${t.user_id}`} ({t.active_tickets} tickets)</option>
                      ))}
                    </optgroup>
                  )}
                  {groups.length > 0 && (
                    <optgroup label="👥 Groupes">
                      {groups.map((g: any) => (
                        <option key={`g${g.id}`} value={`group:${g.id}`}>{g.name}{g.members?.length ? ` (${g.members.length} membres)` : ''}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="reassign" onChange={() => { setMode('dispatch'); setTargetId(undefined); }} />
                Dispatcher équitablement
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="reassign" onChange={() => { setMode('unassign'); setTargetId(undefined); }} />
                Désassigner ses tickets
              </label>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
          <button onClick={() => onConfirm(tech.user_id, untilDate, mode, targetId)}
            style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: '#f59e0b', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            Confirmer la pause
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE PERMISSIONS MANAGER
// ─────────────────────────────────────────────────────────────────────────────
const ALL_ROLES = ['readonly', 'user', 'technician', 'supervisor', 'admin', 'superadmin'];

const ROLE_DISPLAY: Record<string, { label: string; icon: string; color: string }> = {
  readonly:   { label: 'Lecture',     icon: '👁',  color: '#94a3b8' },
  user:       { label: 'Utilisateur', icon: '👤',  color: '#64748b' },
  technician: { label: 'Technicien',  icon: '🔧',  color: '#6366f1' },
  supervisor: { label: 'Superviseur', icon: '🎯',  color: '#f59e0b' },
  admin:      { label: 'Admin',       icon: '⚙️',  color: '#ef4444' },
  superadmin: { label: 'Superadmin',  icon: '🔑',  color: '#7c3aed' },
};

const PERMISSION_GROUPS = [
  {
    label: '🎫 Tickets',
    perms: [
      { key: 'ticket:read',        label: 'Voir les tickets' },
      { key: 'ticket:create',      label: 'Créer un ticket' },
      { key: 'ticket:update',      label: 'Modifier un ticket' },
      { key: 'ticket:delete',      label: 'Supprimer un ticket' },
      { key: 'ticket:view_all',    label: 'Voir tous les tickets' },
      { key: 'ticket:assign',      label: 'Assigner un ticket' },
      { key: 'ticket:assign_self', label: "S'auto-assigner" },
      { key: 'ticket:escalate',    label: 'Escalader' },
      { key: 'ticket:close',       label: 'Fermer' },
      { key: 'ticket:reopen',      label: 'Réouvrir' },
    ]
  },
  {
    label: '💬 Commentaires',
    perms: [
      { key: 'comment:write_public',   label: 'Écrire un commentaire' },
      { key: 'comment:write_internal', label: 'Commentaire interne' },
      { key: 'comment:read_private',   label: 'Voir les internes' },
    ]
  },
  {
    label: '📎 Fichiers & Stats',
    perms: [
      { key: 'attachment:upload',    label: 'Joindre des fichiers' },
      { key: 'dashboard:view_stats', label: 'Voir les statistiques' },
      { key: 'dashboard:view_kpi',   label: 'Voir les KPI' },
      { key: 'ticket:view_rejected', label: 'Voir les tickets rejetés' },
    ]
  },
  {
    label: '⚙️ Administration',
    perms: [
      { key: 'sla:configure',  label: 'Configurer les SLA' },
      { key: 'category:manage', label: 'Gérer les catégories' },
      { key: 'group:manage',    label: 'Gérer les groupes' },
      { key: 'rules:manage',    label: "Géles règles d'assignation" },
      { key: 'admin:access',    label: 'Accès administration' },
    ]
  },
];

function RolePermissionsManager() {
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/tickets/admin/role-permissions', { headers: { Authorization: `Bearer ${token}` } });
      setPermissions(res.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  function toggle(permKey: string, role: string) {
    setPermissions(prev => {
      const current = prev[permKey] || [];
      const has = current.includes(role);
      return { ...prev, [permKey]: has ? current.filter(r => r !== role) : [...current, role] };
    });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put('/api/tickets/admin/role-permissions', { permissions }, { headers: { Authorization: `Bearer ${token}` } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setSaving(false);
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Chargement...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Permissions par rôle</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Définissez ce que chaque rôle peut faire dans le module tickets</p>
        </div>
        <button onClick={save} disabled={saving}
          style={{ padding: '10px 24px', background: saved ? '#22c55e' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
          {saving ? 'Enregistrement...' : saved ? '✓ Sauvegardé' : 'Enregistrer'}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: '#64748b', fontWeight: 600, background: '#f8fafc', borderBottom: '2px solid #e2e8f0', minWidth: 200 }}>
                Action
              </th>
              {ALL_ROLES.map(role => {
                const rd = ROLE_DISPLAY[role];
                return (
                  <th key={role} style={{ padding: '10px 8px', textAlign: 'center', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', minWidth: 90 }}>
                    <div style={{ fontSize: 16 }}>{rd.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: rd.color, marginTop: 2 }}>{rd.label}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map(group => (
              <React.Fragment key={group.label}>
                <tr>
                  <td colSpan={ALL_ROLES.length + 1} style={{ padding: '10px 12px 6px', fontWeight: 700, fontSize: 12, color: '#374151', background: '#f1f5f9', borderTop: '1px solid #e2e8f0' }}>
                    {group.label}
                  </td>
                </tr>
                {group.perms.map(({ key, label }, idx) => (
                  <tr key={key} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '10px 12px', color: '#374151', borderBottom: '1px solid #f1f5f9' }}>
                      {label}
                    </td>
                    {ALL_ROLES.map(role => {
                      const allowed = (permissions[key] || []).includes(role);
                      return (
                        <td key={role} style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', width: 20, height: 20 }}>
                            <input
                              type="checkbox"
                              checked={allowed}
                              onChange={() => toggle(key, role)}
                              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: ROLE_DISPLAY[role].color }}
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP MANAGER
// ─────────────────────────────────────────────────────────────────────────────
function GroupManager() {
  const [groups, setGroups] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [addingMember, setAddingMember] = useState<number | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const h = { Authorization: `Bearer ${token}` };
      const [gRes, tRes] = await Promise.all([
        axios.get('/api/tickets/admin/groups', { headers: h }),
        axios.get('/api/tickets/admin/technicians', { headers: h }),
      ]);
      setGroups(gRes.data || []);
      setTechnicians(tRes.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function createGroup() {
    if (!newName.trim()) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/tickets/admin/groups', { name: newName.trim(), description: newDesc.trim() }, { headers: { Authorization: `Bearer ${token}` } });
      setNewName(''); setNewDesc('');
      loadAll();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function updateGroup(id: number, name: string, description: string, is_default: boolean) {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/tickets/admin/groups/${id}`, { name, description, is_default }, { headers: { Authorization: `Bearer ${token}` } });
      setEditingGroup(null);
      loadAll();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function deleteGroup(id: number) {
    if (!confirm('Désactiver ce groupe ?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/tickets/admin/groups/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      loadAll();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function setDefault(id: number) {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/tickets/admin/groups/${id}/set-default`, {}, { headers: { Authorization: `Bearer ${token}` } });
      loadAll();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function addMember(groupId: number, userId: number) {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/tickets/admin/groups/${groupId}/members`, { user_id: userId }, { headers: { Authorization: `Bearer ${token}` } });
      setAddingMember(null);
      loadAll();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function removeMember(groupId: number, memberRowId: number) {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/tickets/admin/groups/${groupId}/members/${memberRowId}`, { headers: { Authorization: `Bearer ${token}` } });
      loadAll();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>;

  return (
    <div>
      <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Groupes de technicians</h3>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#71717a' }}>
        Créez des groupes pour organiser l'escalade. Le groupe par défaut (Support) reçoit les tickets en premier et ne peut pas être cible d'escalade.
      </p>

      {/* Créer un groupe */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#71717a', marginBottom: 4 }}>Nom du groupe</div>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Support N2" style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#71717a', marginBottom: 4 }}>Description</div>
          <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optionnel" style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <button onClick={createGroup} disabled={!newName.trim()} style={{ padding: '8px 20px', background: newName.trim() ? '#6366f1' : '#e4e4e7', color: newName.trim() ? '#fff' : '#94a3b8', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: newName.trim() ? 'pointer' : 'default' }}>
          + Créer
        </button>
      </div>

      {/* Liste des groupes */}
      {groups.length === 0 && <div style={{ fontSize: 13, color: '#a1a1aa', fontStyle: 'italic' }}>Aucun groupe configuré</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {groups.map((g: any) => (
          <div key={g.id} style={{ border: `1px solid ${g.is_default ? '#6366f180' : '#e2e8f0'}`, borderRadius: 12, background: g.is_default ? '#eff6ff' : '#fff', overflow: 'hidden' }}>
            {/* En-tête du groupe */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: g.is_default ? '#dbeafe40' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
              {editingGroup?.id === g.id ? (
                <div style={{ display: 'flex', gap: 8, flex: 1 }}>
                  <input value={editingGroup.name} onChange={e => setEditingGroup({ ...editingGroup, name: e.target.value })} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, flex: 1 }} />
                  <input value={editingGroup.description || ''} onChange={e => setEditingGroup({ ...editingGroup, description: e.target.value })} placeholder="Description" style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, flex: 1 }} />
                  <button onClick={() => updateGroup(g.id, editingGroup.name, editingGroup.description, editingGroup.is_default)} style={{ padding: '4px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>✓</button>
                  <button onClick={() => setEditingGroup(null)} style={{ padding: '4px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#18181b', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {g.name}
                      {g.is_default && <span style={{ fontSize: 10, fontWeight: 600, background: '#6366f1', color: '#fff', padding: '2px 8px', borderRadius: 4 }}>PAR DÉFAUT</span>}
                    </div>
                    {g.description && <div style={{ fontSize: 12, color: '#71717a', marginTop: 2 }}>{g.description}</div>}
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{(g.members || []).length} membre{(g.members || []).length !== 1 ? 's' : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {!g.is_default && <button onClick={() => setDefault(g.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #6366f120', fontSize: 11, fontWeight: 600, background: '#fff', color: '#6366f1', cursor: 'pointer' }}>☆ Par défaut</button>}
                    <button onClick={() => setEditingGroup(g)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e4e4e7', fontSize: 11, fontWeight: 600, background: '#fff', color: '#475569', cursor: 'pointer' }}>✎ Modifier</button>
                    <button onClick={() => deleteGroup(g.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fca5a5', fontSize: 11, fontWeight: 600, background: '#fff', color: '#dc2626', cursor: 'pointer' }}>🗑 Désactiver</button>
                  </div>
                </>
              )}
            </div>

            {/* Membres du groupe */}
            <div style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {(g.members || []).map((m: any) => (
                  <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, background: g.is_default ? '#c7d2fe' : '#f0fdf4', fontSize: 12, fontWeight: 500, color: g.is_default ? '#3730a3' : '#166534' }}>
                    {m.displayName || m.username || `#${m.user_id}`}
                    <button onClick={() => removeMember(g.id, m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                  </span>
                ))}
                {(g.members || []).length === 0 && <span style={{ fontSize: 12, color: '#a1a1aa', fontStyle: 'italic' }}>Aucun membre</span>}
              </div>

              {/* Ajouter un membre */}
              {addingMember === g.id ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select onChange={e => { const uid = parseInt(e.target.value); if (uid) addMember(g.id, uid); }} style={{ flex: 1, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}>
                    <option value="">— Choisir un technicien —</option>
                    {technicians.filter((t: any) => !(g.members || []).some((m: any) => m.user_id === t.user_id)).map((t: any) => (
                      <option key={t.user_id} value={t.user_id}>{t.displayname || t.displayName} {t.service_complement ? `(${t.service_complement})` : ''}</option>
                    ))}
                  </select>
                  <button onClick={() => setAddingMember(null)} style={{ padding: '6px 12px', background: '#f1f5f9', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Annuler</button>
                </div>
              ) : (
                <button onClick={() => setAddingMember(g.id)} style={{ padding: '4px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>+ Ajouter un membre</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ESCALADE MANAGER
// ─────────────────────────────────────────────────────────────────────────────
function EscaladeManager() {
  const [supportAgents, setSupportAgents] = useState<any[]>([]);
  const [escaladeTargets, setEscaladeTargets] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetType, setTargetType] = useState<'agent' | 'supervisor' | 'group'>('agent');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const h = { Authorization: `Bearer ${token}` };
      const [cfgRes, techRes, grpRes] = await Promise.all([
        axios.get('/api/tickets/admin/escalade', { headers: h }),
        axios.get('/api/tickets/admin/technicians', { headers: h }),
        axios.get('/api/tickets/admin/escalade/groups', { headers: h }),
      ]);
      setSupportAgents(cfgRes.data.support_agents || []);
      setEscaladeTargets(cfgRes.data.escalade_targets || []);
      setTechnicians(techRes.data || []);
      setGroups(grpRes.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function toggleSupportAgent(tech: any) {
    const token = localStorage.getItem('token');
    const existing = supportAgents.find(a => a.user_id === tech.user_id);
    try {
      if (existing) {
        await axios.delete(`/api/tickets/admin/escalade/support-agent/${existing.id}`, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post('/api/tickets/admin/escalade/support-agent', {
          user_id: tech.user_id, username: tech.username,
          display_name: tech.displayname || tech.displayName, email: tech.email
        }, { headers: { Authorization: `Bearer ${token}` } });
      }
      loadAll();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function toggleTargetAgent(tech: any) {
    const token = localStorage.getItem('token');
    const existing = escaladeTargets.find(t => t.target_type === 'agent' && t.user_id === tech.user_id);
    try {
      if (existing) {
        await axios.delete(`/api/tickets/admin/escalade/target/${existing.id}`, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post('/api/tickets/admin/escalade/target', {
          target_type: 'agent', user_id: tech.user_id, username: tech.username,
          display_name: tech.displayname || tech.displayName, email: tech.email
        }, { headers: { Authorization: `Bearer ${token}` } });
      }
      loadAll();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function toggleTargetSupervisor(tech: any) {
    const token = localStorage.getItem('token');
    const existing = escaladeTargets.find(t => t.target_type === 'supervisor' && t.user_id === tech.user_id);
    try {
      if (existing) {
        await axios.delete(`/api/tickets/admin/escalade/target/${existing.id}`, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post('/api/tickets/admin/escalade/target', {
          target_type: 'supervisor', user_id: tech.user_id, username: tech.username,
          display_name: tech.displayname || tech.displayName, email: tech.email
        }, { headers: { Authorization: `Bearer ${token}` } });
      }
      loadAll();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function removeTarget(id: number) {
    if (!confirm('Retirer cette cible ?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/tickets/admin/escalade/target/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      loadAll();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>;

  const activeTechs = technicians.filter(t => t.status === 'active');

  const techRow = (tech: any, isIn: boolean, onToggle: () => void, activeColor: string) => (
    <div key={tech.user_id} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
      border: `1px solid ${isIn ? activeColor + '40' : '#e4e4e7'}`,
      borderRadius: 8, background: isIn ? activeColor + '08' : '#fff',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>{tech.displayname || tech.displayName}</div>
        <div style={{ fontSize: 11, color: '#71717a' }}>{tech.service_complement || tech.service_code || tech.email}</div>
      </div>
      <button onClick={onToggle} style={{
        padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
        fontSize: 12, fontWeight: 600,
        background: isIn ? '#fef2f2' : '#f0fdf4',
        color: isIn ? '#dc2626' : '#16a34a',
        whiteSpace: 'nowrap',
      }}>
        {isIn ? '✕ Retirer' : '+ Ajouter'}
      </button>
    </div>
  );

  const nonDefaultGroups = groups.filter(g => !g.is_default);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Équipe support</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#71717a' }}>Agents configurés comme cibles d'escalade individuelle.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activeTechs.length === 0 && <div style={{ fontSize: 12, color: '#a1a1aa', fontStyle: 'italic' }}>Aucun technicien actif</div>}
          {activeTechs.map(tech => {
            const isIn = supportAgents.some(a => a.user_id === tech.user_id);
            return techRow(tech, isIn, () => toggleSupportAgent(tech), '#6366f1');
          })}
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Cibles d'escalade</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#71717a' }}>Agents ou groupes vers lesquels escalader un ticket.</p>

        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          <button onClick={() => setTargetType('group')}
            style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: targetType === 'group' ? '#6366f1' : '#f1f5f9', color: targetType === 'group' ? '#fff' : '#475569' }}>
            👥 Groupe
          </button>
          <button onClick={() => setTargetType('agent')}
            style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: targetType === 'agent' ? '#6366f1' : '#f1f5f9', color: targetType === 'agent' ? '#fff' : '#475569' }}>
            👤 Agent
          </button>
          <button onClick={() => setTargetType('supervisor')}
            style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: targetType === 'supervisor' ? '#6366f1' : '#f1f5f9', color: targetType === 'supervisor' ? '#fff' : '#475569' }}>
            🎯 Superviseur
          </button>
        </div>

        {targetType === 'agent' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeTechs.length === 0 && <div style={{ fontSize: 12, color: '#a1a1aa', fontStyle: 'italic' }}>Aucun technicien actif</div>}
            {activeTechs.map(tech => {
              const isIn = escaladeTargets.some(t => t.target_type === 'agent' && t.user_id === tech.user_id);
              return techRow(tech, isIn, () => toggleTargetAgent(tech), '#8b5cf6');
            })}
          </div>
        ) : targetType === 'supervisor' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeTechs.length === 0 && <div style={{ fontSize: 12, color: '#a1a1aa', fontStyle: 'italic' }}>Aucun technicien actif</div>}
            {activeTechs.map(tech => {
              const isIn = escaladeTargets.some(t => t.target_type === 'supervisor' && t.user_id === tech.user_id);
              return techRow(tech, isIn, () => toggleTargetSupervisor(tech), '#f59e0b');
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {nonDefaultGroups.length === 0 && (
              <div style={{ fontSize: 12, color: '#a1a1aa', fontStyle: 'italic' }}>
                Aucun groupe d'escalade configuré.<br />
                <span style={{ fontSize: 11 }}>Créez des groupes dans l'onglet « Groupes » (les groupes par défaut ne sont pas disponibles pour l'escalade).</span>
              </div>
            )}
            {nonDefaultGroups.map(g => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1px solid #22c55e40', background: '#f0fdf4' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#fff', flexShrink: 0 }}>
                    👥
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#14532d' }}>{g.name}</div>
                    <div style={{ fontSize: 11, color: '#16a34a' }}>
                      {(g.members || []).length} membre{(g.members || []).length !== 1 ? 's' : ''}
                      {g.description ? ` · ${g.description}` : ''}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TICKET PARAMS MANAGER
// ─────────────────────────────────────────────────────────────────────────────
function TicketParamsManager() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get('/api/tickets/admin/config-all', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setConfig(r.data || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function get(key: string, fallback: string = ''): string {
    return config[key] ?? fallback;
  }

  function set(key: string, value: string) {
    setConfig(prev => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put('/api/tickets/admin/config-bulk', config, { headers: { Authorization: `Bearer ${token}` } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setSaving(false);
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>;

  const sectionStyle: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 10, padding: 20, marginBottom: 16, background: '#f8fafc' };
  const sectionTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 700, marginBottom: 14, color: '#18181b' };
  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 };
  const lblStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, minWidth: 200, flexShrink: 0, color: '#374151' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>⚙️ Paramètres du module tickets</h3>
        <button onClick={save} disabled={saving}
          style={{ padding: '8px 20px', background: saving ? '#94a3b8' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          {saving ? 'Enregistrement...' : 'Enregistrer tout'}
        </button>
      </div>

      {saved && <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, marginBottom: 12 }}>✓ Paramètres enregistrés</div>}

      {/* Live Chat */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>🟢 Live Chat</div>
        <div style={rowStyle}>
          <label style={lblStyle}>Nom du chat</label>
          <input value={get('chat_name', 'Support DSI')} onChange={e => set('chat_name', e.target.value)}
            style={{ ...inputStyle, flex: 1 }} />
        </div>
        <div style={rowStyle}>
          <label style={lblStyle}>Logo du chat (URL ou emoji)</label>
          <input value={get('chat_logo', '💬')} onChange={e => set('chat_logo', e.target.value)}
            style={{ ...inputStyle, flex: 1 }} placeholder="https://... ou emoji" />
          {get('chat_logo') && <span style={{ fontSize: 28 }}>{get('chat_logo').startsWith('http') ? <img src={get('chat_logo')} style={{ height: 28 }} /> : get('chat_logo')}</span>}
        </div>
      </div>

      {/* Couleurs */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>🎨 Apparence</div>
        <div style={rowStyle}>
          <label style={lblStyle}>Couleur principale</label>
          <input type="color" value={get('primary_color', '#6366f1')} onChange={e => set('primary_color', e.target.value)}
            style={{ width: 44, height: 36, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
          <input value={get('primary_color', '#6366f1')} onChange={e => set('primary_color', e.target.value)}
            style={{ ...inputStyle, width: 100 }} />
          <div style={{ width: 40, height: 24, borderRadius: 6, background: get('primary_color', '#6366f1') }} />
        </div>
        <div style={rowStyle}>
          <label style={lblStyle}>Couleur secondaire</label>
          <input type="color" value={get('secondary_color', '#818cf8')} onChange={e => set('secondary_color', e.target.value)}
            style={{ width: 44, height: 36, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
          <input value={get('secondary_color', '#818cf8')} onChange={e => set('secondary_color', e.target.value)}
            style={{ ...inputStyle, width: 100 }} />
          <div style={{ width: 40, height: 24, borderRadius: 6, background: `linear-gradient(135deg, ${get('primary_color', '#6366f1')}, ${get('secondary_color', '#818cf8')})` }} />
        </div>
      </div>

      {/* Active Directory */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>🏢 Active Directory</div>
        <div style={rowStyle}>
          <label style={lblStyle}>Nom de l'annuaire AD</label>
          <input value={get('ad_name', 'Active Directory')} onChange={e => set('ad_name', e.target.value)}
            style={{ ...inputStyle, flex: 1 }} placeholder="Ex: Annuaire Ivry, Active Directory..." />
        </div>
        <div style={rowStyle}>
          <label style={lblStyle}>Valeur par défaut identifiant</label>
          <input value={get('ad_default_username', 'windows')} onChange={e => set('ad_default_username', e.target.value)}
            style={{ ...inputStyle, flex: 1 }} placeholder="Ex: windows, session..." />
          <span style={{ fontSize: 11, color: '#94a3b8' }}>Utilisé comme placeholder dans le champ identifiant</span>
        </div>
      </div>

      {/* Fonctionnalités */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>✨ Fonctionnalités</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>Reformulation IA</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Affiche le bouton de reformulation IA dans la zone de commentaire</div>
          </div>
          <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer', flexShrink: 0 }}>
            <input type="checkbox" checked={get('ai_reformulation_enabled', 'true') !== 'false'} onChange={e => set('ai_reformulation_enabled', String(e.target.checked))}
              style={{ opacity: 0, width: 0, height: 0 }} />
            <span style={{ position: 'absolute', inset: 0, borderRadius: 24, transition: 'background 0.2s', background: get('ai_reformulation_enabled', 'true') !== 'false' ? '#6366f1' : '#cbd5e1' }}>
              <span style={{ position: 'absolute', top: 3, left: get('ai_reformulation_enabled', 'true') !== 'false' ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </span>
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>Dictée vocale</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Affiche le bouton de dictée vocale dans la zone de commentaire</div>
          </div>
          <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer', flexShrink: 0 }}>
            <input type="checkbox" checked={get('voice_dictation_enabled', 'true') !== 'false'} onChange={e => set('voice_dictation_enabled', String(e.target.checked))}
              style={{ opacity: 0, width: 0, height: 0 }} />
            <span style={{ position: 'absolute', inset: 0, borderRadius: 24, transition: 'background 0.2s', background: get('voice_dictation_enabled', 'true') !== 'false' ? '#6366f1' : '#cbd5e1' }}>
              <span style={{ position: 'absolute', top: 3, left: get('voice_dictation_enabled', 'true') !== 'false' ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </span>
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={save} disabled={saving}
          style={{ padding: '8px 20px', background: saving ? '#94a3b8' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          {saving ? 'Enregistrement...' : 'Enregistrer tout'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLOSURE MANAGER — délai de clôture auto + log des clôtures
// ─────────────────────────────────────────────────────────────────────────────
function ClosureManager() {
  const token = localStorage.getItem('token');
  const h = { Authorization: `Bearer ${token}` };
  const [days, setDays] = useState<string>('7');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingLog, setLoadingLog] = useState(true);

  const loadLog = () => {
    setLoadingLog(true);
    axios.get('/api/tickets/admin/closure-log?limit=200', { headers: h })
      .then(r => { setLog(r.data.rows || []); setTotal(r.data.total || 0); })
      .catch(() => {})
      .finally(() => setLoadingLog(false));
  };

  useEffect(() => {
    axios.get('/api/tickets/admin/config-all', { headers: h })
      .then(r => setDays(String(r.data?.auto_close_days ?? '7')))
      .catch(() => {})
      .finally(() => setLoaded(true));
    loadLog();
  }, []);

  async function saveDays() {
    setSaving(true);
    try {
      await axios.put('/api/tickets/admin/config-bulk', { auto_close_days: days }, { headers: h });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setSaving(false);
  }

  async function runNow() {
    if (!window.confirm('Lancer maintenant la clôture automatique des tickets résolus dépassant le délai ?')) return;
    setRunning(true);
    try {
      const r = await axios.post('/api/tickets/admin/closure/run', {}, { headers: h });
      alert(r.data?.message || 'Terminé.');
      loadLog();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setRunning(false);
  }

  const sectionStyle: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 10, padding: 20, marginBottom: 16, background: '#f8fafc' };
  const sectionTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 700, marginBottom: 14, color: '#18181b' };

  const fmtDate = (s: string) => s ? new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const sourceBadge = (row: any) => {
    if (row.is_auto) return <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>Automatique</span>;
    if (row.by_requester) return <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>Demandeur</span>;
    return <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>Technicien</span>;
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>🔒 Clôture des tickets</h3>

      {/* Réglage du délai */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Clôture automatique</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Durée avant clôture auto (jours, une fois le ticket résolu)</label>
          <input type="number" min={0} value={loaded ? days : ''} onChange={e => setDays(e.target.value)}
            style={{ ...inputStyle, width: 80 }} />
          <button onClick={saveDays} disabled={saving}
            style={{ padding: '8px 16px', background: saving ? '#94a3b8' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          {saved && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Enregistré</span>}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
          0 = désactivé. La clôture s'exécute automatiquement chaque nuit à minuit. Par défaut : 7 jours.
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={runNow} disabled={running}
            style={{ padding: '7px 14px', background: running ? '#94a3b8' : '#fff', color: '#6366f1', border: '1px solid #6366f1', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
            {running ? 'En cours...' : '▶ Lancer la clôture maintenant'}
          </button>
        </div>
      </div>

      {/* Log des clôtures */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={sectionTitleStyle}>Log des clôtures {total > 0 && <span style={{ fontWeight: 500, color: '#94a3b8' }}>({total})</span>}</div>
          <button onClick={loadLog} style={{ padding: '5px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>↻ Rafraîchir</button>
        </div>
        {loadingLog ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>
        ) : log.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Aucune clôture enregistrée.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '8px 10px' }}>Ticket</th>
                  <th style={{ padding: '8px 10px' }}>Titre</th>
                  <th style={{ padding: '8px 10px' }}>Clôturé par</th>
                  <th style={{ padding: '8px 10px' }}>Source</th>
                  <th style={{ padding: '8px 10px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {log.map(row => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      <a href={`/tickets/${row.ticket_id}`} style={{ color: '#6366f1', textDecoration: 'none' }}>#{row.ticket_id}</a>
                    </td>
                    <td style={{ padding: '8px 10px', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.ticket_title}>{row.ticket_title || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{row.is_auto ? 'Système' : (row.closed_by || '—')}</td>
                    <td style={{ padding: '8px 10px' }}>{sourceBadge(row)}</td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: '#64748b' }}>{fmtDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SATISFACTION TAB
// ─────────────────────────────────────────────────────────────────────────────
function SatisfactionTab() {
  const token = localStorage.getItem('token');
  const h = { Authorization: `Bearer ${token}` };
  const [stats, setStats] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    axios.get('/api/live/satisfaction', { headers: h })
      .then(r => setStats(r.data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  function starLabel(r: number) {
    return ['', 'Très insatisfait', 'Insatisfait', 'Correct', 'Satisfait', 'Très satisfait'][r] || '';
  }

  function starEmoji(r: number) {
    return r >= 5 ? '😄' : r === 4 ? '🙂' : r === 3 ? '😐' : r === 2 ? '😕' : '😞';
  }

  const avgColor = !stats?.avg_rating ? '#94a3b8'
    : stats.avg_rating >= 4 ? '#16a34a'
    : stats.avg_rating >= 3 ? '#d97706'
    : '#dc2626';

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>
  );

  if (!stats || stats.total === 0) return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b' }}>Aucune évaluation pour l'instant</div>
      <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>Les avis des utilisateurs apparaîtront ici après chaque session live.</div>
    </div>
  );

  const maxCount = Math.max(...(stats.distribution || []).map((d: any) => d.count), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 38, fontWeight: 900, color: avgColor, lineHeight: 1 }}>
            {stats.avg_rating > 0 ? stats.avg_rating.toFixed(1) : '—'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 2, margin: '6px 0 4px' }}>
            {[1,2,3,4,5].map(i => (
              <span key={i} style={{ fontSize: 16, opacity: i <= Math.round(stats.avg_rating) ? 1 : 0.2 }}>⭐</span>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Note moyenne</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#6366f1', lineHeight: 1 }}>{stats.total}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Évaluations</div>
        </div>
        {stats.distribution?.filter((d: any) => d.rating >= 4).length > 0 && (() => {
          const satisfied = stats.distribution.filter((d: any) => d.rating >= 4).reduce((sum: number, d: any) => sum + d.count, 0);
          const pct = Math.round(satisfied / stats.total * 100);
          return (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '18px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: 12, color: '#15803d', marginTop: 8 }}>Satisfaits (4★+)</div>
            </div>
          );
        })()}
      </div>

      {/* ── Distribution bars ── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>Répartition des notes</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[5,4,3,2,1].map(star => {
            const d = stats.distribution?.find((x: any) => x.rating === star);
            const count = d?.count || 0;
            const pct = Math.round(count / maxCount * 100);
            const barColor = star >= 4 ? '#22c55e' : star === 3 ? '#f59e0b' : '#ef4444';
            return (
              <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 60, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                  {[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: 12, opacity: i <= star ? 1 : 0.15 }}>⭐</span>)}
                </div>
                <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, background: barColor, height: '100%', borderRadius: 6, transition: 'width 0.4s' }} />
                </div>
                <div style={{ width: 28, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#475569', flexShrink: 0 }}>{count}</div>
                <div style={{ width: 60, fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{starLabel(star)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Trend chart ── */}
      {stats.daily?.length > 1 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>Évolution de la satisfaction — 30 derniers jours</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80, overflowX: 'auto' }}>
            {stats.daily.map((d: any) => {
              const h = Math.round((d.avg_rating / 5) * 70);
              const c = d.avg_rating >= 4 ? '#22c55e' : d.avg_rating >= 3 ? '#f59e0b' : '#ef4444';
              return (
                <div key={d.day} title={`${d.day} — ★ ${d.avg_rating} (${d.count} avis)`}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1, minWidth: 20 }}>
                  <div style={{ width: '100%', height: h, background: c, borderRadius: '3px 3px 0 0', opacity: 0.85, minHeight: 3 }} />
                  <div style={{ fontSize: 8, color: '#94a3b8', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                    {d.day.substring(5)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Recent comments ── */}
      {stats.recent?.filter((r: any) => r.comment).length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>Commentaires récents</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stats.recent.filter((r: any) => r.comment).map((r: any, i: number) => (
              <div key={i} style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 16 }}>{starEmoji(r.rating)}</span>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: 12, opacity: i <= r.rating ? 1 : 0.2 }}>⭐</span>)}
                  </div>
                  <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
                    {new Date(r.created_at).toLocaleDateString('fr-FR')}
                  </span>
                  {r.ticket_id && (
                    <a href={`/tickets/${r.ticket_id}`} target="_blank" rel="noreferrer"
                      style={{ fontSize: 11, color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>
                      #{r.ticket_id}
                    </a>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, fontStyle: 'italic' }}>
                  "{r.comment}"
                </div>
                {(r.user_display_name || r.tech_display_name) && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                    👤 {r.user_display_name || '—'}
                    {r.tech_display_name && <span> · 👨‍💻 {r.tech_display_name}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── All ratings (no comment) ── */}
      {stats.recent?.filter((r: any) => !r.comment).length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>Évaluations sans commentaire</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {stats.recent.filter((r: any) => !r.comment).map((r: any, i: number) => (
              <span key={i} title={`${r.user_display_name || '—'} · ${new Date(r.created_at).toLocaleDateString('fr-FR')}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 10px', borderRadius: 20, fontSize: 12,
                  background: r.rating >= 4 ? '#f0fdf4' : r.rating >= 3 ? '#fffbeb' : '#fef2f2',
                  color: r.rating >= 4 ? '#15803d' : r.rating >= 3 ? '#92400e' : '#dc2626',
                  border: `1px solid ${r.rating >= 4 ? '#86efac' : r.rating >= 3 ? '#fde68a' : '#fecaca'}`,
                }}>
                {[...Array(r.rating)].map((_, i) => <span key={i} style={{ fontSize: 11 }}>⭐</span>)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TRANSPOSITION DES GROUPES GLPI → GROUPES APP ────────────────────────
interface GroupMapRow { glpi_group_id: number; group_name: string; ticket_count: number; app_group_id: number | null; }
interface AppGroupRef { id: number; name: string; description?: string; is_default?: boolean; }

function GroupMappingManager() {
  const [rows, setRows] = useState<GroupMapRow[]>([]);
  const [appGroups, setAppGroups] = useState<AppGroupRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [msg, setMsg] = useState('');
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/tickets/admin/group-mapping/used', { headers: { Authorization: `Bearer ${token}` } });
      setRows(res.data.rows || []);
      setAppGroups(res.data.appGroups || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  async function saveOne(glpiGroupId: number, appGroupId: number | null) {
    setRows(prev => prev.map(r => r.glpi_group_id === glpiGroupId ? { ...r, app_group_id: appGroupId } : r));
    try {
      const token = localStorage.getItem('token');
      await axios.put('/api/tickets/admin/group-mapping',
        { glpi_group_id: glpiGroupId, app_group_id: appGroupId },
        { headers: { Authorization: `Bearer ${token}` } });
    } catch { setMsg('Erreur lors de l\'enregistrement'); }
  }

  async function applyMapping() {
    if (!confirm('Appliquer les correspondances aux tickets existants ?')) return;
    setApplying(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/tickets/admin/group-mapping/apply', {}, { headers: { Authorization: `Bearer ${token}` } });
      setMsg(`Mappage appliqué : ${res.data.updated} assignation(s) de groupe créée(s).`);
    } catch { setMsg('Erreur lors de l\'application'); }
    finally { setApplying(false); }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>;

  const mappedCount = rows.filter(r => r.app_group_id != null).length;
  const displayedRows = onlyUnmapped ? rows.filter(r => r.app_group_id == null) : rows;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Transposition des groupes GLPI → Groupes techniciens</h3>
          <p style={{ margin: 0, fontSize: 12, color: '#71717a' }}>
            Associez chaque groupe GLPI à un groupe de techniciens de l'application. {mappedCount}/{rows.length} mappés.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setOnlyUnmapped(v => !v)}
            title="N'afficher que les groupes non mappés"
            style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${onlyUnmapped ? '#fbbf24' : '#e2e8f0'}`, background: onlyUnmapped ? '#fffbeb' : '#fff', color: onlyUnmapped ? '#92400e' : '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {onlyUnmapped ? '☑' : '☐'} Non mappés
          </button>
          <button onClick={applyMapping} disabled={applying} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#2563eb,#4f46e5)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {applying ? '…' : '✅ Appliquer aux tickets'}
          </button>
        </div>
      </div>
      {msg && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#166534', fontSize: 13 }}>{msg}</div>}

      <div style={{ maxHeight: '60vh', overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
              <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700, color: '#475569' }}>Groupe GLPI</th>
              <th style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 700, color: '#475569', width: 90 }}>Tickets</th>
              <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700, color: '#475569', width: 320 }}>Groupe APP</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map(r => (
              <tr key={r.glpi_group_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 12px', color: '#1e293b' }}>{r.group_name}</td>
                <td style={{ padding: '8px 12px', textAlign: 'center', color: '#64748b' }}>{r.ticket_count}</td>
                <td style={{ padding: '8px 12px' }}>
                  <select
                    value={r.app_group_id ?? ''}
                    onChange={e => saveOne(r.glpi_group_id, e.target.value ? parseInt(e.target.value) : null)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: `1.5px solid ${r.app_group_id ? '#e2e8f0' : '#fde68a'}`, background: r.app_group_id ? '#fff' : '#fffbeb', fontSize: 13 }}
                  >
                    <option value="">— Non mappé —</option>
                    {appGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {displayedRows.length === 0 && <tr><td colSpan={3} style={{ padding: 30, textAlign: 'center', color: '#cbd5e1' }}>{onlyUnmapped ? 'Tous les groupes sont mappés 🎉' : 'Aucun groupe GLPI utilisé.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamsConfig() {
  const token = localStorage.getItem('token');
  const [cfg, setCfg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<'ok' | 'ko' | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'ko' | null>(null);

  useEffect(() => {
    axios.get('/api/tickets/admin/teams-config', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setCfg(r.data))
      .catch(() => setCfg({ teams_enabled: 'false', teams_webhook_url: '', teams_thread_title: '🚨 Incident Critique', teams_min_urgency: '4', teams_min_impact: '4', teams_channel_name: 'crise', teams_portal_url: 'https://dsihub.ivry.local' }))
      .finally(() => setLoading(false));
  }, [token]);

  const update = (key: string, val: any) => setCfg((prev: any) => ({ ...prev, [key]: val }));

  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await axios.put('/api/tickets/admin/teams-config', cfg, { headers: { Authorization: `Bearer ${token}` } });
      setSaveMsg('ok');
    } catch (e: any) {
      console.error('[TEAMS-SAVE]', e.response?.data || e.message);
      setSaveMsg('ko');
    }
    finally { setSaving(false); }
  };

  const testWebhook = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await axios.post('/api/tickets/admin/test-teams-webhook', { teams_webhook_url: cfg.teams_webhook_url }, { headers: { Authorization: `Bearer ${token}` } });
      setTestResult('ok');
    } catch (e) { setTestResult('ko'); }
    finally { setTesting(false); }
  };

  const inputS = { padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const };
  const labelS = { fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 4 };

  if (loading) return <div style={{ color: '#94a3b8', padding: 20 }}>Chargement...</div>;
  if (!cfg) return <div style={{ color: '#ef4444', padding: 20 }}>Erreur de chargement</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 16 }}>🔗 Configuration du webhook Teams</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <label style={{ fontWeight: 600, fontSize: 13, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={cfg.teams_enabled === 'true' || cfg.teams_enabled === true} onChange={e => update('teams_enabled', e.target.checked ? 'true' : 'false')} />
            Activer l'envoi vers Teams
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={labelS}>URL du webhook Teams</div>
          <input style={inputS} value={cfg.teams_webhook_url || ''} onChange={e => update('teams_webhook_url', e.target.value)} placeholder="https://...webhook.office.com/..." />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={labelS}>Nom du fil de discussion (thread)</div>
          <input style={inputS} value={cfg.teams_thread_title || ''} onChange={e => update('teams_thread_title', e.target.value)} placeholder="🚨 Incident Critique" />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Titre du message envoyé dans le canal Teams</div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={labelS}>URL du portail DSI Hub</div>
          <input style={inputS} value={cfg.teams_portal_url || ''} onChange={e => update('teams_portal_url', e.target.value)} placeholder="https://dsihub.ivry.local" />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Utilisé pour le lien "Voir le ticket" dans le message Teams</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={labelS}>Urgence minimale</div>
            <select style={inputS} value={cfg.teams_min_urgency || '4'} onChange={e => update('teams_min_urgency', e.target.value)}>
              <option value="2">Basse (2)</option>
              <option value="3">Normale (3)</option>
              <option value="4">Haute (4)</option>
              <option value="5">Très haute (5)</option>
            </select>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Seuil minimum d'urgence pour déclencher l'alerte</div>
          </div>
          <div>
            <div style={labelS}>Impact minimal</div>
            <select style={inputS} value={cfg.teams_min_impact || '4'} onChange={e => update('teams_min_impact', e.target.value)}>
              <option value="2">1 utilisateur (2)</option>
              <option value="3">Groupe de travail (3)</option>
              <option value="4">Service / Direction (4)</option>
              <option value="5">Global (5)</option>
            </select>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Seuil minimum d'impact pour déclencher l'alerte</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} disabled={saving} style={{
            padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6,
            cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: saving ? 0.6 : 1
          }}>
            {saving ? 'Enregistrement...' : '💾 Enregistrer'}
          </button>
          {saveMsg === 'ok' && <span style={{ color: '#16a34a', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}>✓ Enregistré</span>}
          {saveMsg === 'ko' && <span style={{ color: '#dc2626', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}>✗ Erreur d'enregistrement</span>}
          <button onClick={testWebhook} disabled={testing || !cfg.teams_webhook_url} style={{
            padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 6,
            cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: testing || !cfg.teams_webhook_url ? 0.6 : 1
          }}>
            {testing ? 'Test en cours...' : '📤 Tester le webhook'}
          </button>
          {testResult === 'ok' && <span style={{ color: '#16a34a', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}>✓ Succès</span>}
          {testResult === 'ko' && <span style={{ color: '#dc2626', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}>✗ Échec</span>}
        </div>
      </div>

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 8 }}>📋 Fonctionnement</div>
        <ul style={{ fontSize: 13, color: '#64748b', lineHeight: 1.8, margin: 0, paddingLeft: 20 }}>
          <li>Un message est envoyé dans le canal <strong>Teams</strong> configuré quand un ticket atteint les seuils d'<strong>urgence</strong> et d'<strong>impact</strong> définis ci-dessus.</li>
          <li>Un message de <strong>résolution</strong> est envoyé quand le ticket critique est résolu (statut 5).</li>
          <li>Les messages contiennent un lien direct vers le ticket dans le portail DSI Hub.</li>
          <li>Utilisez le bouton "Tester" ci-dessus pour valider la connexion avant d'activer.</li>
        </ul>
      </div>
    </div>
  );
}
