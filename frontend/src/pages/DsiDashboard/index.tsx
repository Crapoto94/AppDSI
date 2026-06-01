import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import GridLayout from 'react-grid-layout';
import type { Layout, LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  Plus, Trash2, LayoutDashboard, Mail,
  MoreVertical, Star, Edit2, Check, X, Loader2,
} from 'lucide-react';
import WidgetCatalog from './WidgetCatalog';
import SubscriptionModal from './SubscriptionModal';
import { renderWidget } from './widgets/index';
import { WIDGET_REGISTRY } from './widgets/registry';
import type { WidgetDef } from './widgets/registry';

interface Dashboard { id: number; name: string; is_default: boolean; created_at: string; }
interface WidgetItem {
  id?: number;
  widget_key: string; pos_x: number; pos_y: number; width: number; height: number; config_json: any;
}

const COLS = 12;
const ROW_HEIGHT = 80;

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap',
    background: active ? 'white' : 'transparent',
    color: active ? '#1e293b' : 'rgba(255,255,255,.7)',
  };
}

function btnStyle(variant: 'primary' | 'ghost' | 'danger' = 'ghost'): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
    borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
    background: variant === 'primary' ? '#3b82f6' : variant === 'danger' ? '#ef4444' : 'rgba(255,255,255,.1)',
    color: 'white',
  };
}

export default function DsiDashboard() {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [activeDashId, setActiveDashId] = useState<number | null>(null);
  const [widgets, setWidgets] = useState<WidgetItem[]>([]);
  const [loadingDash, setLoadingDash] = useState(true);
  const [loadingWidgets, setLoadingWidgets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showDashMenu, setShowDashMenu] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [isDirty, setIsDirty] = useState(false);

  // ── Load dashboards ──────────────────────────────────────────────────────
  useEffect(() => {
    axios.get('/api/dsi-dashboard', { headers })
      .then(r => {
        setDashboards(r.data);
        const def = r.data.find((d: Dashboard) => d.is_default) || r.data[0];
        if (def) setActiveDashId(def.id);
      })
      .catch(console.error)
      .finally(() => setLoadingDash(false));
  }, [token]);

  // ── Load widgets for active dashboard ────────────────────────────────────
  useEffect(() => {
    if (!activeDashId) return;
    setLoadingWidgets(true);
    setIsDirty(false);
    axios.get(`/api/dsi-dashboard/${activeDashId}/widgets`, { headers })
      .then(r => setWidgets(r.data))
      .catch(console.error)
      .finally(() => setLoadingWidgets(false));
  }, [activeDashId, token]);

  // ── Container resize observer ────────────────────────────────────────────
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width || 1200);
    });
    ro.observe(node);
    setContainerWidth(node.clientWidth || 1200);
  }, []);

  // ── Persist layout ───────────────────────────────────────────────────────
  const saveWidgets = async (items = widgets) => {
    if (!activeDashId) return;
    setSaving(true);
    try {
      await axios.put(`/api/dsi-dashboard/${activeDashId}/widgets`, {
        widgets: items.map(w => ({
          widget_key: w.widget_key,
          pos_x: w.pos_x, pos_y: w.pos_y,
          width: w.width, height: w.height,
          config_json: w.config_json || {},
        })),
      }, { headers });
      setIsDirty(false);
    } catch (e: any) {
      alert(`Échec de l'enregistrement : ${e.response?.data?.message || e.message}`);
    } finally { setSaving(false); }
  };

  const onLayoutChange = (layout: Layout) => {
    const updated = widgets.map((w, i) => {
      const l = (layout as LayoutItem[]).find(ll => ll.i === `${w.widget_key}_${i}`);
      if (!l) return w;
      return { ...w, pos_x: l.x, pos_y: l.y, width: l.w, height: l.h };
    });
    setWidgets(updated);
    setIsDirty(true);
  };

  // ── Add widget ───────────────────────────────────────────────────────────
  const addWidget = (def: WidgetDef) => {
    const maxY = widgets.reduce((m, w) => Math.max(m, w.pos_y + w.height), 0);
    const newW: WidgetItem = {
      widget_key: def.key,
      pos_x: 0, pos_y: maxY,
      width: def.defaultSize.w, height: def.defaultSize.h,
      config_json: {},
    };
    setWidgets(prev => [...prev, newW]);
    setIsDirty(true);
  };

  // ── Remove widget ────────────────────────────────────────────────────────
  const removeWidget = (index: number) => {
    setWidgets(prev => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  // ── Dashboard CRUD ───────────────────────────────────────────────────────
  const createDashboard = async () => {
    const name = prompt('Nom du tableau de bord :', 'Nouveau tableau');
    if (!name) return;
    try {
      const r = await axios.post('/api/dsi-dashboard', { name }, { headers });
      const newDash: Dashboard = r.data;
      setDashboards(prev => [...prev, newDash]);
      setActiveDashId(newDash.id);
    } catch (e: any) {
      const code = e.response?.status;
      alert(code === 403
        ? "Accès refusé : ce module est réservé aux administrateurs."
        : `Échec de la création : ${e.response?.data?.message || e.message}`);
    }
  };

  const deleteDashboard = async () => {
    if (!activeDashId) return;
    const dash = dashboards.find(d => d.id === activeDashId);
    if (!confirm(`Supprimer "${dash?.name}" et tous ses widgets ?`)) return;
    await axios.delete(`/api/dsi-dashboard/${activeDashId}`, { headers });
    const remaining = dashboards.filter(d => d.id !== activeDashId);
    setDashboards(remaining);
    setActiveDashId(remaining[0]?.id ?? null);
  };

  const setDefault = async () => {
    if (!activeDashId) return;
    await axios.put(`/api/dsi-dashboard/${activeDashId}`, { is_default: true }, { headers });
    setDashboards(prev => prev.map(d => ({ ...d, is_default: d.id === activeDashId })));
  };

  const submitRename = async () => {
    if (!renamingId || !renameValue.trim()) return;
    await axios.put(`/api/dsi-dashboard/${renamingId}`, { name: renameValue }, { headers });
    setDashboards(prev => prev.map(d => d.id === renamingId ? { ...d, name: renameValue } : d));
    setRenamingId(null);
  };

  // ── Build layout array ───────────────────────────────────────────────────
  const layout: LayoutItem[] = widgets.map((w, i) => {
    const def = WIDGET_REGISTRY.find(r => r.key === w.widget_key);
    return {
      i: `${w.widget_key}_${i}`,
      x: w.pos_x, y: w.pos_y, w: w.width, h: w.height,
      minW: def?.minSize.w ?? 2, minH: def?.minSize.h ?? 2,
    };
  });

  const activeDash = dashboards.find(d => d.id === activeDashId);

  if (loadingDash) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Loader2 size={32} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'Arial, sans-serif' }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .drag-handle { cursor: grab; }
        .drag-handle:active { cursor: grabbing; }
        .react-resizable-handle { opacity: 0; transition: opacity .2s; }
        .widget-card:hover .react-resizable-handle { opacity: .6; }
        .react-grid-item.react-grid-placeholder { background: #3b82f6 !important; opacity: .15 !important; border-radius: 10px; }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: 56,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LayoutDashboard size={20} color="white" />
          <span style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>Tableau de bord DSI</span>

          {/* Dashboard tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#1e293b', borderRadius: 8, padding: 3, overflowX: 'auto' }}>
            {dashboards.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center' }}>
                {renamingId === d.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px' }}>
                    <input value={renameValue} onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenamingId(null); }}
                      autoFocus style={{ fontSize: 12, width: 120, padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0', outline: 'none' }} />
                    <button onClick={submitRename} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#22c55e', padding: 2, display: 'flex' }}><Check size={13} /></button>
                    <button onClick={() => setRenamingId(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: 2, display: 'flex' }}><X size={13} /></button>
                  </div>
                ) : (
                  <button style={tabStyle(d.id === activeDashId)} onClick={() => setActiveDashId(d.id)}
                    onDoubleClick={() => { setRenamingId(d.id); setRenameValue(d.name); }}>
                    {d.is_default && <Star size={11} style={{ marginRight: 4, verticalAlign: 'middle', color: '#f59e0b' }} />}
                    {d.name}
                  </button>
                )}
              </div>
            ))}
            <button onClick={createDashboard} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.6)', padding: '4px 8px', borderRadius: 6, display: 'flex' }}>
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeDashId && (
            <>
              <button onClick={() => setShowCatalog(true)} style={btnStyle('primary')}>
                <Plus size={15} /> Ajouter un widget
              </button>
              <button onClick={() => setShowSubscription(true)} style={btnStyle()}>
                <Mail size={15} /> Abonnement
              </button>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowDashMenu(v => !v)} style={btnStyle()}>
                  <MoreVertical size={15} />
                </button>
                {showDashMenu && (
                  <div onMouseLeave={() => setShowDashMenu(false)} style={{
                    position: 'absolute', right: 0, top: '110%', background: 'white',
                    borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.15)',
                    border: '1px solid #e2e8f0', minWidth: 200, zIndex: 300,
                  }}>
                    {[
                      { icon: <Edit2 size={14} />, label: 'Renommer', action: () => { setRenamingId(activeDashId); setRenameValue(activeDash?.name || ''); setShowDashMenu(false); } },
                      { icon: <Star size={14} />, label: 'Définir par défaut', action: () => { setDefault(); setShowDashMenu(false); } },
                    ].map(item => (
                      <button key={item.label} onClick={item.action} style={{ width: '100%', textAlign: 'left', padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', color: '#374151' }}>
                        {item.icon} {item.label}
                      </button>
                    ))}
                    <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />
                    <button onClick={() => { deleteDashboard(); setShowDashMenu(false); }} style={{ width: '100%', textAlign: 'left', padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', color: '#ef4444' }}>
                      <Trash2 size={14} /> Supprimer
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div ref={containerRef} style={{ padding: '20px 24px', position: 'relative' }}>
        {!activeDashId ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <LayoutDashboard size={48} color="#cbd5e1" style={{ margin: '0 auto 16px', display: 'block' }} />
            <div style={{ fontSize: 18, fontWeight: 600, color: '#94a3b8', marginBottom: 12 }}>Aucun tableau de bord</div>
            <button onClick={createDashboard} style={{ padding: '10px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              Créer mon premier tableau
            </button>
          </div>
        ) : loadingWidgets ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <Loader2 size={28} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : widgets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 15, color: '#94a3b8', marginBottom: 16 }}>Ce tableau est vide. Ajoutez des widgets pour commencer.</div>
            <button onClick={() => setShowCatalog(true)} style={{ padding: '10px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Plus size={16} /> Ajouter un widget
            </button>
          </div>
        ) : (
          <GridLayout
            layout={layout}
            width={containerWidth}
            onLayoutChange={onLayoutChange}
            gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: [10, 10] as [number, number] }}
            dragConfig={{ handle: '.drag-handle' }}
          >
            {widgets.map((w, i) => {
              const def = WIDGET_REGISTRY.find(r => r.key === w.widget_key);
              return (
                <div key={`${w.widget_key}_${i}`} className="widget-card" style={{
                  background: 'white', borderRadius: 10, border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 4px rgba(0,0,0,.06)', overflow: 'hidden',
                  display: 'flex', flexDirection: 'column',
                }}>
                  {/* Drag handle bar */}
                  <div className="drag-handle" style={{
                    height: 28, background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 8px 0 10px', flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', userSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {def?.label || w.widget_key}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); removeWidget(i); }}
                      title="Supprimer ce widget"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#cbd5e1', display: 'flex', padding: 2, borderRadius: 4, flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                    {renderWidget(w.widget_key)}
                  </div>
                </div>
              );
            })}
          </GridLayout>
        )}
      </div>

      {/* ── Save bar ── */}
      {isDirty && (
        <div style={{
          position: 'fixed', bottom: 20, right: 24, zIndex: 200,
          display: 'flex', gap: 8, alignItems: 'center',
          background: '#1e293b', borderRadius: 12, padding: '10px 16px',
          boxShadow: '0 8px 24px rgba(0,0,0,.25)',
        }}>
          <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>Modifications non enregistrées</span>
          <button onClick={() => saveWidgets()} disabled={saving} style={{
            background: saving ? '#64748b' : '#3b82f6', color: 'white', border: 'none',
            borderRadius: 8, padding: '7px 16px', cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {saving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            Enregistrer
          </button>
        </div>
      )}

      {/* ── Modals ── */}
      {showCatalog && (
        <WidgetCatalog
          existingKeys={widgets.map(w => w.widget_key)}
          onAdd={w => addWidget(w)}
          onClose={() => setShowCatalog(false)}
        />
      )}
      {showSubscription && activeDashId && (
        <SubscriptionModal
          dashboardId={activeDashId}
          dashboardName={activeDash?.name || ''}
          onClose={() => setShowSubscription(false)}
        />
      )}
    </div>
  );
}
