import React, { useState, useCallback } from 'react';
import {
  MapContainer, TileLayer, Polyline, CircleMarker,
  Tooltip, LayerGroup, useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { NetworkLink, SiteRef } from './types';
import { linkStyle } from './utils';

// ── Constantes ──────────────────────────────────────────────────────
const CITY_CENTER: [number, number] = [48.8130, 2.3890];

const CORE_SITES  = new Set(['S001', 'S001B01', 'S064', 'S064B01']);
const IRF_NORD    = new Set(['S001B02','S004B01','S005B01','S022B01']);
const IRF_SUD     = new Set(['S007B01','S045B01','S002B01','S002B02']);

function siteImportance(code: string) {
  if (CORE_SITES.has(code))  return 'core' as const;
  if (IRF_NORD.has(code) || IRF_SUD.has(code)) return 'irf' as const;
  return 'normal' as const;
}

function siteColor(code: string, isHighlighted: boolean, isMoving: boolean) {
  if (isMoving)     return { fill: '#fef9c3', stroke: '#f59e0b' };
  if (isHighlighted) return { fill: '#fecaca', stroke: '#dc2626' };
  if (CORE_SITES.has(code))  return { fill: '#0f172a', stroke: '#0f172a' };
  if (IRF_NORD.has(code))    return { fill: '#2563eb', stroke: '#1d4ed8' };
  if (IRF_SUD.has(code))     return { fill: '#16a34a', stroke: '#15803d' };
  return { fill: '#fff', stroke: '#64748b' };
}

function siteRadius(code: string, isMoving: boolean) {
  if (isMoving) return 13;
  const imp = siteImportance(code);
  if (imp === 'core') return 11;
  if (imp === 'irf')  return 8;
  return 5;
}

// ── Résolution géométrie ─────────────────────────────────────────────
function linkLatLngs(link: NetworkLink, sites: Map<string, SiteRef>): [number, number][] | null {
  const coords = link.geometry?.coordinates;
  if (coords && coords.length >= 2)
    return (coords as number[][]).map(c => [c[1], c[0]]);
  const a = sites.get(link.site_a);
  const b = sites.get(link.site_b);
  if (a?.lat != null && a?.lng != null && b?.lat != null && b?.lng != null)
    return [[a.lat as number, a.lng as number], [b.lat as number, b.lng as number]];
  return null;
}

// ── Légende ──────────────────────────────────────────────────────────
const Legend: React.FC = () => (
  <div style={{
    position: 'absolute', bottom: 28, left: 12, zIndex: 1000,
    background: 'rgba(255,255,255,.95)', borderRadius: 10, padding: '10px 14px',
    boxShadow: '0 2px 12px rgba(0,0,0,.15)', fontSize: 12, minWidth: 190,
    backdropFilter: 'blur(4px)',
  }}>
    <div style={{ fontWeight: 700, marginBottom: 8, color: '#0f172a' }}>Légende</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ width: 28, height: 3, background: '#16a34a', borderRadius: 2 }} />
      <span style={{ color: '#374151' }}>Lien inter-sites</span>
    </div>
    {([
      ['#0f172a', 'Site cœur'],
      ['#2563eb', 'Site de boucle'],
      ['#64748b', 'Autre site'],
    ] as [string, string][]).map(([color, label]) => (
      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, display: 'inline-block' }} />
        <span style={{ color: '#374151' }}>{label}</span>
      </div>
    ))}
    <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 6, paddingTop: 6, fontSize: 11, color: '#64748b' }}>
      💡 Clic sur un lien pour le mettre en évidence · clic sur un site pour le déplacer
    </div>
  </div>
);

// ── Gestionnaire clics carte ─────────────────────────────────────────
const MapClickHandler: React.FC<{
  drawMode: boolean;
  moveMode: boolean;
  onDrawClick: (lat: number, lng: number) => void;
  onMoveClick: (lat: number, lng: number) => void;
  onDrawMove:  (lat: number, lng: number) => void;
  onMoveMove:  (lat: number, lng: number) => void;
}> = ({ drawMode, moveMode, onDrawClick, onMoveClick, onDrawMove, onMoveMove }) => {
  useMapEvents({
    click(e) {
      if (drawMode) onDrawClick(e.latlng.lat, e.latlng.lng);
      else if (moveMode) onMoveClick(e.latlng.lat, e.latlng.lng);
    },
    mousemove(e) {
      if (drawMode) onDrawMove(e.latlng.lat, e.latlng.lng);
      else if (moveMode) onMoveMove(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

// ── Props ─────────────────────────────────────────────────────────────
export interface MoveResult { siteId: number; siteCode: string; lat: number; lng: number; }

interface Props {
  sites:          Map<string, SiteRef>;
  links:          NetworkLink[];
  layers:         { links: boolean; sites: boolean };
  drawMode:       boolean;
  drawnPoints:    [number, number][];
  onMapClick:     (lat: number, lng: number) => void;
  highlightSites?: string[];
  onSiteMoved?:  (result: MoveResult) => void;
  selectedLinkId?: string | null;
  onSelectLink?:  (id: string | null) => void;
}

// ── Composant principal ───────────────────────────────────────────────
const NetworkMap: React.FC<Props> = ({
  sites, links, layers, drawMode, drawnPoints, onMapClick,
  highlightSites = [], onSiteMoved, selectedLinkId = null, onSelectLink,
}) => {
  const [drawCursor, setDrawCursor] = useState<[number, number] | null>(null);

  // Mode déplacement
  const [movingSite, setMovingSite]       = useState<SiteRef | null>(null);
  const [moveCursor, setMoveCursor]       = useState<[number, number] | null>(null);
  const [moveSaving, setMoveSaving]       = useState(false);
  const [moveConfirmPos, setMoveConfirmPos] = useState<[number, number] | null>(null);

  const handleSiteClick = useCallback((s: SiteRef) => {
    if (drawMode) return; // ne pas interférer avec le mode tracé
    if (movingSite?.site_code === s.site_code) {
      // Deuxième clic sur le même site → annule
      setMovingSite(null); setMoveCursor(null); setMoveConfirmPos(null);
    } else {
      setMovingSite(s); setMoveCursor(null); setMoveConfirmPos(null);
    }
  }, [drawMode, movingSite]);

  const handleMoveClick = useCallback(async (lat: number, lng: number) => {
    if (!movingSite) return;
    if (moveSaving) return;
    setMoveConfirmPos([lat, lng]);
    setMoveSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/ville/sites/${movingSite.id}/geocode`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lat, lng, manual: true }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      if (onSiteMoved) onSiteMoved({ siteId: movingSite.id!, siteCode: movingSite.site_code, lat, lng });
    } catch (e) {
      alert('Impossible de sauvegarder la position');
    } finally {
      setMoveSaving(false);
      setMovingSite(null);
      setMoveCursor(null);
      setMoveConfirmPos(null);
    }
  }, [movingSite, moveSaving, onSiteMoved]);

  // ── Calculs ──────────────────────────────────────────────────────
  const referenced = new Set<string>();
  links.forEach(l => { referenced.add(l.site_a); referenced.add(l.site_b); });
  highlightSites.forEach(s => { if (s) referenced.add(s); });

  const siteEntries = layers.sites
    ? Array.from(sites.values()).filter(s => s.lat != null && s.lng != null)
    : Array.from(referenced).map(c => sites.get(c)).filter((s): s is SiteRef => !!s && s.lat != null && s.lng != null);

  const layerOn = (_link: NetworkLink) => layers.links;

  const drawAnchor = drawnPoints.length > 0 ? drawnPoints[drawnPoints.length - 1] : null;
  const isMoving = !!movingSite;
  const cursorStyle = isMoving ? 'crosshair' : drawMode ? 'crosshair' : '';

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', cursor: cursorStyle }}>
      {/* ── Bandeau mode déplacement ── */}
      {movingSite && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: '#1e293b', color: 'white',
          padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span>📍 Cliquez sur la carte pour placer :</span>
          <strong style={{ color: '#fbbf24' }}>{movingSite.site_code} — {movingSite.nom}</strong>
          {moveSaving && <span style={{ color: '#94a3b8' }}>Enregistrement…</span>}
          <button onClick={() => { setMovingSite(null); setMoveCursor(null); }} style={{
            background: 'rgba(255,255,255,.15)', border: 'none', color: 'white',
            borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 12,
          }}>✕ Annuler</button>
        </div>
      )}

      <MapContainer
        center={CITY_CENTER}
        zoom={14}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          opacity={0.75}
        />
        <MapClickHandler
          drawMode={drawMode}
          moveMode={isMoving}
          onDrawClick={onMapClick}
          onMoveClick={handleMoveClick}
          onDrawMove={(la, ln) => setDrawCursor([la, ln])}
          onMoveMove={(la, ln) => setMoveCursor([la, ln])}
        />

        {/* ── Liens réseau ── */}
        <LayerGroup>
          {links.filter(layerOn).map(link => {
            const pts = linkLatLngs(link, sites);
            if (!pts) return null;
            const st = linkStyle(link);
            const siteA = sites.get(link.site_a);
            const siteB = sites.get(link.site_b);
            const isSelected = selectedLinkId === link.id;
            return (
              <Polyline key={link.id} positions={pts}
                eventHandlers={{ click: () => onSelectLink?.(isSelected ? null : link.id) }}
                pathOptions={{
                  color: isSelected ? '#dc2626' : st.color,
                  weight: isSelected ? st.weight + 4 : st.weight,
                  dashArray: st.dashArray,
                  opacity: isSelected ? 1 : (selectedLinkId ? 0.35 : 0.9),
                }}>
                <Tooltip sticky>
                  <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 13, lineHeight: 1.5 }}>
                    <strong style={{ color: st.color }}>
                      {link.type}{link.operator ? ` · ${link.operator}` : ''}{link.capacity ? ` · ${link.capacity}` : ''}
                    </strong><br />
                    {siteA?.nom || link.site_a}<br />↕<br />{siteB?.nom || link.site_b}
                    {link.fo_pairs && <><br /><small>Paires : {link.fo_pairs}</small></>}
                    {link.bag_id   && <><br /><small>Agrégat : {link.bag_id}</small></>}
                    {link.is_loop  && <><br /><span style={{ color: '#16a34a' }}>● Boucle IRF</span></>}
                    {link.notes    && <><br /><small style={{ color: '#64748b' }}>{link.notes}</small></>}
                  </div>
                </Tooltip>
              </Polyline>
            );
          })}
        </LayerGroup>

        {/* ── Cursor fantôme en mode déplacement ── */}
        {isMoving && moveCursor && (
          <CircleMarker center={moveCursor} radius={10}
            pathOptions={{ color: '#f59e0b', fillColor: '#fef9c3', fillOpacity: 0.7, weight: 2, dashArray: '4 3' }}>
          </CircleMarker>
        )}

        {/* ── Tracé manuel ── */}
        {drawMode && drawnPoints.length > 0 && (
          <Polyline positions={drawnPoints}
            pathOptions={{ color: '#0ea5e9', weight: 3, dashArray: '4 4' }} />
        )}
        {drawMode && drawAnchor && drawCursor && (
          <Polyline positions={[drawAnchor, drawCursor]}
            pathOptions={{ color: '#0ea5e9', weight: 2, dashArray: '2 6', opacity: 0.7 }} />
        )}

        {/* ── Marqueurs sites ── */}
        <LayerGroup>
          {siteEntries.map(s => {
            const isHl     = highlightSites.includes(s.site_code);
            const isRef    = referenced.has(s.site_code);
            const isMov    = movingSite?.site_code === s.site_code;
            const imp      = siteImportance(s.site_code);
            const c        = siteColor(s.site_code, isHl, isMov);
            const r        = siteRadius(s.site_code, isMov);

            if (!isRef && !layers.sites && !isMov) return null;

            return (
              <CircleMarker
                key={s.site_code}
                center={[s.lat as number, s.lng as number]}
                radius={r}
                pathOptions={{
                  color:       c.stroke,
                  fillColor:   c.fill,
                  fillOpacity: isRef || imp !== 'normal' || isMov ? 1 : 0.45,
                  weight:      imp === 'core' ? 3 : isMov ? 3 : 2,
                }}
                eventHandlers={{ click: () => handleSiteClick(s) }}
              >
                {/* Tooltip visible uniquement au hover */}
                <Tooltip direction="top" offset={[0, -r]}>
                  <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 12, lineHeight: 1.5 }}>
                    <strong>{s.site_code}</strong> — {s.nom}
                    {imp === 'core' && <><br /><span style={{ color: '#2563eb' }}>⬡ Cœur IRF</span></>}
                    {IRF_NORD.has(s.site_code) && <><br /><span style={{ color: '#2563eb' }}>⬢ Boucle Nord</span></>}
                    {IRF_SUD.has(s.site_code)  && <><br /><span style={{ color: '#16a34a' }}>⬢ Boucle Sud</span></>}
                    {s.geocoded_manually && <><br /><span style={{ color: '#f59e0b' }}>📍 Position manuelle</span></>}
                    {!s.geocoded_manually && s.lat_own == null && <><br /><span style={{ color: '#94a3b8', fontSize: 11 }}>📍 Hérité du site parent</span></>}
                    <br /><span style={{ color: '#64748b', fontSize: 11 }}>Clic pour déplacer</span>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </LayerGroup>

        {/* ── Légende ── */}
        <Legend />
      </MapContainer>
    </div>
  );
};

export default NetworkMap;
