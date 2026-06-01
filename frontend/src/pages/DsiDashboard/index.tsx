import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import CanvasGrid from './CanvasGrid';
import type { CanvasItem } from './CanvasGrid';
import { WidgetDef } from './widgets/registry';
import {
  Plus, Trash2, LayoutDashboard, Mail,
  MoreVertical, Star, Edit2, Check, X, Loader2, Play, Square, Pause, Settings,
} from 'lucide-react';
import WidgetCatalog from './WidgetCatalog';
import SubscriptionModal from './SubscriptionModal';
import SlideshowSettingsModal from './SlideshowSettingsModal';
import { renderWidget } from './widgets/index';
import { WIDGET_REGISTRY } from './widgets/registry';
import { DashboardFilterContext } from './DashboardFilterContext';
import type { DashboardFilter, FilterPeriod } from './DashboardFilterContext';
import { PERIOD_LABELS } from './DashboardFilterContext';

interface Dashboard {
  id: number;
  name: string;
  is_default: boolean;
  created_at: string;
  is_rotating: boolean;
  rotation_seconds: number;
  rotation_order: number;
  rotation_filter: { period?: FilterPeriod; group_id?: number | null };
}
interface WidgetItem {
  id?: number;
  widget_key: string; pos_x: number; pos_y: number; width: number; height: number; config_json: any;
}

// Pixel factors for converting DB grid units ↔ canvas pixels
const COL_PX = 100;  // 1 grid column = 100px
const ROW_PX = 80;   // 1 grid row = 80px

function toPx(item: WidgetItem): CanvasItem {
  return {
    i: item.widget_key + '_canvas',
    x: item.pos_x * COL_PX,
    y: item.pos_y * ROW_PX,
    w: Math.max(COL_PX, item.width * COL_PX),
    h: Math.max(ROW_PX, item.height * ROW_PX),
    minW: 160,
    minH: 80,
  };
}

function fromPx(canvas: CanvasItem, original: WidgetItem): WidgetItem {
  return {
    ...original,
    pos_x: Math.round(canvas.x / COL_PX),
    pos_y: Math.round(canvas.y / ROW_PX),
    width: Math.max(1, Math.round(canvas.w / COL_PX)),
    height: Math.max(1, Math.round(canvas.h / ROW_PX)),
  };
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap',
    background: active ? 'white' : 'transparent',
    color: active ? '#1e293b' : 'rgba(255,255,255,.7)',
  };
}

function btnStyle(variant: 'primary' | 'ghost' | 'danger' | 'slideshow' = 'ghost'): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
    borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
    background: variant === 'primary' ? '#3b82f6'
      : variant === 'danger' ? '#ef4444'
      : variant === 'slideshow' ? 'rgba(251,191,36,.15)'
      : 'rgba(255,255,255,.1)',
    color: variant === 'slideshow' ? '#fbbf24' : 'white',
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
  const [showSlideshowSettings, setShowSlideshowSettings] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showDashMenu, setShowDashMenu] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  // canvas pixel positions (derived from widgets, synced on each onChange)
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);

  // ── Slideshow state ──────────────────────────────────────────────────────
  const [slideshowActive, setSlideshowActive] = useState(false);
  const [slideshowPaused, setSlideshowPaused] = useState(false);
  const [slideshowProgress, setSlideshowProgress] = useState(0);
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const slideshowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideshowTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideshowStartRef = useRef<number>(0);

  const rotatingDashboards = dashboards
    .filter(d => d.is_rotating)
    .sort((a, b) => a.rotation_order - b.rotation_order);

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
      .then(r => {
        const ws: WidgetItem[] = r.data;
        setWidgets(ws);
        setCanvasItems(ws.map((w, i) => ({ ...toPx(w), i: `${w.widget_key}_${i}` })));
      })
      .catch(console.error)
      .finally(() => setLoadingWidgets(false));
  }, [activeDashId, token]);

  // ── ESC to exit slideshow ────────────────────────────────────────────────
  useEffect(() => {
    if (!slideshowActive) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stopSlideshow(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slideshowActive]);

  // ── Slideshow engine ─────────────────────────────────────────────────────
  const clearSlideshowTimers = () => {
    if (slideshowTimerRef.current) clearTimeout(slideshowTimerRef.current);
    if (slideshowTickRef.current) clearInterval(slideshowTickRef.current);
  };

  const advanceSlideshow = useCallback((index: number, dashes: Dashboard[]) => {
    if (dashes.length === 0) return;
    const dash = dashes[index % dashes.length];
    const seconds = Math.max(5, dash.rotation_seconds || 30);
    setActiveDashId(dash.id);
    setSlideshowProgress(0);
    slideshowStartRef.current = Date.now();

    clearSlideshowTimers();

    slideshowTickRef.current = setInterval(() => {
      const elapsed = (Date.now() - slideshowStartRef.current) / 1000;
      setSlideshowProgress(Math.min(100, (elapsed / seconds) * 100));
    }, 100);

    slideshowTimerRef.current = setTimeout(() => {
      const nextIndex = (index + 1) % dashes.length;
      setSlideshowIndex(nextIndex);
      advanceSlideshow(nextIndex, dashes);
    }, seconds * 1000);
  }, []);

  const startSlideshow = () => {
    if (rotatingDashboards.length === 0) return;
    setSlideshowActive(true);
    setSlideshowPaused(false);
    setSlideshowIndex(0);
    advanceSlideshow(0, rotatingDashboards);
  };

  const stopSlideshow = () => {
    clearSlideshowTimers();
    setSlideshowActive(false);
    setSlideshowPaused(false);
    setSlideshowProgress(0);
  };

  const pauseSlideshow = () => {
    clearSlideshowTimers();
    setSlideshowPaused(true);
  };

  const resumeSlideshow = () => {
    setSlideshowPaused(false);
    advanceSlideshow(slideshowIndex, rotatingDashboards);
  };

  const prevSlide = () => {
    const idx = (slideshowIndex - 1 + rotatingDashboards.length) % rotatingDashboards.length;
    setSlideshowIndex(idx);
    advanceSlideshow(idx, rotatingDashboards);
  };

  const nextSlide = () => {
    const idx = (slideshowIndex + 1) % rotatingDashboards.length;
    setSlideshowIndex(idx);
    advanceSlideshow(idx, rotatingDashboards);
  };

  // cleanup on unmount
  useEffect(() => () => clearSlideshowTimers(), []);

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

  const onCanvasChange = useCallback((updated: CanvasItem[]) => {
    setCanvasItems(updated);
    setWidgets(prev => prev.map((w, i) => {
      const ci = updated.find(c => c.i === `${w.widget_key}_${i}`);
      return ci ? fromPx(ci, w) : w;
    }));
    setIsDirty(true);
  }, []);

  // ── Add / Remove widget ──────────────────────────────────────────────────
  const addWidget = (def: WidgetDef) => {
    const maxY = canvasItems.reduce((m, c) => Math.max(m, c.y + c.h), 0);
    const newWidget: WidgetItem = {
      widget_key: def.key, pos_x: 0, pos_y: Math.round(maxY / ROW_PX),
      width: def.defaultSize.w, height: def.defaultSize.h, config_json: {},
    };
    const newIndex = widgets.length;
    const newCanvas: CanvasItem = {
      ...toPx(newWidget),
      i: `${def.key}_${newIndex}`,
      y: maxY + 10,
    };
    setWidgets(prev => [...prev, newWidget]);
    setCanvasItems(prev => [...prev, newCanvas]);
    setIsDirty(true);
  };

  const removeWidget = (index: number) => {
    setWidgets(prev => prev.filter((_, i) => i !== index));
    setCanvasItems(prev => prev.filter((_, i) => i !== index));
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

  const saveSlideshowSettings = async (settings: {
    is_rotating: boolean; rotation_seconds: number;
    rotation_order: number; rotation_filter: any;
  }) => {
    if (!activeDashId) return;
    try {
      const r = await axios.put(`/api/dsi-dashboard/${activeDashId}`, settings, { headers });
      setDashboards(prev => prev.map(d => d.id === activeDashId ? { ...d, ...r.data } : d));
    } catch (e: any) {
      alert(`Erreur : ${e.response?.data?.message || e.message}`);
    }
  };

  const activeDash = dashboards.find(d => d.id === activeDashId);
  const dashFilter: DashboardFilter = activeDash?.rotation_filter || {};

  // Which slide is showing (for display in slideshow bar)
  const currentSlideDash = slideshowActive
    ? rotatingDashboards[slideshowIndex % rotatingDashboards.length]
    : null;
  const nextSlideDash = slideshowActive && rotatingDashboards.length > 1
    ? rotatingDashboards[(slideshowIndex + 1) % rotatingDashboards.length]
    : null;

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

          {/* Dashboard tabs — hidden in slideshow mode */}
          {!slideshowActive && (
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
                      {d.is_rotating && <Play size={10} style={{ marginRight: 3, verticalAlign: 'middle', color: '#fbbf24' }} />}
                      {d.name}
                    </button>
                  )}
                </div>
              ))}
              <button onClick={createDashboard} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.6)', padding: '4px 8px', borderRadius: 6, display: 'flex' }}>
                <Plus size={16} />
              </button>
            </div>
          )}

          {/* Slideshow info bar */}
          {slideshowActive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ background: 'rgba(251,191,36,.15)', border: '1px solid rgba(251,191,36,.3)', borderRadius: 8, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Play size={12} color="#fbbf24" fill="#fbbf24" />
                <span style={{ color: '#fbbf24', fontSize: 13, fontWeight: 600 }}>
                  {currentSlideDash?.name}
                </span>
                <span style={{ color: 'rgba(251,191,36,.5)', fontSize: 11 }}>
                  {slideshowIndex + 1}/{rotatingDashboards.length}
                </span>
                {currentSlideDash?.rotation_filter?.period && currentSlideDash.rotation_filter.period !== 'all' && (
                  <span style={{ background: 'rgba(251,191,36,.2)', color: '#fbbf24', fontSize: 10, padding: '1px 6px', borderRadius: 4 }}>
                    {PERIOD_LABELS[currentSlideDash.rotation_filter.period]}
                  </span>
                )}
              </div>
              {nextSlideDash && (
                <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 11 }}>
                  Suivant : {nextSlideDash.name}
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Slideshow controls */}
          {slideshowActive ? (
            <>
              <button onClick={prevSlide} style={{ ...btnStyle(), padding: '7px 10px' }} title="Tableau précédent">‹</button>
              {slideshowPaused
                ? <button onClick={resumeSlideshow} style={btnStyle('slideshow')}><Play size={14} /> Reprendre</button>
                : <button onClick={pauseSlideshow} style={btnStyle('slideshow')}><Pause size={14} /> Pause</button>
              }
              <button onClick={nextSlide} style={{ ...btnStyle(), padding: '7px 10px' }} title="Tableau suivant">›</button>
              <button onClick={stopSlideshow} style={btnStyle('danger')}><Square size={14} /> Arrêter</button>
            </>
          ) : (
            <>
              {rotatingDashboards.length > 0 && (
                <button onClick={startSlideshow} style={btnStyle('slideshow')}>
                  <Play size={15} /> Diaporama
                  <span style={{ background: 'rgba(251,191,36,.3)', borderRadius: 10, padding: '1px 6px', fontSize: 11 }}>
                    {rotatingDashboards.length}
                  </span>
                </button>
              )}
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
                        border: '1px solid #e2e8f0', minWidth: 220, zIndex: 300,
                      }}>
                        {[
                          { icon: <Edit2 size={14} />, label: 'Renommer', action: () => { setRenamingId(activeDashId); setRenameValue(activeDash?.name || ''); setShowDashMenu(false); } },
                          { icon: <Star size={14} />, label: 'Définir par défaut', action: () => { setDefault(); setShowDashMenu(false); } },
                          { icon: <Settings size={14} />, label: 'Paramètres diaporama', action: () => { setShowSlideshowSettings(true); setShowDashMenu(false); } },
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
            </>
          )}
        </div>
      </div>

      {/* ── Slideshow progress bar ── */}
      {slideshowActive && !slideshowPaused && (
        <div style={{ height: 3, background: '#1e293b', position: 'sticky', top: 56, zIndex: 99 }}>
          <div style={{
            height: '100%', background: '#fbbf24',
            width: `${slideshowProgress}%`,
            transition: 'width .1s linear',
          }} />
        </div>
      )}

      {/* ── Body ── */}
      <DashboardFilterContext.Provider value={dashFilter}>
        <div style={{ padding: '20px 24px', overflowX: 'auto' }}>
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
            <CanvasGrid items={canvasItems} onChange={onCanvasChange} disabled={slideshowActive}>
              {(item, i, _cw) => {
                const w = widgets[i];
                if (!w) return null;
                const def = WIDGET_REGISTRY.find(r => r.key === w.widget_key);
                return (
                  <div style={{
                    width: '100%', height: '100%',
                    background: 'white', borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 8px rgba(0,0,0,.07)',
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                  }}>
                    {/* Title bar — drag the whole card from here */}
                    <div style={{
                      height: 32, background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0 8px 0 10px', flexShrink: 0,
                      userSelect: 'none',
                    }}>
                      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {def?.label || w.widget_key}
                      </span>
                      {!slideshowActive && (
                        <button
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); removeWidget(i); }}
                          title="Supprimer ce widget"
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#cbd5e1', display: 'flex', padding: 2, borderRadius: 4, flexShrink: 0 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    {/* Content — stop propagation so scroll doesn't trigger drag */}
                    <div
                      onMouseDown={e => e.stopPropagation()}
                      style={{ flex: 1, overflow: 'auto', minHeight: 0 }}
                    >
                      {renderWidget(w.widget_key)}
                    </div>
                  </div>
                );
              }}
            </CanvasGrid>
          )}
        </div>
      </DashboardFilterContext.Provider>

      {/* ── Save bar (hidden during slideshow) ── */}
      {isDirty && !slideshowActive && (
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

      {/* ── Slideshow countdown overlay ── */}
      {slideshowActive && currentSlideDash && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 200, background: '#0f172a', borderRadius: 12, padding: '8px 20px',
          boxShadow: '0 8px 24px rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>
            {Math.round(currentSlideDash.rotation_seconds * (1 - slideshowProgress / 100))}s
          </span>
          <div style={{ width: 100, height: 4, background: 'rgba(255,255,255,.1)', borderRadius: 2 }}>
            <div style={{ height: '100%', background: '#fbbf24', borderRadius: 2, width: `${slideshowProgress}%`, transition: 'width .1s linear' }} />
          </div>
          <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>ESC pour quitter</span>
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
      {showSlideshowSettings && activeDash && (
        <SlideshowSettingsModal
          dashboardName={activeDash.name}
          current={{
            is_rotating: activeDash.is_rotating || false,
            rotation_seconds: activeDash.rotation_seconds || 30,
            rotation_order: activeDash.rotation_order || 0,
            rotation_filter: activeDash.rotation_filter || {},
          }}
          onSave={saveSlideshowSettings}
          onClose={() => setShowSlideshowSettings(false)}
        />
      )}
    </div>
  );
}
