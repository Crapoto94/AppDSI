import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { AlertTriangle, CheckCircle, Send, Settings, X } from 'lucide-react';

interface Contact {
  id: number; nom: string; prenom: string; role: string; telephone: string; email: string;
  is_order_recipient: boolean; default_selected: boolean;
}
interface Prepare {
  commande: { roo: string; numero: string; date: string; libelle: string; montant_ttc: number | null; tiers_code: string; tiers_nom: string; service: string };
  emetteur: { name: string; email: string; poste?: string };
  already_sent: { count: number; last_at: string; last_by: string; to: string } | null;
  cc: { role: string; name: string; email: string }[];
  signed: boolean;
  bon_commande: string | null;
  devis: string[];
  contacts: Contact[];
  subject: string;
}
interface Settings { subject_template: string; body_template: string; closing_template: string; signature_template: string; variables: { name: string; label: string }[]; can_edit: boolean; }

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  box: { background: '#fff', borderRadius: 12, padding: '1.25rem', width: 'min(760px, 94vw)', maxHeight: '90vh', overflow: 'auto' },
  input: { width: '100%', padding: '0.5rem 0.7rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.88rem', boxSizing: 'border-box', fontFamily: 'inherit' },
  label: { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' },
  section: { marginTop: '1rem' },
};

const fmt = (n: number | null) => (n == null ? '' : n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }));

interface Props { roo: string; onClose: () => void; onSent?: () => void; }

const CommandeEnvoiModal: React.FC<Props> = ({ roo, onClose, onSent }) => {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const [data, setData] = useState<Prepare | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ message: string; to: string[]; cc: string[]; warnings: string[] } | null>(null);
  const [copyMe, setCopyMe] = useState(false);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [p, st] = await Promise.all([
          axios.get<Prepare>(`/api/commande-envoi/${encodeURIComponent(roo)}/prepare`, { headers }),
          axios.get<Settings>('/api/commande-envoi/settings', { headers }),
        ]);
        setData(p.data);
        setSelected(new Set(p.data.contacts.filter(c => c.default_selected).map(c => c.id)));
        setSettings(st.data);
      } catch (e: any) {
        setError(e.response?.data?.message || 'Erreur de chargement');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roo]);

  const toggle = (id: number) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  };

  const send = async () => {
    if (!data) return;
    setSending(true);
    setError('');
    try {
      const r = await axios.post(`/api/commande-envoi/${encodeURIComponent(roo)}/send`, { contact_ids: Array.from(selected), message, copy_me: copyMe }, { headers });
      setDone({ message: r.data.message, to: r.data.to || [], cc: r.data.cc || [], warnings: r.data.warnings || [] });
      if (onSent) onSent();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur lors de l’envoi');
    } finally {
      setSending(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    try {
      await axios.put('/api/commande-envoi/settings', {
        subject_template: settings.subject_template, body_template: settings.body_template,
        closing_template: settings.closing_template, signature_template: settings.signature_template,
      }, { headers });
      setSettingsMsg('Modèle enregistré.');
      const p = await axios.get<Prepare>(`/api/commande-envoi/${encodeURIComponent(roo)}/prepare`, { headers });
      setData(prev => (prev ? { ...prev, subject: p.data.subject } : prev));
    } catch (e: any) {
      setSettingsMsg(e.response?.data?.message || 'Erreur d’enregistrement');
    }
  };

  const validContacts = data?.contacts.filter(c => c.email && c.email.includes('@')) || [];
  const canSend = !!data && data.signed && selected.size > 0 && !sending;

  // Après l'envoi : uniquement une modale de confirmation (le formulaire disparaît).
  if (done) {
    return (
      <div style={s.overlay} onClick={onClose}>
        <div style={{ ...s.box, width: 'min(460px, 94vw)', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <CheckCircle size={40} color="#16a34a" />
          <h3 style={{ margin: '0.5rem 0' }}>Commande envoyée</h3>
          <div style={{ color: '#475569', fontSize: '0.9rem' }}>{done.message}</div>
          <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: 8, textAlign: 'left' }}>
            <div><b>À :</b> {done.to.join(', ')}</div>
            {done.cc.length > 0 && <div><b>Cc :</b> {done.cc.join(', ')}</div>}
          </div>
          {done.warnings.length > 0 && (
            <div style={{ color: '#b45309', background: '#fef3c7', borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.8rem', marginTop: 10, textAlign: 'left' }}>
              {done.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}
          <div style={{ marginTop: '1rem' }}>
            <button style={s.btn} onClick={onClose} autoFocus>OK</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.box} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Envoyer la commande {data?.commande.numero}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }} title="Fermer"><X size={18} /></button>
        </div>

        {error && <div style={{ color: '#dc2626', margin: '0.6rem 0' }}>{error}</div>}
        {!data && !error && <div style={{ color: '#64748b', marginTop: '1rem' }}>Chargement…</div>}

        {data && (
          <>
            <div style={{ color: '#475569', fontSize: '0.85rem', marginTop: 6 }}>
              {data.commande.libelle} — <b>{data.commande.tiers_nom}</b> — {fmt(data.commande.montant_ttc)} TTC
            </div>

            {data.already_sent && (
              <div style={{ ...s.section, color: '#166534', background: '#dcfce7', padding: '0.6rem 0.8rem', borderRadius: 8, fontSize: '0.85rem' }}>
                <CheckCircle size={14} style={{ verticalAlign: 'text-bottom' }} /> Commande déjà envoyée {data.already_sent.count > 1 ? `${data.already_sent.count} fois` : 'une fois'} —
                dernier envoi le {new Date(data.already_sent.last_at).toLocaleString('fr-FR')} par {data.already_sent.last_by} à {data.already_sent.to}.
                Vous pouvez la renvoyer.
              </div>
            )}

            {data.signed ? (
              <div style={{ ...s.section, color: '#16a34a', fontSize: '0.85rem', display: 'flex', gap: 6, alignItems: 'center' }}>
                <CheckCircle size={15} /> Bon de commande signé joint : {data.bon_commande}
              </div>
            ) : (
              <div style={{ ...s.section, color: '#b45309', background: '#fef3c7', padding: '0.6rem 0.8rem', borderRadius: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
                <AlertTriangle size={16} /> Le bon de commande n’est pas signé dans Sedit : cette commande ne peut pas être envoyée.
              </div>
            )}

            {data.signed && (
              <div style={{ marginTop: 4, fontSize: '0.85rem', color: data.devis.length ? '#475569' : '#b45309' }}>
                {data.devis.length ? `Devis joint(s) : ${data.devis.join(', ')}` : 'Aucun devis rattaché à la commande dans Sedit.'}
              </div>
            )}

            <div style={s.section}>
              <label style={s.label}>Destinataires (contacts « destinataire commande » du tiers, cochés par défaut)</label>
              {data.contacts.length === 0 && <div style={{ color: '#94a3b8' }}>Aucun contact pour ce tiers — à créer depuis l’onglet Tiers (bouton Contacts).</div>}
              {data.contacts.map(c => {
                const ok = !!(c.email && c.email.includes('@'));
                return (
                  <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0.25rem 0', opacity: ok ? 1 : 0.5, cursor: ok ? 'pointer' : 'not-allowed' }}>
                    <input type="checkbox" disabled={!ok} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    <span style={{ fontWeight: 600 }}>{[c.prenom, c.nom].filter(Boolean).join(' ')}</span>
                    {c.role && <span style={{ color: '#64748b' }}>({c.role})</span>}
                    <span style={{ color: '#475569' }}>{ok ? c.email : 'pas d’adresse e-mail'}</span>
                    {c.is_order_recipient && <span style={{ fontSize: '0.7rem', background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: 6 }}>destinataire commande</span>}
                  </label>
                );
              })}
              {data.contacts.length > 0 && validContacts.length === 0 && <div style={{ color: '#dc2626' }}>Aucun contact n’a d’adresse e-mail valide.</div>}
            </div>

            <div style={{ ...s.section, fontSize: '0.85rem', color: '#475569' }}>
              <div><b>De :</b> {data.emetteur.name || '—'} {data.emetteur.email && `<${data.emetteur.email}>`} <span style={{ color: '#94a3b8' }}>(vous)</span></div>
              <div><b>Cc :</b> {[...data.cc.map(c => `${c.name} (${c.role})`), ...(copyMe ? ['vous'] : [])].join(', ') || 'aucun (directeur / responsable de service introuvables)'}</div>
              <div><b>Objet :</b> {data.subject}</div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
              <span
                role="switch" aria-checked={copyMe} tabIndex={0}
                onClick={() => setCopyMe(v => !v)}
                onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setCopyMe(v => !v); } }}
                style={{ width: 36, height: 20, borderRadius: 10, background: copyMe ? '#2563eb' : '#cbd5e1', position: 'relative', transition: 'background .15s', flex: '0 0 auto' }}>
                <span style={{ position: 'absolute', top: 2, left: copyMe ? 18 : 2, width: 16, height: 16, borderRadius: 8, background: '#fff', transition: 'left .15s' }} />
              </span>
              Me mettre en copie du mail{data.emetteur.email ? <span style={{ fontWeight: 400, color: '#94a3b8' }}>({data.emetteur.email})</span> : null}
            </label>

            <div style={s.section}>
              <label style={s.label}>Message libre (inséré après le corps du mail, juste avant la formule de politesse)</label>
              <textarea style={{ ...s.input, minHeight: 90 }} value={message} onChange={e => setMessage(e.target.value)} />
            </div>

            {(
              <div style={{ ...s.section, display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  {settings?.can_edit && (
                    <button style={{ ...s.btn, background: '#64748b' }} onClick={() => setShowSettings(v => !v)}>
                      <Settings size={14} /> Modèle du mail
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ ...s.btn, background: '#64748b' }} onClick={onClose}>Fermer</button>
                  <button style={{ ...s.btn, opacity: canSend ? 1 : 0.5 }} disabled={!canSend} onClick={send}>
                    <Send size={14} /> {sending ? 'Envoi…' : `${data.already_sent ? 'Renvoyer' : 'Envoyer'} (${selected.size})`}
                  </button>
                </div>
              </div>
            )}

            {showSettings && settings && (
              <div style={{ ...s.section, border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.9rem', background: '#f8fafc' }}>
                <h4 style={{ marginTop: 0 }}>Modèle du mail (valable pour tous les envois)</h4>
                <label style={s.label}>Titre</label>
                <input style={s.input} value={settings.subject_template} onChange={e => setSettings({ ...settings, subject_template: e.target.value })} />
                <label style={{ ...s.label, marginTop: 10 }}>Corps (le message libre est ajouté juste après)</label>
                <textarea style={{ ...s.input, minHeight: 110 }} value={settings.body_template} onChange={e => setSettings({ ...settings, body_template: e.target.value })} />
                <label style={{ ...s.label, marginTop: 10 }}>Formule de politesse</label>
                <input style={s.input} value={settings.closing_template} onChange={e => setSettings({ ...settings, closing_template: e.target.value })} />
                <label style={{ ...s.label, marginTop: 10 }}>Signature (logo Ivry ajouté à gauche)</label>
                <textarea style={{ ...s.input, minHeight: 130, fontFamily: 'monospace' }} value={settings.signature_template} onChange={e => setSettings({ ...settings, signature_template: e.target.value })} />
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
                  1re ligne = nom (rouge, gras) · <code>**</code> en début de ligne = bleu gras · <code>~</code> = petit · une ligne dont la variable est vide est omise.
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 6 }}>
                  Variables : {settings.variables.map(v => <code key={v.name} title={v.label} style={{ marginRight: 8 }}>{`{{${v.name}}}`}</code>)}
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button style={s.btn} onClick={saveSettings}>Enregistrer le modèle</button>
                  {settingsMsg && <span style={{ fontSize: '0.8rem', color: '#475569' }}>{settingsMsg}</span>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CommandeEnvoiModal;
