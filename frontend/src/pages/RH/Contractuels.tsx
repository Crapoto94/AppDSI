import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, CheckCircle, XCircle, Send, Upload, Edit2, Trash2, Users, UserCheck, Clock, Calendar, AlertOctagon, FileSpreadsheet } from 'lucide-react';

const API = '/api/admin/rh/contracts';
const token = () => localStorage.getItem('token');
const headers = () => ({ 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' });

interface Contract {
  id: number;
  direction: string;
  nom_prenom: string;
  date_arrivee: string | null;
  date_reconduction: string | null;
  est_cdi: boolean | number;
  date_relance: string | null;
  fait: boolean | number;
  statut: string;
  notes: string;
  alertes_envoyees: number;
  created_at: string;
  updated_at: string;
}

interface ContractStats {
  total: number;
  actifs: number;
  cdi: number;
  reconductionProche: number;
  relanceImminente: number;
  enRetard: number;
}

interface FormData {
  id?: number;
  direction: string;
  nom_prenom: string;
  date_arrivee: string;
  date_reconduction: string;
  est_cdi: boolean;
  date_relance: string;
  notes: string;
  fait: boolean;
}

const C = {
  indigo: '#4f46e5' as const, red: '#dc2626' as const, green: '#16a34a' as const, amber: '#d97706' as const,
  blue: '#2563eb' as const, slate: '#64748b' as const, gray: '#f8fafc' as const, border: '#e2e8f0' as const
};

function formatDate(d: string | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('fr-FR');
}

function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  const now = new Date();
  const target = new Date(d);
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function Contractuels() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [stats, setStats] = useState<ContractStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<FormData>({ direction: '', nom_prenom: '', date_arrivee: '', date_reconduction: '', est_cdi: false, date_relance: '', notes: '', fait: false });
  const [alertModal, setAlertModal] = useState<Contract | null>(null);
  const [alertEmails, setAlertEmails] = useState('');
  const [alertResult, setAlertResult] = useState<{ results: { email: string; status: string; error?: string }[] } | null>(null);
  const [importModal, setImportModal] = useState(false);
  const [importData, setImportData] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [cRes, sRes] = await Promise.all([
        fetch(API, { headers: headers() }),
        fetch(`${API}/stats`, { headers: headers() })
      ]);
      if (cRes.ok) setContracts(await cRes.json());
      if (sRes.ok) setStats(await sRes.json());
    } catch (e) {
      console.error('Erreur chargement', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setForm({ direction: '', nom_prenom: '', date_arrivee: '', date_reconduction: '', est_cdi: false, date_relance: '', notes: '', fait: false });
    setModal('create');
  };

  const openEdit = (c: Contract) => {
    setForm({
      id: c.id,
      direction: c.direction || '',
      nom_prenom: c.nom_prenom,
      date_arrivee: c.date_arrivee ? c.date_arrivee.substring(0, 10) : '',
      date_reconduction: c.date_reconduction ? c.date_reconduction.substring(0, 10) : '',
      est_cdi: Boolean(c.est_cdi),
      date_relance: c.date_relance ? c.date_relance.substring(0, 10) : '',
      notes: c.notes || '',
      fait: Boolean(c.fait),
    });
    setModal('edit');
  };

  const save = async () => {
    const body = { ...form };
    const url = modal === 'create' ? API : `${API}/${form.id}`;
    const method = modal === 'create' ? 'POST' : 'PUT';
    try {
      const res = await fetch(url, { method, headers: headers(), body: JSON.stringify(body) });
      if (res.ok) {
        setModal(null);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.message);
      }
    } catch (e) {
      alert('Erreur: ' + (e as Error).message);
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Supprimer ce contractuel ?')) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE', headers: headers() });
      if (res.ok) fetchData();
    } catch (e) {
      alert('Erreur: ' + (e as Error).message);
    }
  };

  const toggleFait = async (id: number) => {
    try {
      await fetch(`${API}/${id}/toggle-fait`, { method: 'PATCH', headers: headers() });
      fetchData();
    } catch (e) {
      alert('Erreur: ' + (e as Error).message);
    }
  };

  const sendAlert = async () => {
    if (!alertModal) return;
    const emails = alertEmails.split('\n').map(e => e.trim()).filter(Boolean);
    try {
      const res = await fetch(`${API}/${alertModal.id}/send-alert`, { method: 'POST', headers: headers(), body: JSON.stringify({ emails }) });
      const data = await res.json();
      setAlertResult(data);
      if (res.ok) fetchData();
    } catch (e) {
      alert('Erreur: ' + (e as Error).message);
    }
  };

  const handleImport = async () => {
    try {
      const lines = importData.trim().split('\n');
      const rows = lines.map(line => {
        const cols = line.split('\t');
        if (cols.length < 2) return null;
        return {
          direction: cols[0]?.trim() || '',
          nom_prenom: cols[1]?.trim() || '',
          date_arrivee: cols[2]?.trim() || null,
          date_reconduction: cols[3]?.trim() || null,
          date_relance: cols[4]?.trim() || null,
          fait: cols[5]?.trim() === 'OUI',
        };
      }).filter(Boolean);

      if (!rows.length) return alert('Aucune ligne valide');
      const res = await fetch(`${API}/import`, { method: 'POST', headers: headers(), body: JSON.stringify({ rows }) });
      const data = await res.json();
      if (res.ok) {
        setImportModal(false);
        setImportData('');
        fetchData();
        alert(data.message);
      } else {
        alert(data.message);
      }
    } catch (e) {
      alert('Erreur import: ' + (e as Error).message);
    }
  };

  const filtered = contracts.filter(c => {
    if (filter === 'actif' && c.statut !== 'actif') return false;
    if (filter === 'cdi' && !c.est_cdi) return false;
    if (filter === 'non_cdi' && c.est_cdi) return false;
    if (filter === 'fait' && !c.fait) return false;
    if (filter === 'en_retard' && !(c.statut === 'actif' && !c.est_cdi && c.date_reconduction && new Date(c.date_reconduction) < new Date() && !c.fait)) return false;
    if (filter === 'a_venir' && !(c.statut === 'actif' && !c.est_cdi && c.date_reconduction && daysUntil(c.date_reconduction) !== null && daysUntil(c.date_reconduction)! <= 90 && daysUntil(c.date_reconduction)! >= 0)) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!c.nom_prenom.toLowerCase().includes(s) && !(c.direction || '').toLowerCase().includes(s)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (a.est_cdi && !b.est_cdi) return 1;
    if (!a.est_cdi && b.est_cdi) return -1;
    if (a.date_reconduction && b.date_reconduction) return new Date(a.date_reconduction).getTime() - new Date(b.date_reconduction).getTime();
    return 0;
  });

  return (
    <div>
      <style>{`
        .rh-contracts { max-width: 1400px; margin: 0 auto; padding: 24px; font-family: 'Segoe UI', sans-serif; }
        .rh-title { font-size: 24px; font-weight: 700; color: #1e293b; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; }
        .rh-subtitle { color: #64748b; margin-bottom: 24px; }
        .stats-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
        .stat-card { background: white; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); display: flex; align-items: center; gap: 12px; }
        .stat-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .stat-value { font-size: 22px; font-weight: 700; color: #1e293b; }
        .stat-label { font-size: 12px; color: #64748b; }
        .toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
        .toolbar .search-input { flex: 1; min-width: 200px; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; }
        .toolbar .filter-select { padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; background: white; }
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; border: none; font-size: 14px; font-weight: 500; cursor: pointer; transition: .15s; white-space: nowrap; }
        .btn-primary { background: #4f46e5; color: white; }
        .btn-primary:hover { background: #4338ca; }
        .btn-success { background: #16a34a; color: white; }
        .btn-success:hover { background: #15803d; }
        .btn-outline { background: white; border: 1px solid #e2e8f0; color: #475569; }
        .btn-outline:hover { background: #f8fafc; }
        .btn-sm { padding: 4px 8px; font-size: 12px; }
        .btn-danger { background: #dc2626; color: white; }
        .btn-danger:hover { background: #b91c1c; }
        .table-wrap { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); overflow: auto; }
        table.rh-table { width: 100%; border-collapse: collapse; font-size: 14px; }
        table.rh-table th { background: #f8fafc; padding: 12px 16px; text-align: left; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; white-space: nowrap; cursor: pointer; }
        table.rh-table td { padding: 10px 16px; border-bottom: 1px solid #f1f5f9; }
        table.rh-table tr:hover td { background: #f8fafc; }
        .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 20px; font-size: 12px; font-weight: 500; }
        .badge-cdi { background: #dbeafe; color: #1d4ed8; }
        .badge-actif { background: #dcfce7; color: #15803d; }
        .badge-retard { background: #fef2f2; color: #b91c1c; }
        .badge-proche { background: #fef3c7; color: #b45309; }
        .badge-fait { background: #e0e7ff; color: #4338ca; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: white; border-radius: 12px; padding: 24px; max-width: 600px; width: 90%; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.15); }
        .modal-content h3 { font-size: 18px; margin-bottom: 16px; color: #1e293b; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .form-grid .full { grid-column: 1 / -1; }
        .form-grid label { font-size: 13px; font-weight: 500; color: #475569; display: block; margin-bottom: 4px; }
        .form-grid input, .form-grid select, .form-grid textarea { width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px; }
        .form-grid textarea { min-height: 60px; resize: vertical; }
        .form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
        .alert-result { margin-top: 12px; padding: 12px; border-radius: 8px; background: #f8fafc; font-size: 13px; }
        .alert-result .ok { color: #16a34a; }
        .alert-result .err { color: #dc2626; }
        .checkbox-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
        .checkbox-row input[type=checkbox] { width: auto; }
        .empty-state { text-align: center; padding: 48px; color: #94a3b8; }
        .empty-state svg { margin: 0 auto 12px; opacity: .4; }
        @media (max-width: 768px) {
          .stats-row { grid-template-columns: repeat(2, 1fr); }
          .form-grid { grid-template-columns: 1fr; }
          .toolbar { flex-direction: column; align-items: stretch; }
          .toolbar .search-input { min-width: auto; }
        }
      `}</style>

      <div className="rh-contracts">
        <div className="rh-title">
          <Users size={28} color={C.indigo} />
          Gestion des contractuels
        </div>
        <div className="rh-subtitle">
          Suivi des renouvellements de contrats des agents de la DSI
        </div>

        {stats && (
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-icon" style={{ background: '#ede9fe' }}><Users size={20} color={C.indigo} /></div>
              <div><div className="stat-value">{stats.total}</div><div className="stat-label">Total contractuels</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: '#dcfce7' }}><UserCheck size={20} color={C.green} /></div>
              <div><div className="stat-value">{stats.actifs}</div><div className="stat-label">Actifs</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: '#dbeafe' }}><FileSpreadsheet size={20} color={C.blue} /></div>
              <div><div className="stat-value">{stats.cdi}</div><div className="stat-label">CDI</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: '#fef3c7' }}><Calendar size={20} color={C.amber} /></div>
              <div><div className="stat-value">{stats.reconductionProche}</div><div className="stat-label">Reconduction ≤ 90j</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: '#fef3c7' }}><Clock size={20} color={C.amber} /></div>
              <div><div className="stat-value">{stats.relanceImminente}</div><div className="stat-label">Relance ≤ 30j</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: '#fef2f2' }}><AlertOctagon size={20} color={C.red} /></div>
              <div><div className="stat-value" style={{ color: stats.enRetard > 0 ? C.red : C.green }}>{stats.enRetard}</div><div className="stat-label">En retard</div></div>
            </div>
          </div>
        )}

        <div className="toolbar">
          <input className="search-input" type="text" placeholder="Rechercher par nom ou direction..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="filter-select" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">Tous</option>
            <option value="actif">Actifs</option>
            <option value="non_cdi">Non CDI</option>
            <option value="cdi">CDI</option>
            <option value="a_venir">Échéance ≤ 90j</option>
            <option value="en_retard">En retard</option>
            <option value="fait">Traités</option>
          </select>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Ajouter</button>
          <button className="btn btn-outline" onClick={() => setImportModal(true)}><Upload size={16} /> Importer</button>
        </div>

        <div className="table-wrap">
          {loading ? (
            <div className="empty-state">Chargement...</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <Search size={48} />
              <div>Aucun contractuel trouvé</div>
            </div>
          ) : (
            <table className="rh-table">
              <thead>
                <tr>
                  <th>Direction</th>
                  <th>Nom & Prénom</th>
                  <th>Arrivée</th>
                  <th>Reconduction</th>
                  <th>Relance</th>
                  <th>Statut</th>
                  <th>Fait</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const days = c.date_reconduction && !c.est_cdi ? daysUntil(c.date_reconduction) : null;
                  const isLate = days !== null && days < 0 && !c.fait;
                  const isSoon = days !== null && days >= 0 && days <= 90 && !c.fait;
                  const relanceDays = c.date_relance ? daysUntil(c.date_relance) : null;
                  const relanceSoon = relanceDays !== null && relanceDays <= 30 && relanceDays >= 0;
                  return (
                    <tr key={c.id}>
                      <td><strong>{c.direction || '-'}</strong></td>
                      <td>{c.nom_prenom}</td>
                      <td>{formatDate(c.date_arrivee)}</td>
                      <td>
                        {c.est_cdi ? (
                          <span className="badge badge-cdi">CDI</span>
                        ) : (
                          <span>
                            {formatDate(c.date_reconduction)}
                            {isLate && <span className="badge badge-retard" style={{ marginLeft: 6 }}>En retard</span>}
                            {isSoon && <span className="badge badge-proche" style={{ marginLeft: 6 }}>J-{days}</span>}
                          </span>
                        )}
                      </td>
                      <td>
                        {formatDate(c.date_relance)}
                        {relanceSoon && <span className="badge badge-proche" style={{ marginLeft: 6 }}>Relance J-{relanceDays}</span>}
                      </td>
                      <td>
                        {c.est_cdi ? <span className="badge badge-cdi">CDI</span> :
                          c.statut === 'actif' ? <span className="badge badge-actif">Actif</span> :
                          <span className="badge badge-retard">{c.statut}</span>}
                      </td>
                      <td>
                        <button className="btn btn-sm" onClick={() => toggleFait(c.id)} style={{ background: c.fait ? '#e0e7ff' : '#f1f5f9', color: c.fait ? C.indigo : '#94a3b8' }}>
                          {c.fait ? <CheckCircle size={16} /> : <XCircle size={16} />}
                        </button>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button className="btn btn-sm btn-outline" onClick={() => openEdit(c)} title="Modifier"><Edit2 size={14} /></button>
                          <button className="btn btn-sm btn-outline" onClick={() => { setAlertModal(c); setAlertEmails(''); setAlertResult(null); }} title="Envoyer alerte" style={{ color: C.amber }}><Send size={14} /></button>
                          <button className="btn btn-sm btn-outline" onClick={() => remove(c.id)} title="Supprimer" style={{ color: C.red }}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{modal === 'create' ? 'Nouveau contractuel' : 'Modifier le contractuel'}</h3>
            <div className="form-grid">
              <div>
                <label>Direction</label>
                <input value={form.direction} onChange={e => setForm({...form, direction: e.target.value})} placeholder="ex: DSI, SSD..." />
              </div>
              <div>
                <label>Nom & Prénom *</label>
                <input value={form.nom_prenom} onChange={e => setForm({...form, nom_prenom: e.target.value})} placeholder="NOM Prénom" />
              </div>
              <div>
                <label>Date d'arrivée</label>
                <input type="date" value={form.date_arrivee} onChange={e => setForm({...form, date_arrivee: e.target.value})} />
              </div>
              <div>
                <label>Prochaine reconduction</label>
                <input type="date" value={form.date_reconduction} onChange={e => setForm({...form, date_reconduction: e.target.value})} disabled={form.est_cdi} />
              </div>
              <div className="full checkbox-row">
                <input type="checkbox" id="est_cdi" checked={form.est_cdi} onChange={e => setForm({...form, est_cdi: e.target.checked, date_reconduction: ''})} />
                <label htmlFor="est_cdi" style={{ margin: 0 }}>CDI (pas de reconduction)</label>
              </div>
              <div>
                <label>Date de relance</label>
                <input type="date" value={form.date_relance} onChange={e => setForm({...form, date_relance: e.target.value})} />
              </div>
              <div className="checkbox-row">
                <input type="checkbox" id="fait" checked={form.fait} onChange={e => setForm({...form, fait: e.target.checked})} />
                <label htmlFor="fait" style={{ margin: 0 }}>Traitement effectué</label>
              </div>
              <div className="full">
                <label>Notes</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Informations complémentaires..." />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Annuler</button>
              <button className="btn btn-primary" onClick={save} disabled={!form.nom_prenom}>
                {modal === 'create' ? 'Ajouter' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {alertModal && (
        <div className="modal-overlay" onClick={() => setAlertModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Envoyer une alerte - {alertModal.nom_prenom}</h3>
            <div style={{ marginBottom: 12, padding: 12, background: '#fef3c7', borderRadius: 8, fontSize: 13 }}>
              <strong>Reconduction :</strong> {formatDate(alertModal.date_reconduction)}<br />
              <strong>Relance prévue :</strong> {formatDate(alertModal.date_relance)}<br />
              <strong>Direction :</strong> {alertModal.direction || 'Non renseignée'}
            </div>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>Destinataires (un email par ligne)</label>
            <textarea
              style={{ width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, minHeight: 80, resize: 'vertical' }}
              value={alertEmails}
              onChange={e => setAlertEmails(e.target.value)}
              placeholder="email1@example.com&#10;email2@example.com"
            />
            {alertResult && (
              <div className="alert-result">
                {alertResult.results?.map((r, i) => (
                  <div key={i} className={r.status === 'sent' ? 'ok' : 'err'}>
                    {r.status === 'sent' ? '✓' : '✗'} {r.email} {r.error ? `: ${r.error}` : '(envoyé)'}
                  </div>
                ))}
              </div>
            )}
            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => setAlertModal(null)}>Fermer</button>
              <button className="btn btn-success" onClick={sendAlert} disabled={!alertEmails.trim()}>
                <Send size={16} /> Envoyer l'alerte
              </button>
            </div>
          </div>
        </div>
      )}

      {importModal && (
        <div className="modal-overlay" onClick={() => setImportModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Importer depuis Excel</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              Collez les données copiées depuis Excel (séparation par tabulation).<br />
              Ordre des colonnes : Direction, Nom Prénom, Date arrivée, Date reconduction, Date relance, Fait (OUI/VIDE)
            </p>
            <textarea
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, minHeight: 200, resize: 'vertical', fontFamily: 'monospace' }}
              value={importData}
              onChange={e => setImportData(e.target.value)}
              placeholder="DSI&#9;NEMORIN Cyrille&#9;07/06/2022&#9;07/06/2026&#9;07/03/2026&#10;SSD&#9;PLICHARD Franck&#9;01/07/2022&#9;01/07/2026&#9;01/04/2026"
            />
            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => setImportModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleImport} disabled={!importData.trim()}>
                <Upload size={16} /> Importer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
