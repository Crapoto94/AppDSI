import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Header from '../../components/Header';
import { Network, Map as MapIcon, Share2, Plus, Trash2 } from 'lucide-react';
import NetworkMap from './NetworkMap';
import NetworkTopology from './NetworkTopology';
import { linkStyle } from './utils';
import type { NetworkLink, NetworkAccess, Duct, SiteRef, LinkType, Operator } from './types';

const LINK_TYPES: LinkType[] = ['FIBRE', 'WAN', 'OPERATEUR'];
const OPERATORS: Operator[] = ['LINKT', 'MOJI', 'RED', 'OTHER'];

const emptyForm = {
  site_a: '', site_b: '', type: 'FIBRE' as LinkType, operator: '' as '' | Operator,
  capacity: '', carries_data: true, carries_voice: false, is_loop: false, is_redundant: false,
};

export default function ReseauDashboard() {
  const token = localStorage.getItem('token');
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [sitesArr, setSitesArr] = useState<SiteRef[]>([]);
  const [links, setLinks] = useState<NetworkLink[]>([]);
  const [access, setAccess] = useState<NetworkAccess[]>([]);
  const [ducts, setDucts] = useState<Duct[]>([]);
  const [view, setView] = useState<'map' | 'topology'>('map');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtres
  const [fType, setFType] = useState<'' | LinkType>('');
  const [fOperator, setFOperator] = useState<'' | Operator>('');
  const [fLoop, setFLoop] = useState(false);
  const [fRedundant, setFRedundant] = useState(false);

  // Couches carte
  const [layers, setLayers] = useState({ fibre: true, wan: true, operator: true, ducts: true, sites: true });

  // Création
  const [form, setForm] = useState({ ...emptyForm });
  const [drawMode, setDrawMode] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState<[number, number][]>([]);
  const [saving, setSaving] = useState(false);

  const sites = useMemo(() => {
    const m = new Map<string, SiteRef>();
    sitesArr.forEach(s => m.set(s.site_code, s));
    return m;
  }, [sitesArr]);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, l, a, d] = await Promise.all([
        axios.get('/api/network/sites', { headers }),
        axios.get('/api/network/links', { headers }),
        axios.get('/api/network/access', { headers }),
        axios.get('/api/network/ducts', { headers }),
      ]);
      setSitesArr(s.data || []);
      setLinks(l.data || []);
      setAccess(a.data || []);
      setDucts(d.data || []);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll(); }, []);

  // En mode tracé manuel, le 1er point est ancré sur le site A (réamorce si A change).
  useEffect(() => {
    if (!drawMode) return;
    const a = sites.get(form.site_a);
    setDrawnPoints(a && a.lat != null && a.lng != null ? [[a.lat, a.lng]] : []);
  }, [form.site_a, drawMode, sites]);

  const filteredLinks = useMemo(() => links.filter(l =>
    (!fType || l.type === fType) &&
    (!fOperator || l.operator === fOperator) &&
    (!fLoop || l.is_loop) &&
    (!fRedundant || l.is_redundant)
  ), [links, fType, fOperator, fLoop, fRedundant]);

  function onMapClick(lat: number, lng: number) {
    if (drawMode) setDrawnPoints(prev => [...prev, [lat, lng]]);
  }

  async function createLink(e: React.FormEvent) {
    e.preventDefault();
    if (!form.site_a || !form.site_b) { alert('Sélectionnez les deux sites.'); return; }
    if (form.site_a === form.site_b) { alert('Les deux sites doivent être différents.'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        site_a: form.site_a, site_b: form.site_b, type: form.type,
        operator: form.operator || null, capacity: form.capacity || null,
        carries_data: form.carries_data, carries_voice: form.carries_voice,
        is_loop: form.is_loop, is_redundant: form.is_redundant,
      };
      if (drawMode && drawnPoints.length >= 2) {
        payload.geometry = { type: 'LineString', coordinates: drawnPoints.map(([la, ln]) => [ln, la]) };
      }
      const res = await axios.post('/api/network/links', payload, { headers });
      setLinks(prev => [...prev, res.data]);
      setForm({ ...emptyForm });
      setDrawMode(false);
      setDrawnPoints([]);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      alert(msg || 'Erreur lors de la création du lien');
    } finally {
      setSaving(false);
    }
  }

  async function deleteLink(id: string) {
    if (!confirm('Supprimer ce lien ?')) return;
    try {
      await axios.delete(`/api/network/links/${id}`, { headers });
      setLinks(prev => prev.filter(l => l.id !== id));
    } catch {
      alert('Erreur lors de la suppression');
    }
  }

  return (
    <>
      <Header />
      <div style={{ padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Network size={26} color="#2563eb" />
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Réseau Ville</h1>
            <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Cartographie du réseau inter-sites — fibre, WAN, opérateurs, fourreaux</p>
          </div>
        </div>

        {error && <div style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16, height: 'calc(100vh - 170px)' }}>
          {/* ─── Panneau gauche ─── */}
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Création de lien */}
            <form onSubmit={createLink} style={card}>
              <h3 style={cardTitle}><Plus size={16} /> Créer un lien</h3>
              <label style={lbl}>Site A</label>
              <input list="sites-dl" style={inp} value={form.site_a} onChange={e => setForm({ ...form, site_a: e.target.value.trim().toUpperCase() })} placeholder="ex: S001" />
              <label style={lbl}>Site B</label>
              <input list="sites-dl" style={inp} value={form.site_b} onChange={e => setForm({ ...form, site_b: e.target.value.trim().toUpperCase() })} placeholder="ex: S007" />
              <datalist id="sites-dl">
                {sitesArr.map(s => <option key={s.site_code} value={s.site_code}>{s.nom}</option>)}
              </datalist>

              <label style={lbl}>Type</label>
              <select style={inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as LinkType })}>
                {LINK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              {form.type === 'OPERATEUR' && (
                <>
                  <label style={lbl}>Opérateur</label>
                  <select style={inp} value={form.operator} onChange={e => setForm({ ...form, operator: e.target.value as Operator })}>
                    <option value="">—</option>
                    {OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </>
              )}

              <label style={lbl}>Capacité / Débit</label>
              <input style={inp} value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} placeholder="ex: 10G, 30M" />

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '8px 0' }}>
                <label style={chk}><input type="checkbox" checked={form.carries_data} onChange={e => setForm({ ...form, carries_data: e.target.checked })} /> Data</label>
                <label style={chk}><input type="checkbox" checked={form.carries_voice} onChange={e => setForm({ ...form, carries_voice: e.target.checked })} /> Voix</label>
                <label style={chk}><input type="checkbox" checked={form.is_loop} onChange={e => setForm({ ...form, is_loop: e.target.checked })} /> Boucle</label>
                <label style={chk}><input type="checkbox" checked={form.is_redundant} onChange={e => setForm({ ...form, is_redundant: e.target.checked })} /> Redondant</label>
              </div>

              <label style={{ ...chk, marginBottom: 8 }}>
                <input type="checkbox" checked={drawMode} onChange={e => { setDrawMode(e.target.checked); if (e.target.checked) setView('map'); else setDrawnPoints([]); }} />
                Tracé manuel sur la carte {drawMode && <span style={{ color: '#0ea5e9', fontWeight: 700 }}>({drawnPoints.length} pt)</span>}
              </label>
              {drawMode && (
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px' }}>
                  {form.site_a
                    ? <>Le tracé démarre au site <strong>{form.site_a}</strong> (élastique vers la souris). Cliquez pour ajouter des points jusqu'au site B.</>
                    : <>Sélectionnez d'abord le site A. Le tracé démarrera à sa position.</>}
                  {' '}Sinon, le tracé est automatique (droite A→B).
                </p>
              )}

              <button type="submit" disabled={saving} style={btnPrimary}>{saving ? '…' : 'Créer le lien'}</button>
            </form>

            {/* Filtres */}
            <div style={card}>
              <h3 style={cardTitle}>Filtres</h3>
              <label style={lbl}>Type</label>
              <select style={inp} value={fType} onChange={e => setFType(e.target.value as LinkType | '')}>
                <option value="">Tous</option>
                {LINK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <label style={lbl}>Opérateur</label>
              <select style={inp} value={fOperator} onChange={e => setFOperator(e.target.value as Operator | '')}>
                <option value="">Tous</option>
                {OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
                <label style={chk}><input type="checkbox" checked={fLoop} onChange={e => setFLoop(e.target.checked)} /> Boucle</label>
                <label style={chk}><input type="checkbox" checked={fRedundant} onChange={e => setFRedundant(e.target.checked)} /> Redondant</label>
              </div>
            </div>

            {/* Liste des liens */}
            <div style={card}>
              <h3 style={cardTitle}>Liens ({filteredLinks.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredLinks.map(l => {
                  const st = linkStyle(l);
                  return (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #eef2f7' }}>
                      <span style={{ width: 14, height: 4, borderRadius: 2, background: st.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{l.site_a} → {l.site_b}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          {l.type}{l.operator ? ` · ${l.operator}` : ''}{l.capacity ? ` · ${l.capacity}` : ''}
                          {l.carries_voice ? ' · voix' : ''}{l.is_loop ? ' · boucle' : ''}{l.is_redundant ? ' · redondant' : ''}
                        </div>
                      </div>
                      <button onClick={() => deleteLink(l.id)} title="Supprimer" style={iconBtn}><Trash2 size={15} /></button>
                    </div>
                  );
                })}
                {filteredLinks.length === 0 && <p style={{ fontSize: 13, color: '#cbd5e1', fontStyle: 'italic' }}>Aucun lien.</p>}
              </div>
            </div>
          </div>

          {/* ─── Panneau droit (carte / topologie) ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f1f5f9', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setView('map')} style={view === 'map' ? tabActive : tab}><MapIcon size={15} /> Carte</button>
                <button onClick={() => setView('topology')} style={view === 'topology' ? tabActive : tab}><Share2 size={15} /> Topologie</button>
              </div>
              {view === 'map' && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
                  {([['fibre', 'Fibre', '#16a34a'], ['wan', 'WAN', '#3b82f6'], ['operator', 'Opérateurs', '#f97316'], ['ducts', 'Fourreaux', '#92400e'], ['sites', 'Sites', '#2563eb']] as const).map(([k, label, c]) => (
                    <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: '#475569', fontWeight: 600 }}>
                      <input type="checkbox" checked={layers[k]} onChange={e => setLayers({ ...layers, [k]: e.target.checked })} />
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: 'inline-block' }} /> {label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {loading ? (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Chargement…</div>
              ) : view === 'map' ? (
                <NetworkMap
                  sites={sites} links={links} ducts={ducts} layers={layers}
                  drawMode={drawMode} drawnPoints={drawnPoints} onMapClick={onMapClick}
                  highlightSites={[form.site_a, form.site_b].filter(Boolean)}
                />
              ) : (
                <NetworkTopology sites={sites} links={links} />
              )}
            </div>
          </div>
        </div>

        {/* Accès & fourreaux (sous le split, infos complémentaires) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <div style={card}>
            <h3 style={cardTitle}>Accès réseau ({access.length})</h3>
            {access.map(a => (
              <div key={a.id} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f8fafc' }}>
                <strong>{a.site_code}</strong> · {a.type}{a.operator ? ` · ${a.operator}` : ''}{a.bandwidth ? ` · ${a.bandwidth}` : ''}{a.carries_voice ? ' · voix' : ''}
              </div>
            ))}
            {access.length === 0 && <p style={{ fontSize: 13, color: '#cbd5e1' }}>Aucun accès.</p>}
          </div>
          <div style={card}>
            <h3 style={cardTitle}>Fourreaux ({ducts.length})</h3>
            {ducts.map(d => (
              <div key={d.id} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f8fafc' }}>
                <strong>{d.name}</strong> · {d.status} · {d.used_capacity}/{d.capacity}
              </div>
            ))}
            {ducts.length === 0 && <p style={{ fontSize: 13, color: '#cbd5e1' }}>Aucun fourreau.</p>}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Styles inline ─────────────────────────────────────────────────
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e9eef5', borderRadius: 14, padding: 16, boxShadow: '0 1px 3px rgba(15,23,42,0.04)' };
const cardTitle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '0 0 12px' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '8px 0 4px' };
const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', outline: 'none', background: '#f8fafc' };
const chk: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { width: '100%', marginTop: 10, padding: '11px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg, #2563eb, #4f46e5)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: 4, borderRadius: 6 };
const tab: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const tabActive: React.CSSProperties = { ...tab, background: 'linear-gradient(135deg, #2563eb, #4f46e5)', color: '#fff', border: 'none' };
