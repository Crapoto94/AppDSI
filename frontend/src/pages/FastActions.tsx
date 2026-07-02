import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import AddTaskModal from '../components/AddTaskModal';

function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '@#$!%';
  const all = upper + lower + digits + special;
  const chars: string[] = [
    upper[Math.floor(Math.random() * upper.length)],
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    digits[Math.floor(Math.random() * digits.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  while (chars.length < 12) chars.push(all[Math.floor(Math.random() * all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const STATUS_COLORS: Record<number, string> = {
  1: '#6366f1', 2: '#8b5cf6', 3: '#0ea5e9', 4: '#f59e0b', 5: '#22c55e', 6: '#64748b', 8: '#ef4444',
};

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Très basse', color: '#64748b' },
  2: { label: 'Basse', color: '#0891b2' },
  3: { label: 'Normale', color: '#6366f1' },
  4: { label: 'Haute', color: '#f59e0b' },
  5: { label: 'Très haute', color: '#ef4444' },
  6: { label: 'Majeure', color: '#dc2626' },
};

export default function FastActions() {
  const { user } = useAuth();
  const [resolvedRole, setResolvedRole] = useState<string | null>(null);

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto actions ──
  const [showAutoActions, setShowAutoActions] = useState(false);
  const [aaStep, setAaStep] = useState(0);
  const [aaBeneficiaires, setAaBeneficiaires] = useState<any[]>([]);
  const [aaBenefLoading, setAaBenefLoading] = useState(false);
  const [aaSearch, setAaSearch] = useState('');
  const [aaSelected, setAaSelected] = useState<any>(null);
  const [aaPassword, setAaPassword] = useState('');
  const [aaSmsMsg, setAaSmsMsg] = useState('');
  const [aaSettings, setAaSettings] = useState<{ sms_message: string; sms_tuto_link: string; ad_sync_url: string } | null>(null);
  const [aaShowSettings, setAaShowSettings] = useState(false);
  const [aaSettingsDraft, setAaSettingsDraft] = useState({ sms_message: '', sms_tuto_link: '', ad_sync_url: '' });
  const [aaSending, setAaSending] = useState(false);
  const [aaSyncing, setAaSyncing] = useState(false);
  const [aaStepStatus, setAaStepStatus] = useState(0);
  const [aaError, setAaError] = useState('');
  const [aaSuccess, setAaSuccess] = useState('');
  const [aaAdWarning, setAaAdWarning] = useState('');
  const [aaAdSearchQuery, setAaAdSearchQuery] = useState('');
  const [aaAdSearchResults, setAaAdSearchResults] = useState<any[]>([]);
  const [aaAdSearching, setAaAdSearching] = useState(false);
  const [aaAdSelectedUser, setAaAdSelectedUser] = useState<any>(null);
  const [aaAdToggling, setAaAdToggling] = useState(false);

  // ── Task modal ──
  const [showTaskModal, setShowTaskModal] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    axios.get('/api/tickets/my-role', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setResolvedRole(r.data.role))
      .catch(() => {});
    axios.get('/api/tickets/auto-actions/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { setAaSettings(r.data); setAaSettingsDraft(r.data); })
      .catch(() => {});
  }, []);

  const canAutoActions = ['superadmin', 'superadmins', 'admin', 'supervisor', 'superviseur'].includes((resolvedRole ?? user?.role ?? '').toLowerCase().trim());

  // ── Search handler ──
  async function performSearch(q: string) {
    if (!q.trim() || q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const token = localStorage.getItem('token');
      const r = await axios.get(`/api/tickets?lite=1&search=${encodeURIComponent(q.trim())}&limit=10`, { headers: { Authorization: `Bearer ${token}` } });
      setSearchResults(r.data.data || []);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  }

  function handleSearchInput(q: string) {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim() || q.trim().length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(() => performSearch(q), 350);
  }

  // ── Auto actions: open ──
  function openAutoActions() {
    setShowAutoActions(true);
    setAaStep(0);
    setAaSelected(null);
    setAaSearch('');
    setAaError('');
    setAaSuccess('');
    setAaAdWarning('');
  }

  function closeAutoActions() {
    setShowAutoActions(false);
    setAaStep(0);
    setAaShowSettings(false);
    setAaAdWarning('');
  }

  // ── Auto actions: step 1 — load beneficiaries ──
  async function loadBeneficiaries() {
    setAaStep(1);
    setAaBenefLoading(true);
    setAaError('');
    setAaShowSettings(false);
    try {
      const tk = localStorage.getItem('token');
      const r = await axios.get('/api/tickets/auto-actions/beneficiaires', { headers: { Authorization: `Bearer ${tk}` } });
      setAaBeneficiaires(r.data || []);
    } catch { setAaError('Impossible de charger la liste des bénéficiaires.'); }
    finally { setAaBenefLoading(false); }
  }

  // ── Auto actions: generate password & send directly (no confirmation) ──
  async function sendSmsDirect() {
    const pwd = generatePassword();
    const msg = (aaSettings?.sms_message || 'Mot de passe : {MOT_DE_PASSE}')
      .replace('{PRENOM}', aaSelected?.prenom || aaSelected?.nom || '')
      .replace('{MOT_DE_PASSE}', pwd)
      .replace('{LIEN}', aaSettings?.sms_tuto_link || '');
    setAaPassword(pwd);
    setAaSmsMsg(msg);
    setAaStep(2);
    setAaError('');
    setAaSuccess('');
    setAaAdWarning('');
    setAaSending(true);
    setAaStepStatus(1);
    const t1 = setTimeout(() => setAaStepStatus(2), 2000);
    const t2 = setTimeout(() => setAaStepStatus(3), 4000);
    try {
      const tk = localStorage.getItem('token');
      const r = await axios.post('/api/tickets/auto-actions/password-sms', {
        phone: aaSelected.phone, prenom: aaSelected.prenom || '', nom: aaSelected.nom || '',
        password: pwd, message: msg,
        ad_username: (aaSelected as any).ad_username || '',
      }, { headers: { Authorization: `Bearer ${tk}` } });
      const adLabel = r.data.ad_changed ? ' ✓' : '';
      const o365Label = r.data.o365_changed ? (r.data.o365_error ? ` · ${r.data.o365_error}` : ' · O365 ✓') : '';
      setAaSuccess(`SMS envoyé${adLabel}${o365Label}`);
      if (r.data.ad_error) setAaAdWarning(r.data.ad_error);
    } catch (e: any) {
      setAaStepStatus(4);
      clearTimeout(t1); clearTimeout(t2);
      setAaError(e.response?.data?.message || e.message || 'Erreur lors de l\'envoi du SMS.');
    } finally { clearTimeout(t1); clearTimeout(t2); setAaStepStatus(4); setAaSending(false); }
  }

  // ── Auto actions: step 3 — AD search ──
  async function searchAdUser() {
    if (aaAdSearchQuery.trim().length < 2) return;
    setAaAdSearching(true);
    setAaError('');
    setAaAdSelectedUser(null);
    try {
      const tk = localStorage.getItem('token');
      const r = await axios.get(`/api/tickets/auto-actions/ad-search?q=${encodeURIComponent(aaAdSearchQuery.trim())}`, { headers: { Authorization: `Bearer ${tk}` } });
      setAaAdSearchResults(r.data || []);
      if (!r.data?.length) setAaError('Aucun utilisateur trouvé.');
    } catch (e: any) { setAaError(e.response?.data?.message || 'Erreur de recherche.'); }
    finally { setAaAdSearching(false); }
  }

  async function selectAdUser(u: any) {
    setAaAdSelectedUser(u);
    setAaError('');
    try {
      const tk = localStorage.getItem('token');
      const r = await axios.get(`/api/tickets/auto-actions/ad-user-status?sam=${encodeURIComponent(u.sam)}`, { headers: { Authorization: `Bearer ${tk}` } });
      setAaAdSelectedUser(r.data);
    } catch (e: any) { setAaError(e.response?.data?.message || 'Erreur de récupération du statut.'); }
  }

  async function toggleAdUser() {
    setAaAdToggling(true);
    setAaError('');
    setAaSuccess('');
    try {
      const tk = localStorage.getItem('token');
      const newState = !aaAdSelectedUser.enabled;
      const r = await axios.post('/api/tickets/auto-actions/ad-user-toggle',
        { sam: aaAdSelectedUser.sam, enable: newState },
        { headers: { Authorization: `Bearer ${tk}` } }
      );
      setAaAdSelectedUser({ ...aaAdSelectedUser, enabled: newState });
      const syncMsg = r.data.sync_triggered ? ' · Synchro Azure déclenchée ✓' : '';
      setAaSuccess(`Compte ${aaAdSelectedUser.sam} ${newState ? 'activé' : 'désactivé'} avec succès${syncMsg}`);
    } catch (e: any) { setAaError(e.response?.data?.message || 'Erreur lors du changement de statut.'); }
    finally { setAaAdToggling(false); }
  }

  async function unlockAdUser() {
    setAaAdToggling(true);
    setAaError('');
    setAaSuccess('');
    try {
      const tk = localStorage.getItem('token');
      const r = await axios.post('/api/tickets/auto-actions/ad-user-unlock',
        { sam: aaAdSelectedUser.sam },
        { headers: { Authorization: `Bearer ${tk}` } }
      );
      setAaAdSelectedUser({ ...aaAdSelectedUser, locked: false });
      const syncMsg = r.data.sync_triggered ? ' · Synchro Azure déclenchée ✓' : '';
      setAaSuccess(`Compte ${aaAdSelectedUser.sam} déverrouillé avec succès${syncMsg}`);
    } catch (e: any) { setAaError(e.response?.data?.message || 'Erreur lors du déverrouillage.'); }
    finally { setAaAdToggling(false); }
  }

  async function forcePwdChange() {
    setAaAdToggling(true);
    setAaError('');
    setAaSuccess('');
    try {
      const tk = localStorage.getItem('token');
      const r = await axios.post('/api/tickets/auto-actions/ad-user-force-pwd-change',
        { sam: aaAdSelectedUser.sam },
        { headers: { Authorization: `Bearer ${tk}` } }
      );
      setAaAdSelectedUser({ ...aaAdSelectedUser, pwdLastSet: '0' });
      const syncMsg = r.data.sync_triggered ? ' · Synchro Azure déclenchée ✓' : '';
      setAaSuccess(`Changement de mot de passe forcé pour ${aaAdSelectedUser.sam}${syncMsg}`);
    } catch (e: any) { setAaError(e.response?.data?.message || 'Erreur.'); }
    finally { setAaAdToggling(false); }
  }

  async function saveAaSettings() {
    try {
      const tk = localStorage.getItem('token');
      await axios.post('/api/tickets/auto-actions/settings', aaSettingsDraft, { headers: { Authorization: `Bearer ${tk}` } });
      setAaSettings(aaSettingsDraft);
      setAaShowSettings(false);
      setAaError('');
    } catch { setAaError('Erreur lors de la sauvegarde.'); }
  }

  // ── AD helpers ──
  function adDate(val: any) {
    if (!val || val === '0') return null;
    const n = Number(val);
    if (isNaN(n) || n === 0) return val;
    return new Date((n / 10000) - 11644473600000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function pwdAge(val: any) {
    if (!val || val === '0') return '—';
    const n = Number(val);
    if (isNaN(n) || n === 0) return '—';
    const d = new Date((n / 10000) - 11644473600000);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days < 0) return '0 jour';
    return `${days} jour${days > 1 ? 's' : ''}`;
  }
  function whenCreated(val: any) {
    if (!val) return '—';
    const s = String(val);
    const m = s.match(/^(\d{4})(\d{2})(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
  }

  const style = document.createElement('style');
  style.textContent = `
    .fast-page { min-height: 100vh; background: #f8fafc; font-family: system-ui, -apple-system, sans-serif; -webkit-tap-highlight-color: transparent; }
    .fast-header { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #e2e8f0; padding: 14px 16px; display: flex; align-items: center; gap: 12px; z-index: 100; padding-top: max(14px, env(safe-area-inset-top)); }
    .fast-content { max-width: 480px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; padding-bottom: max(40px, env(safe-area-inset-bottom)); }
    .fast-card { background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; }
    .fast-action-btn { display: flex; align-items: center; gap: 16px; padding: 22px 20px; border: none; background: #fff; cursor: pointer; text-align: left; width: 100%; transition: background 0.12s; min-height: 76px; }
    .fast-action-btn:active { background: #f8fafc; }
    .fast-action-icon { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
    .fast-action-title { font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.3; }
    .fast-action-desc { font-size: 13px; color: #64748b; margin-top: 2px; }
    .fast-input { width: 100%; box-sizing: border-box; padding: 14px 16px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 16px; outline: none; transition: border-color 0.15s; }
    .fast-input:focus { border-color: #6366f1; }
    .fast-btn-primary { width: 100%; padding: 14px; border: none; border-radius: 12px; background: #6366f1; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; transition: background 0.12s; }
    .fast-btn-primary:active { background: #4f46e5; }
    .fast-btn-primary:disabled { background: #c7d2fe; cursor: default; }
    .fast-search-result { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.1s; }
    .fast-search-result:active { background: #f8fafc; }
    .fast-search-result:last-child { border-bottom: none; }
    .fast-aa-overlay { position: fixed; inset: 0; background: #fff; z-index: 10001; display: flex; flex-direction: column; }
    .fast-aa-header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid #f1f5f9; padding-top: max(14px, env(safe-area-inset-top)); flex-shrink: 0; }
    .fast-aa-body { flex: 1; overflow-y: auto; padding: 16px; padding-bottom: max(16px, env(safe-area-inset-bottom)); }
    .fast-aa-footer { padding: 12px 16px; border-top: 1px solid #f1f5f9; padding-bottom: max(12px, env(safe-area-inset-bottom)); flex-shrink: 0; }
    .fast-aa-action { display: flex; align-items: flex-start; gap: 14px; padding: 18px; border: 1.5px solid #e2e8f0; border-radius: 14px; background: #f8fafc; cursor: pointer; text-align: left; width: 100%; transition: border-color 0.12s; }
    .fast-aa-action:active { border-color: #fbbf24; }
    @keyframes fastSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
    .fast-aa-overlay { animation: fastSlideUp 0.22s ease; }
  `;
  document.head.appendChild(style);

  return (
    <div className="fast-page">
      {/* Header */}
      <div className="fast-header">
        <button onClick={() => window.history.back()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        </button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Actions rapides</h1>
      </div>

      <div className="fast-content">
        {/* ── Nouveau ticket ── */}
        <div className="fast-card">
          <button className="fast-action-btn" onClick={() => window.location.href = '/tickets/new'}>
            <div className="fast-action-icon" style={{ background: '#eef2ff', color: '#6366f1' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div>
              <div className="fast-action-title">Nouveau ticket</div>
              <div className="fast-action-desc">Créer un ticket d'incident ou de demande</div>
            </div>
          </button>
        </div>

        {/* ── Recherche ── */}
        <div className="fast-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Rechercher un ticket
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="fast-input"
              style={{ flex: 1 }}
              value={searchQuery}
              onChange={e => handleSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && searchQuery.trim()) { if (searchTimer.current) clearTimeout(searchTimer.current); performSearch(searchQuery); } }}
              placeholder="N° ticket, titre, mot-clé…"
            />
            <button className="fast-btn-primary" style={{ width: 'auto', padding: '14px 18px' }}
              onClick={() => { if (!searchQuery.trim()) return; if (searchTimer.current) clearTimeout(searchTimer.current); performSearch(searchQuery); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
          </div>

          {/* Results */}
          {searching && (
            <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 14 }}>Recherche…</div>
          )}
          {!searching && searchResults.length > 0 && (
            <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 4 }}>
              {searchResults.map(t => {
                const sid = typeof t.status === 'object' ? t.status?.id : t.status;
                const slabel = typeof t.status === 'object' ? t.status?.label : `Statut ${sid}`;
                const scolor = STATUS_COLORS[sid] || '#64748b';
                const prio = PRIORITY_LABELS[t.priority] || PRIORITY_LABELS[3];
                return (
                  <div key={t.id} className="fast-search-result" onClick={() => window.location.href = `/tickets/${t.id}`}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `${scolor}18`, color: scolor, fontSize: 11, fontWeight: 800,
                    }}>
                      #{t.glpi_id || t.id}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 8, background: `${scolor}18`, color: scolor }}>{slabel}</span>
                        <span style={{ fontSize: 11, color: prio.color, fontWeight: 600 }}>{prio.label}</span>
                      </div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6"/></svg>
                  </div>
                );
              })}
            </div>
          )}
          {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 14 }}>Aucun ticket trouvé</div>
          )}
        </div>

        {/* ── Créer une tâche ── */}
        <div className="fast-card">
          <button className="fast-action-btn" onClick={() => setShowTaskModal(true)}>
            <div className="fast-action-icon" style={{ background: '#f0fdf4', color: '#22c55e' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            </div>
            <div>
              <div className="fast-action-title">Créer une tâche</div>
              <div className="fast-action-desc">Nouvelle tâche personnelle ou d'équipe</div>
            </div>
          </button>
        </div>

        {/* ── Actions auto ── */}
        {canAutoActions ? (
          <div className="fast-card">
            <button className="fast-action-btn" onClick={openAutoActions}>
              <div className="fast-action-icon" style={{ background: '#fffbeb', color: '#f59e0b' }}>⚡</div>
              <div>
                <div className="fast-action-title">Actions auto</div>
                <div className="fast-action-desc">Mdp par SMS, activer/désactiver un compte AD</div>
              </div>
            </button>
          </div>
        ) : (
          <div className="fast-card" style={{ opacity: 0.5 }}>
            <div className="fast-action-btn" style={{ cursor: 'default' }}>
              <div className="fast-action-icon" style={{ background: '#f1f5f9', color: '#94a3b8' }}>⚡</div>
              <div>
                <div className="fast-action-title" style={{ color: '#94a3b8' }}>Actions auto</div>
                <div className="fast-action-desc">Réservé aux superviseurs et administrateurs</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Auto actions full-screen overlay ── */}
      {showAutoActions && createPortal(
        <div className="fast-aa-overlay">
          {/* Header */}
          <div className="fast-aa-header">
            {aaStep > 0 && (
              <button onClick={() => { setAaStep(aaStep - 1); setAaError(''); setAaSuccess(''); setAaAdWarning(''); setAaShowSettings(false); }}
                style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 14, color: '#475569' }}>
                ←
              </button>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
                {aaStep === 0 ? '⚡ Actions automatiques' : aaStep === 1 ? '🔑 Mot de passe par SMS' : aaStep === 2 ? '📱 Envoi SMS' : '🔁 Compte AD'}
              </div>
              {aaStep === 1 && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Sélectionnez le bénéficiaire</div>}
              {aaStep === 2 && aaSelected && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{aaSelected.prenom || ''} {aaSelected.nom}</div>}
            </div>
            <button onClick={closeAutoActions}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#94a3b8', lineHeight: 1 }}>✕</button>
          </div>

          {/* Body */}
          <div className="fast-aa-body">

            {/* ── Step 0: action list ── */}
            {aaStep === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ margin: '0 0 4px', fontSize: 13, color: '#64748b' }}>Sélectionnez une action à exécuter.</p>

                <button onClick={loadBeneficiaries} className="fast-aa-action">
                  <span style={{ fontSize: 28, lineHeight: 1 }}>🔑</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Renouveler mot de passe par SMS</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Génère un mot de passe sécurisé et l'envoie par SMS à un élu ou un encadrant.</div>
                  </div>
                </button>

                <button onClick={() => { setAaStep(3); setAaAdSearchQuery(''); setAaAdSearchResults([]); setAaAdSelectedUser(null); setAaError(''); setAaSuccess(''); }} className="fast-aa-action">
                  <span style={{ fontSize: 28, lineHeight: 1 }}>🔁</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Activer / Désactiver un compte AD</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Recherche un utilisateur dans l'AD et change son état avec synchro Azure.</div>
                  </div>
                </button>

                <button className="fast-aa-action" style={{ cursor: 'pointer' }} onClick={async () => {
                  setAaError(''); setAaSuccess(''); setAaSyncing(true);
                  try {
                    const tk = localStorage.getItem('token');
                    const r = await axios.post('/api/tickets/auto-actions/trigger-sync', {}, { headers: { Authorization: `Bearer ${tk}` } });
                    setAaSuccess(r.data?.message || 'Synchro O365 déclenchée.');
                  } catch (e: any) {
                    setAaError(e.response?.data?.message || e.message || 'Erreur de synchro O365.');
                  } finally { setAaSyncing(false); }
                }}>
                  <span style={{ fontSize: 28, lineHeight: 1 }}>🔄</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Déclencher synchro O365</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Lance une synchro Azure AD Connect pour propager les changements AD vers O365.</div>
                  </div>
                </button>

                {aaSyncing && <div style={{ textAlign: 'center', padding: 12, color: '#0369a1', fontSize: 13 }}>⏳ Synchro O365 en cours…</div>}
                {!aaSyncing && aaSuccess && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', color: '#166534', fontSize: 13 }}>✅ {aaSuccess}</div>}
                {!aaSyncing && aaError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>{aaError}</div>}

                {/* Settings */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, marginTop: 6 }}>
                  <button onClick={() => { setAaShowSettings(!aaShowSettings); setAaSettingsDraft(aaSettings || { sms_message: '', sms_tuto_link: '', ad_sync_url: '' }); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, padding: 0, fontWeight: 600 }}>
                    ⚙️ Paramétrage SMS {aaShowSettings ? '▲' : '▼'}
                  </button>
                  {aaShowSettings && (
                    <div style={{ marginTop: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 12, color: '#475569', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                          Template SMS <span style={{ fontWeight: 400 }}>({'{PRENOM}'} {'{MOT_DE_PASSE}'} {'{LIEN}'})</span>
                        </label>
                        <textarea value={aaSettingsDraft.sms_message} onChange={e => setAaSettingsDraft(d => ({ ...d, sms_message: e.target.value }))} rows={4}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: '#475569', display: 'block', marginBottom: 4, fontWeight: 600 }}>Lien tutoriel ({'{LIEN}'})</label>
                        <input value={aaSettingsDraft.sms_tuto_link} onChange={e => setAaSettingsDraft(d => ({ ...d, sms_tuto_link: e.target.value }))} placeholder="https://…"
                          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: '#475569', display: 'block', marginBottom: 4, fontWeight: 600 }}>URL synchro AD Connect</label>
                        <input value={aaSettingsDraft.ad_sync_url || ''} onChange={e => setAaSettingsDraft(d => ({ ...d, ad_sync_url: e.target.value }))} placeholder="http://O365:8088/trigger-sync"
                          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }} />
                      </div>
                      {aaError && <div style={{ color: '#dc2626', fontSize: 12 }}>{aaError}</div>}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setAaShowSettings(false); setAaError(''); }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#64748b' }}>Annuler</button>
                        <button onClick={saveAaSettings} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Sauvegarder</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Step 1: beneficiary select ── */}
            {aaStep === 1 && (
              <div>
                <input value={aaSearch} onChange={e => setAaSearch(e.target.value)} placeholder="🔍 Rechercher (nom, prénom, téléphone…)"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1.5px solid #e2e8f0', borderRadius: 12, fontSize: 15, marginBottom: 14, outline: 'none' }} />
                {aaBenefLoading && <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Chargement…</div>}
                {!aaBenefLoading && (() => {
                  const q = aaSearch.toLowerCase();
                  const filtered = aaBeneficiaires.filter(b =>
                    !q || `${b.prenom || ''} ${b.nom || ''} ${b.phone || ''} ${b.service || ''} ${b.fonction || ''}`.toLowerCase().includes(q)
                  );
                  const elus = filtered.filter(b => b.type === 'elu');
                  const encadrants = filtered.filter(b => b.type === 'encadrant');
                  const renderGroup = (label: string, items: any[], badgeColor: string) => items.length === 0 ? null : (
                    <div key={label} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
                      {items.map(b => (
                        <div key={b.id} onClick={() => setAaSelected(aaSelected?.id === b.id ? null : b)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 10, cursor: 'pointer', marginBottom: 6, border: `1.5px solid ${aaSelected?.id === b.id ? '#fbbf24' : '#e2e8f0'}`, background: aaSelected?.id === b.id ? '#fffbeb' : '#fff' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{[b.prenom, b.nom].filter(Boolean).join(' ') || '—'}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: badgeColor + '20', color: badgeColor }}>{label.slice(0, -1)}</span>
                            </div>
                            {(b.fonction || b.service) && <span style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.3 }}>{b.fonction}{b.service ? ` · ${b.service}` : ''}</span>}
                          </div>

                        </div>
                      ))}
                    </div>
                  );
                  return (
                    <div>
                      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: 14 }}>Aucun résultat.</div>}
                      {renderGroup('Élus', elus, '#0284c7')}
                      {renderGroup('Encadrants', encadrants, '#7c3aed')}
                    </div>
                  );
                })()}
                {aaError && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>{aaError}</div>}
              </div>
            )}

            {/* ── Step 2: SMS en cours / résultat (pas de mot de passe affiché) ── */}
            {aaStep === 2 && aaSelected && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {aaError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', color: '#dc2626', fontSize: 13 }}>{aaError}</div>}
                {aaSending && <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '12px 14px', color: '#0369a1', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div>{aaStepStatus >= 1 ? '✅' : '⏳'} 1. Changement mot de passe AD{aaStepStatus > 1 ? ' ✓' : aaStepStatus === 1 ? '…' : ''}</div>
                  <div>{aaStepStatus >= 2 ? '✅' : '⏳'} 2. Envoi SMS{aaStepStatus > 2 ? ' ✓' : aaStepStatus === 2 ? '…' : ''}</div>
                  <div>{aaStepStatus >= 3 ? '✅' : '⏳'} 3. Synchro Azure AD Connect{aaStepStatus > 3 ? ' ✓' : aaStepStatus === 3 ? '…' : ''}</div>
                </div>}
                {aaSuccess && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px', color: '#166534', fontSize: 13 }}>✅ {aaSuccess}</div>}
                {aaAdWarning && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', color: '#92400e', fontSize: 13 }}>⚠️ AD : {aaAdWarning}</div>}
              </div>
            )}

            {/* ── Step 3: AD toggle ── */}
            {aaStep === 3 && (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <input value={aaAdSearchQuery} onChange={e => setAaAdSearchQuery(e.target.value)}
                    placeholder="🔍 Rechercher (nom, login, email…)"
                    onKeyDown={e => { if (e.key === 'Enter') searchAdUser(); }}
                    style={{ flex: 1, padding: '12px 14px', border: '1.5px solid #e2e8f0', borderRadius: 12, fontSize: 15, outline: 'none' }} />
                  <button onClick={searchAdUser} style={{ padding: '12px 18px', borderRadius: 12, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>OK</button>
                </div>

                {aaAdSearching && <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Recherche…</div>}

                {!aaAdSearching && aaAdSearchResults.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Résultats ({aaAdSearchResults.length})</div>
                    {aaAdSearchResults.map(u => (
                      <div key={u.sam} onClick={() => selectAdUser(u)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 10, cursor: 'pointer', marginBottom: 6, border: `1.5px solid ${aaAdSelectedUser?.sam === u.sam ? '#fbbf24' : '#e2e8f0'}`, background: aaAdSelectedUser?.sam === u.sam ? '#fffbeb' : '#fff' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{u.displayName || u.sam}</div>
                          <span style={{ fontSize: 11, color: '#64748b' }}>{u.sam}{u.mail ? ` · ${u.mail}` : ''}{u.department ? ` · ${u.department}` : ''}</span>
                        </div>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: u.enabled ? '#dcfce7' : '#fee2e2', color: u.enabled ? '#166534' : '#991b1b', fontWeight: 700 }}>
                          {u.enabled ? 'ACTIF' : 'DÉSACTIVÉ'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {aaAdSelectedUser?.dn && (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{aaAdSelectedUser.displayName || aaAdSelectedUser.sam}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{aaAdSelectedUser.sam}{aaAdSelectedUser.mail ? ` · ${aaAdSelectedUser.mail}` : ''}</div>
                    {aaAdSelectedUser.title && <div style={{ fontSize: 12, color: '#64748b' }}>{aaAdSelectedUser.title}</div>}
                    {aaAdSelectedUser.department && <div style={{ fontSize: 12, color: '#64748b' }}>{aaAdSelectedUser.department}</div>}
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, fontWeight: 600, flexWrap: 'wrap' }}>
                      <span>Statut : <span style={{ padding: '2px 8px', borderRadius: 10, background: aaAdSelectedUser.enabled ? '#dcfce7' : '#fee2e2', color: aaAdSelectedUser.enabled ? '#166534' : '#991b1b' }}>
                        {aaAdSelectedUser.enabled ? 'ACTIF' : 'DÉSACTIVÉ'}
                      </span></span>
                      {aaAdSelectedUser.locked && <span>🔒 <span style={{ padding: '2px 8px', borderRadius: 10, background: '#fef3c7', color: '#92400e' }}>VERROUILLÉ</span></span>}
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: '#475569' }}>
                      <div>🕐 Dernière connexion : {adDate(aaAdSelectedUser.lastLogon) || '—'}</div>
                      <div>🔑 Âge du mot de passe : {pwdAge(aaAdSelectedUser.pwdLastSet)}</div>
                      <div>📅 Création : {whenCreated(aaAdSelectedUser.whenCreated)}</div>
                      <div>⏳ Expiration : {adDate(aaAdSelectedUser.accountExpires) || 'Jamais'}</div>
                    </div>
                  </div>
                )}

                {aaError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', color: '#991b1b', fontSize: 13, marginBottom: 12 }}>❌ {aaError}</div>}
                {aaSuccess && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px', color: '#166534', fontSize: 13, marginBottom: 12 }}>✅ {aaSuccess}</div>}
              </div>
            )}
          </div>

          {/* Footer */}
          {aaStep === 1 && (
            <div className="fast-aa-footer">
              <button disabled={!aaSelected} onClick={sendSmsDirect}
                style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: aaSelected ? '#f59e0b' : '#e2e8f0', color: aaSelected ? '#fff' : '#94a3b8', fontWeight: 700, fontSize: 15, cursor: aaSelected ? 'pointer' : 'default' }}>
                📱 Envoyer SMS + changer MDP AD
              </button>
            </div>
          )}
          {aaStep === 2 && aaSelected && (
            <div className="fast-aa-footer">
              {(aaSuccess || aaError) && (
                <button onClick={closeAutoActions}
                  style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                  Fermer
                </button>
              )}
            </div>
          )}
          {aaStep === 3 && aaAdSelectedUser?.dn && (
            <div className="fast-aa-footer" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {aaSuccess ? (
                <button onClick={() => { setAaStep(0); setAaAdSearchQuery(''); setAaAdSearchResults([]); setAaAdSelectedUser(null); setAaError(''); setAaSuccess(''); }}
                  style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                  Fermer
                </button>
              ) : (
                <>
                  <button disabled={aaAdToggling} onClick={toggleAdUser}
                    style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: aaAdToggling ? '#e2e8f0' : (aaAdSelectedUser.enabled ? '#ef4444' : '#22c55e'), color: aaAdToggling ? '#94a3b8' : '#fff', fontWeight: 700, fontSize: 15, cursor: aaAdToggling ? 'default' : 'pointer' }}>
                    {aaAdToggling ? '⏳ Patientez…' : `${aaAdSelectedUser.enabled ? '🔒 Désactiver' : '🔓 Activer'} le compte`}
                  </button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {aaAdSelectedUser.locked && (
                      <button disabled={aaAdToggling} onClick={unlockAdUser}
                        style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        🔓 Déverrouiller
                      </button>
                    )}
                    <button disabled={aaAdToggling} onClick={forcePwdChange}
                      style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                      🔑 Forcer changement mdp
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>,
        document.body
      )}

      {/* ── Task modal ── */}
      {showTaskModal && (
        <AddTaskModal
          token={localStorage.getItem('token')}
          contextSource="personal"
          onCreated={() => setShowTaskModal(false)}
          onClose={() => setShowTaskModal(false)}
        />
      )}
    </div>
  );
}
