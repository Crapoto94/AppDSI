import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';

interface Contact {
  id: number;
  nom: string;
  prenom: string;
  role: string; // fonction
  telephone: string;
  email: string;
  is_order_recipient: boolean | number;
}

const EMPTY = { nom: '', prenom: '', role: '', telephone: '', email: '', is_order_recipient: false };

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  box: { background: '#fff', borderRadius: 12, padding: '1.25rem', width: 'min(900px, 94vw)', maxHeight: '88vh', overflow: 'auto' },
  input: { width: '100%', padding: '0.45rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.88rem', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 3 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.4rem 0.8rem', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem' },
  th: { textAlign: 'left', padding: '0.5rem', fontSize: '0.72rem', color: '#64748b', borderBottom: '1px solid #e2e8f0' },
  td: { padding: '0.5rem', fontSize: '0.85rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' },
};

interface Props { tierCode: string; tierName: string; onClose: () => void; }

const TiersContactsModal: React.FC<Props> = ({ tierCode, tierName, onClose }) => {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await axios.get<Contact[]>(`/api/tiers/${encodeURIComponent(tierCode)}/contacts`, { headers });
      setContacts(r.data);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur de chargement des contacts');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierCode, token]);

  useEffect(() => { load(); }, [load]);

  const startNew = () => { setEditingId(null); setForm(EMPTY); setShowForm(true); setError(''); };
  const startEdit = (c: Contact) => {
    setEditingId(c.id);
    setForm({ nom: c.nom || '', prenom: c.prenom || '', role: c.role || '', telephone: c.telephone || '', email: c.email || '', is_order_recipient: !!c.is_order_recipient });
    setShowForm(true);
    setError('');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.nom.trim()) { setError('Le nom est obligatoire.'); return; }
    try {
      if (editingId) await axios.put(`/api/contacts/${editingId}`, form, { headers });
      else await axios.post(`/api/tiers/${encodeURIComponent(tierCode)}/contacts`, form, { headers });
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de l’enregistrement');
    }
  };

  const remove = async (c: Contact) => {
    if (!window.confirm(`Supprimer le contact ${c.prenom || ''} ${c.nom || ''} ?`)) return;
    try {
      await axios.delete(`/api/contacts/${c.id}`, { headers });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la suppression');
    }
  };

  // Bascule directe du « destinataire commande » depuis la liste.
  const toggleRecipient = async (c: Contact) => {
    try {
      await axios.put(`/api/contacts/${c.id}`, { ...c, is_order_recipient: !c.is_order_recipient }, { headers });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour');
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.box} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Contacts — {tierName} <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.85rem' }}>({tierCode})</span></h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }} title="Fermer"><X size={18} /></button>
        </div>

        {error && <div style={{ color: '#dc2626', margin: '0.5rem 0' }}>{error}</div>}

        <div style={{ margin: '0.75rem 0' }}>
          {!showForm && <button style={s.btn} onClick={startNew}><Plus size={14} /> Nouveau contact</button>}
        </div>

        {showForm && (
          <form onSubmit={save} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.9rem', marginBottom: '1rem', background: '#f8fafc' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              <div><label style={s.label}>Nom *</label><input style={s.input} value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} autoFocus /></div>
              <div><label style={s.label}>Prénom</label><input style={s.input} value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} /></div>
              <div><label style={s.label}>Fonction</label><input style={s.input} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} /></div>
              <div><label style={s.label}>Téléphone</label><input style={s.input} value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={s.label}>Email</label><input style={s.input} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: '0.75rem', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_order_recipient} onChange={e => setForm({ ...form, is_order_recipient: e.target.checked })} />
              Destinataire commande
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: '0.9rem' }}>
              <button type="submit" style={s.btn}><Save size={14} /> {editingId ? 'Enregistrer' : 'Ajouter'}</button>
              <button type="button" style={{ ...s.btn, background: '#64748b' }} onClick={() => setShowForm(false)}>Annuler</button>
            </div>
          </form>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={s.th}>Nom</th><th style={s.th}>Prénom</th><th style={s.th}>Fonction</th>
              <th style={s.th}>Tél</th><th style={s.th}>Mail</th><th style={s.th}>Destinataire commande</th><th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && <tr><td style={{ ...s.td, color: '#94a3b8' }} colSpan={7}>Aucun contact pour ce tiers.</td></tr>}
            {contacts.map(c => (
              <tr key={c.id}>
                <td style={{ ...s.td, fontWeight: 600 }}>{c.nom}</td>
                <td style={s.td}>{c.prenom}</td>
                <td style={s.td}>{c.role}</td>
                <td style={s.td}>{c.telephone}</td>
                <td style={s.td}>{c.email}</td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  <input type="checkbox" checked={!!c.is_order_recipient} onChange={() => toggleRecipient(c)} title="Destinataire des commandes" style={{ cursor: 'pointer', width: 16, height: 16 }} />
                </td>
                <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                  <button onClick={() => startEdit(c)} title="Modifier" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#2563eb' }}><Pencil size={15} /></button>
                  <button onClick={() => remove(c)} title="Supprimer" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TiersContactsModal;
