import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BarChart3, Plus, Trash2, RefreshCw, X, ArrowUp, ArrowDown, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export interface KpiFilterDef { key: string; label: string; source: string }

export interface KpiConfig {
  id: string;
  key: string;
  name: string;
  period: string | null;
  from?: string | null;
  to?: string | null;
  compare: string;
  display: string;
  filters?: Record<string, { value: string; label: string }>;
}

export interface KpiCatalogItem {
  key: string; label: string; module: string; unit: string;
  periodic: boolean; multi: boolean; kind?: 'value' | 'list' | 'chart'; chart?: string | null; description?: string;
  source?: string | null;
  filters?: KpiFilterDef[];
  defaultPeriod: string | null; defaultCompare: string; defaultDisplay: string;
  supportsCompare: boolean;
}

export interface KpiCatalog {
  periods: { key: string; label: string }[];
  comparisons: { key: string; label: string }[];
  displays: { key: string; label: string }[];
  modules: string[];
  kpis: KpiCatalogItem[];
  filterSources?: Record<string, { value: string; label: string }[]>;
}

interface SnapshotPreview {
  key: string; name: string; module: string; unit: string; display: string;
  kind?: string; chart?: string | null;
  period?: { from: string | null; to: string | null; label: string } | null;
  current?: {
    value?: number; text?: string | null; sub?: string;
    items?: { label: string; value?: number; text?: string; sub?: string }[];
    series?: any[]; seriesKeys?: { key: string; label: string }[];
  };
  previous?: { text?: string | null; value?: number } | null;
  delta_pct?: number | null;
  error?: string;
}

const fmt = (n: number | undefined | null, unit?: string) => {
  const v = Number(n ?? 0);
  if (unit === 'percent') return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
  if (unit === 'currency') return `${Math.round(v).toLocaleString('fr-FR')} €`;
  if (unit === 'days') return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`;
  if (unit === 'minutes') return `${Math.round(v)} min`;
  if (unit === 'years') return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ans`;
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
};

const newId = () => `kpi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '.45rem .55rem', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: '.82rem', background: '#fff', color: '#0f172a',
};
const label: React.CSSProperties = { display: 'block', fontSize: '.72rem', fontWeight: 700, color: '#64748b', margin: '0 0 4px' };
const btnGhost: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '.4rem .7rem', borderRadius: 8,
  border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: '.76rem', cursor: 'pointer',
};

/** Modale d'association de KPI à une rubrique de modèle de réunion. */
export default function KpiConfigurator({
  open, sectionTitle, kpis, catalog, templateId, meetingDate, onClose, onChange,
}: {
  open: boolean;
  sectionTitle: string;
  kpis: KpiConfig[];
  catalog: KpiCatalog | null;
  templateId?: number | null;
  meetingDate?: string | null;
  onClose: () => void;
  onChange: (next: KpiConfig[]) => void;
}) {
  const { token } = useAuth();
  const list = useMemo(() => catalog?.kpis || [], [catalog]);
  const modules = useMemo(() => catalog?.modules || [], [catalog]);

  const [moduleFilter, setModuleFilter] = useState('');
  const [pickKey, setPickKey] = useState('');
  const [name, setName] = useState('');
  const [period, setPeriod] = useState('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [compare, setCompare] = useState('previous');
  const [display, setDisplay] = useState('number');
  const [filterSel, setFilterSel] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<SnapshotPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewErr, setPreviewErr] = useState('');

  const visible = useMemo(
    () => list.filter(k => !moduleFilter || k.module === moduleFilter),
    [list, moduleFilter]
  );
  const selected = useMemo(() => list.find(k => k.key === pickKey) || null, [list, pickKey]);

  // Changer de KPI applique ses valeurs par défaut (période, comparaison, affichage).
  useEffect(() => {
    if (!selected) return;
    setName(selected.label);
    setPeriod(selected.defaultPeriod || '30d');
    setCompare(selected.defaultCompare || 'none');
    setDisplay(selected.defaultDisplay || 'number');
    setFilterSel({});
    setPreview(null); setPreviewErr('');
    setFrom(''); setTo('');
  }, [pickKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setPickKey(''); setModuleFilter(''); setName(''); setPreview(null); setPreviewErr('');
  }, [open]);

  if (!open) return null;

  const buildConfig = (): KpiConfig | null => {
    if (!selected) return null;
    const filters: Record<string, { value: string; label: string }> = {};
    for (const f of (selected.filters || [])) {
      const v = filterSel[f.key];
      if (!v) continue;
      const opt = (catalog?.filterSources?.[f.source] || []).find(o => o.value === v);
      filters[f.key] = { value: v, label: opt?.label || v };
    }
    return {
      id: newId(),
      key: selected.key,
      name: name.trim() || selected.label,
      period: selected.periodic ? period : null,
      from: selected.periodic && period === 'custom' ? (from || null) : null,
      to: selected.periodic && period === 'custom' ? (to || null) : null,
      compare: selected.periodic ? compare : 'none',
      display: selected.kind === 'chart' ? 'chart' : selected.multi ? 'list' : display,
      ...(Object.keys(filters).length ? { filters } : {}),
    };
  };

  const add = () => {
    const cfg = buildConfig();
    if (!cfg) return;
    onChange([...kpis, cfg]);
    setPickKey(''); setName(''); setPreview(null);
  };

  const remove = (id: string) => onChange(kpis.filter(k => k.id !== id));
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...kpis];
    const t = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]];
    onChange(next);
  };

  const runPreview = async () => {
    const cfg = buildConfig();
    if (!cfg) return;
    setPreviewing(true); setPreviewErr(''); setPreview(null);
    try {
      const r = await axios.post('/api/reunions-service/kpis/preview', {
        kpi: cfg, meeting_date: meetingDate || undefined, template_id: templateId || undefined,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setPreview(r.data?.snapshot || null);
    } catch (e: any) {
      setPreviewErr(e?.response?.data?.error || e.message || 'Aperçu impossible');
    } finally { setPreviewing(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(var(--header-height, 80px) + 20px) 16px 24px', overflowY: 'auto' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(980px, 96vw)', boxShadow: '0 25px 60px rgba(0,0,0,.35)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <BarChart3 size={18} color="#0078a4" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.95rem' }}>KPI de la rubrique — {sectionTitle || 'sans titre'}</div>
            <div style={{ fontSize: '.75rem', color: '#64748b' }}>
              Repris du tableau de bord. Calculés au lancement de la réunion, puis figés dans le compte rendu.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', gap: 18, padding: 18 }}>
          {/* Colonne gauche : liste des KPI associés */}
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '.85rem', marginBottom: 8 }}>
              KPI associés ({kpis.length})
            </div>
            {kpis.length === 0 ? (
              <div style={{ border: '1px dashed #cbd5e1', borderRadius: 10, padding: '18px 14px', color: '#94a3b8', fontSize: '.8rem', textAlign: 'center' }}>
                Aucun KPI pour cette rubrique. Ajoutez-en un à droite.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {kpis.map((k, idx) => {
                  const c = list.find(x => x.key === k.key);
                  const p = catalog?.periods.find(x => x.key === k.period)?.label;
                  const cmp = catalog?.comparisons.find(x => x.key === k.compare)?.label;
                  return (
                    <div key={k.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '.55rem .7rem', background: '#f8fafc' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k.name}>{k.name}</div>
                          <div style={{ fontSize: '.72rem', color: '#64748b' }}>
                            {c?.module || '—'}
                            {k.period ? ` · ${p || k.period}` : ' · à date'}
                            {k.compare && k.compare !== 'none' ? ` · ${cmp || k.compare}` : ''}
                          </div>
                          {k.filters && Object.keys(k.filters).length > 0 && (
                            <div style={{ fontSize: '.7rem', color: '#0369a1', marginTop: 1 }}>
                              {Object.values(k.filters).map(f => f.label).join(' · ')}
                            </div>
                          )}
                        </div>
                        <button style={btnGhost} onClick={() => move(idx, -1)} disabled={idx === 0} title="Monter"><ArrowUp size={12} /></button>
                        <button style={btnGhost} onClick={() => move(idx, 1)} disabled={idx === kpis.length - 1} title="Descendre"><ArrowDown size={12} /></button>
                        <button style={{ ...btnGhost, color: '#b91c1c' }} onClick={() => remove(k.id)} title="Retirer"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Colonne droite : ajout d'un KPI */}
          <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: 18 }}>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '.85rem', marginBottom: 8 }}>Ajouter un KPI</div>
            <div style={{ marginBottom: 8 }}>
              <label style={label}>Module</label>
              <select style={input} value={moduleFilter} onChange={e => { setModuleFilter(e.target.value); setPickKey(''); }}>
                <option value="">Tous les modules</option>
                {modules.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={label}>Indicateur</label>
              <select style={input} value={pickKey} onChange={e => setPickKey(e.target.value)}>
                <option value="">Choisir un KPI…</option>
                {visible.map(k => <option key={k.key} value={k.key}>{k.label} — {k.module}</option>)}
              </select>
            </div>
            {selected && (
              <>
                {selected.description && (
                  <div style={{ fontSize: '.73rem', color: '#64748b', margin: '0 0 8px' }}>{selected.description}</div>
                )}
                {selected.source && (
                  <div style={{ fontSize: '.71rem', color: '#94a3b8', margin: '0 0 8px' }}>
                    Source : <b style={{ color: '#475569' }}>{selected.source}</b>
                  </div>
                )}
                <div style={{ marginBottom: 8 }}>
                  <label style={label}>Nom affiché</label>
                  <input style={input} value={name} onChange={e => setName(e.target.value)} placeholder={selected.label} />
                </div>
                {(selected.filters || []).length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    {(selected.filters || []).map(f => (
                      <div key={f.key} style={(selected.filters || []).length % 2 === 1 && (selected.filters || []).slice(-1)[0].key === f.key ? { gridColumn: '1 / -1' } : undefined}>
                        <label style={label}>{f.label}</label>
                        <select style={input} value={filterSel[f.key] || ''} onChange={e => setFilterSel(prev => ({ ...prev, [f.key]: e.target.value }))}>
                          <option value="">Tous</option>
                          {(catalog?.filterSources?.[f.source] || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
                {selected.periodic ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                      <div>
                        <label style={label}>Période</label>
                        <select style={input} value={period} onChange={e => setPeriod(e.target.value)}>
                          {(catalog?.periods || []).map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={label}>Comparaison</label>
                        <select style={input} value={compare} onChange={e => setCompare(e.target.value)}>
                          {(catalog?.comparisons || []).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                      </div>
                    </div>
                    {period === 'custom' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <div><label style={label}>Du</label><input type="date" style={input} value={from} onChange={e => setFrom(e.target.value)} /></div>
                        <div><label style={label}>Au</label><input type="date" style={input} value={to} onChange={e => setTo(e.target.value)} /></div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: '.74rem', color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '.5rem .6rem', marginBottom: 8 }}>
                    Indicateur « à date » : sa valeur est photographiée au lancement de la réunion (pas de période ni de comparaison).
                  </div>
                )}
                {selected.kind === 'value' && (
                  <div style={{ marginBottom: 8 }}>
                    <label style={label}>Affichage</label>
                    <select style={input} value={display} onChange={e => setDisplay(e.target.value)}>
                      {(catalog?.displays || []).filter(d => d.key !== 'list' && d.key !== 'chart').map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                    </select>
                  </div>
                )}
                {selected.kind === 'chart' && (
                  <div style={{ fontSize: '.74rem', color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '.5rem .6rem', marginBottom: 8 }}>
                    Courbe affichée en pleine largeur au début de la rubrique (valeurs figées au lancement).
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                  <button style={btnGhost} onClick={runPreview} disabled={previewing}>
                    {previewing ? <RefreshCw size={12} className="spin" /> : <RefreshCw size={12} />} Aperçu
                  </button>
                  <button onClick={add} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '.45rem .8rem', borderRadius: 8, border: 'none', background: '#0078a4', color: '#fff', fontWeight: 800, fontSize: '.78rem', cursor: 'pointer' }}>
                    <Plus size={13} /> Associer
                  </button>
                </div>
                {previewErr && <div style={{ color: '#b91c1c', fontSize: '.76rem', marginTop: 8 }}>{previewErr}</div>}
                {preview && (
                  <div style={{ marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 10, padding: '.6rem .7rem', background: '#f0f9ff' }}>
                    <div style={{ fontSize: '.72rem', color: '#0369a1', fontWeight: 700 }}>
                      Aperçu · {preview.period?.label || 'à date'}
                    </div>
                    {preview.error ? (
                      <div style={{ color: '#b91c1c', fontSize: '.78rem', marginTop: 4 }}>{preview.error}</div>
                    ) : preview.current?.series ? (
                      <div style={{ fontSize: '.76rem', color: '#0369a1', marginTop: 4 }}>
                        Courbe : <b>{preview.current.series.length}</b> point{preview.current.series.length > 1 ? 's' : ''}
                        {' '}({preview.current.series.slice(0, 1).map(p => p.label).join('')} → {preview.current.series.slice(-1).map(p => p.label).join('')})
                      </div>
                    ) : preview.current?.items ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
                        {preview.current.items.slice(0, 10).map((it, i) => (
                          <div key={`${it.label}-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '.74rem' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</div>
                              {it.sub && <div style={{ color: '#94a3b8', fontSize: '.67rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sub}</div>}
                            </div>
                            <b style={{ color: '#0f172a', whiteSpace: 'nowrap' }}>{it.text || (it.value != null ? fmt(it.value) : '')}</b>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0369a1' }}>{preview.current?.text || fmt(preview.current?.value, preview.unit)}</div>
                        {preview.previous && (
                          <div style={{ fontSize: '.75rem', color: '#475569' }}>
                            {preview.previous.text}
                            {preview.delta_pct != null && (
                              <span style={{ marginLeft: 6, fontWeight: 800, color: preview.delta_pct > 0 ? '#b91c1c' : preview.delta_pct < 0 ? '#15803d' : '#64748b' }}>
                                {preview.delta_pct > 0 ? '▲ +' : preview.delta_pct < 0 ? '▼ ' : '='} {preview.delta_pct} %
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {!selected && (
              <div style={{ fontSize: '.76rem', color: '#94a3b8', marginTop: 10 }}>
                <Check size={13} style={{ verticalAlign: -2 }} /> Sélectionnez un indicateur pour le nommer, paramétrer sa période et sa comparaison.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
