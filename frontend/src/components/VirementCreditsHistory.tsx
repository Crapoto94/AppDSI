import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Eye, Trash2, Settings } from 'lucide-react';
import VirementCreditsModal, { ETATS, type VirementRec } from './VirementCreditsModal';

const s: Record<string, React.CSSProperties> = {
  card: { background: 'var(--card-bg, #fff)', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem' },
  input: { width: '100%', padding: '0.5rem 0.7rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.9rem', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: 4 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' },
  th: { textAlign: 'left', padding: '0.5rem', fontSize: '0.72rem', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' },
  td: { padding: '0.5rem', fontSize: '0.85rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' },
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
const fmtMoney = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

const VirementCreditsHistory: React.FC<{ refreshKey: number; direction: string }> = ({ refreshKey, direction }) => {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const [rows, setRows] = useState<VirementRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ to: 'budget@ivry94.fr', cc: '' });
  const [saved, setSaved] = useState('');

  const load = useCallback(() => {
    fetch('/api/budget/virement-credits', { headers })
      .then(r => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    fetch('/api/budget/virement-credits/settings', { headers }).then(r => (r.ok ? r.json() : null)).then(v => v && setSettings(v)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSettings = async () => {
    const r = await fetch('/api/budget/virement-credits/settings', {
      method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
    });
    if (r.ok) { setSettings(await r.json()); setSaved('Paramètres enregistrés.'); } else setSaved("Échec de l'enregistrement.");
  };

  const remove = async (id: number) => {
    if (!window.confirm('Supprimer ce brouillon ?')) return;
    const r = await fetch(`/api/budget/virement-credits/${id}`, { method: 'DELETE', headers });
    if (r.ok) load(); else alert((await r.json().catch(() => ({}))).message || 'Suppression impossible');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', flex: 1 }}>Historique des virements de crédits</h3>
          <button style={{ ...s.btn, background: '#64748b' }} onClick={() => setShowSettings(v => !v)}>
            <Settings size={15} /> Paramètres d'envoi
          </button>
        </div>
        {showSettings && (
          <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.9rem', alignItems: 'end' }}>
            <div>
              <label style={s.label}>Destinataire</label>
              <input style={s.input} value={settings.to} onChange={e => setSettings({ ...settings, to: e.target.value })} />
            </div>
            <div>
              <label style={s.label}>Copie (CC) — plusieurs adresses séparées par une virgule</label>
              <input style={s.input} value={settings.cc} onChange={e => setSettings({ ...settings, cc: e.target.value })} placeholder="prenom.nom@ivry94.fr" />
            </div>
            <div>
              <button style={s.btn} onClick={saveSettings}>Enregistrer</button>
              {saved && <span style={{ marginLeft: 10, fontSize: '0.8rem', color: '#16a34a' }}>{saved}</span>}
            </div>
          </div>
        )}
      </div>

      <div style={{ ...s.card, overflowX: 'auto' }}>
        {loading ? 'Chargement…' : rows.length === 0 ? (
          <div style={{ color: '#94a3b8' }}>Aucune demande pour le moment.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={s.th}>N°</th><th style={s.th}>Date</th><th style={s.th}>Service</th><th style={s.th}>Demandeur</th>
                <th style={s.th}>Section</th><th style={s.th}>Type</th><th style={{ ...s.th, textAlign: 'right' }}>Montant</th>
                <th style={s.th}>Motivation</th><th style={s.th}>État</th><th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const e = ETATS[r.etat];
                return (
                  <tr key={r.id}>
                    <td style={s.td}>{r.id}</td>
                    <td style={s.td}>{fmtDate(r.date_demande || r.created_at)}</td>
                    <td style={s.td}>{r.service}</td>
                    <td style={s.td}>{r.created_by_name}</td>
                    <td style={s.td}>{r.section === 'I' ? 'Invest.' : 'Fonct.'} / {r.sens === 'D' ? 'Dép.' : 'Rec.'}</td>
                    <td style={s.td}>{r.compense ? 'Compensée' : 'Non compensée'}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(Number(r.montant))}</td>
                    <td style={{ ...s.td, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.motivation || ''}>{r.motivation}</td>
                    <td style={s.td}>
                      <span style={{ background: e.color, color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{e.label}</span>
                      {r.sent_at && <div style={{ fontSize: '0.7rem', color: '#64748b' }}>le {fmtDate(r.sent_at)}</div>}
                    </td>
                    <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                      <button title="Ouvrir / envoyer" onClick={() => setOpenId(r.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#2563eb' }}><Eye size={17} /></button>
                      {!r.parapheur_id && !r.sent_at && (
                        <button title="Supprimer" onClick={() => remove(r.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={16} /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {openId != null && (
        <VirementCreditsModal id={openId} direction={direction} onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </div>
  );
};

export default VirementCreditsHistory;
