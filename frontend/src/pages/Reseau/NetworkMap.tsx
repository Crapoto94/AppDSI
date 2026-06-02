import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  MapContainer, TileLayer, Polyline, CircleMarker,
  Tooltip, LayerGroup, useMapEvents, useMap, GeoJSON, Marker,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { NetworkLink, SiteRef, Equipement, DxfEntite } from './types';
import { linkStyle } from './utils';

// ── Constantes ──────────────────────────────────────────────────────
const CITY_CENTER: [number, number] = [48.8130, 2.3890];

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}

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

function siteRadius(code: string, isMoving: boolean, equipCount = 0) {
  if (isMoving) return 13;
  const extra = equipCount > 0 ? Math.min(Math.sqrt(equipCount) * 2.5, 12) : 0;
  const base = 5 + extra;
  const imp = siteImportance(code);
  if (imp === 'core') return Math.max(base, 11);
  if (imp === 'irf')  return Math.max(base, 8);
  return base;
}

// ── Résolution géométrie ─────────────────────────────────────────────
function resolveSiteRef(code: string, sites: Map<string, SiteRef>): SiteRef | undefined {
  const direct = sites.get(code);
  if (direct) return direct;
  const parentCode = code.replace(/(B|L|EXT|ESP).*$/, '');
  if (parentCode !== code) return sites.get(parentCode) || undefined;
  return undefined;
}

function linkLatLngs(link: NetworkLink, sites: Map<string, SiteRef>): [number, number][] | null {
  const coords = link.geometry?.coordinates;
  if (coords && coords.length >= 2)
    return (coords as number[][]).map(c => [c[1], c[0]]);
  const a = resolveSiteRef(link.site_a, sites);
  const b = resolveSiteRef(link.site_b, sites);
  if (a?.lat != null && a?.lng != null && b?.lat != null && b?.lng != null)
    return [[a.lat as number, a.lng as number], [b.lat as number, b.lng as number]];
  return null;
}

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

// ── Fit map bounds to selected link ──────────────────────────────────
const MapFitBounds: React.FC<{
  links: NetworkLink[];
  sites: Map<string, SiteRef>;
  selectedLinkId: string | null;
}> = ({ links, sites, selectedLinkId }) => {
  const map = useMap();
  useEffect(() => {
    if (!selectedLinkId) return;
    const link = links.find(l =>
      l.id.startsWith('sl-')
        ? l.id.startsWith(selectedLinkId + '-')
        : l.id === selectedLinkId
    );
    if (!link) return;
    const a = sites.get(link.site_a);
    const b = sites.get(link.site_b);
    if (a?.lat != null && a?.lng != null && b?.lat != null && b?.lng != null) {
      map.fitBounds([[a.lat, a.lng], [b.lat, b.lng]], { padding: [60, 60], maxZoom: 17 });
    }
  }, [selectedLinkId, links, sites, map]);
  return null;
};

// ── Props ─────────────────────────────────────────────────────────────
export interface MoveResult { siteId: number; siteCode: string; lat: number; lng: number; }

interface Props {
  sites:          Map<string, SiteRef>;
  links:          NetworkLink[];
  layers:         { links: boolean; sites: boolean; coeur: boolean; dxf: boolean };
  drawMode:       boolean;
  drawnPoints:    [number, number][];
  onMapClick:     (lat: number, lng: number) => void;
  highlightSites?: string[];
  onSiteMoved?:  (result: MoveResult) => void;
  selectedLinkId?: string | null;
  onSelectLink?:  (id: string | null) => void;
  equipementsBySite?: Map<string, Equipement[]>;
  dxfEntities?:   DxfEntite[];
  /** Visibilité + couleur d'affichage par calque DXF. */
  dxfLayerSettings?: Record<string, { visible: boolean; color?: string | null }>;
}

// ── Composant principal ───────────────────────────────────────────────
const NetworkMap: React.FC<Props> = ({
  sites, links, layers, drawMode, drawnPoints, onMapClick,
  highlightSites = [], onSiteMoved, selectedLinkId = null, onSelectLink,
  equipementsBySite, dxfEntities, dxfLayerSettings,
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

  const hasEquip = (code: string) => !equipementsBySite || equipementsBySite.has(code);
  const isImportantSite = (code: string) => CORE_SITES.has(code) || IRF_NORD.has(code) || IRF_SUD.has(code);

  let siteEntries: SiteRef[];
  if (layers.coeur) {
    siteEntries = Array.from(sites.values())
      .filter(s => s.lat != null && s.lng != null && isImportantSite(s.site_code) && hasEquip(s.site_code));
  } else if (layers.sites) {
    siteEntries = Array.from(sites.values())
      .filter(s => s.lat != null && s.lng != null && hasEquip(s.site_code));
  } else {
    // Aucune couche active → seuls les sites en surbrillance (lien sélectionné) ou en déplacement
    siteEntries = highlightSites
      .filter(c => sites.has(c))
      .map(c => sites.get(c)!)
      .filter((s): s is SiteRef => s.lat != null && s.lng != null && hasEquip(s.site_code));
  }

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
        {selectedLinkId && (
          <MapFitBounds links={links} sites={sites} selectedLinkId={selectedLinkId} />
        )}

        {/* ── Plans DXF ── */}
        {layers.dxf && dxfEntities && dxfEntities.length > 0 && (
          <LayerGroup>
            {dxfEntities.map(ent => {
              const setting = dxfLayerSettings?.[ent.calque];
              if (setting && setting.visible === false) return null;
              const color = setting?.color || ent.couleur || '#3388ff';
              const props: any = ent.geojson.properties || {};

              // Libellés texte (TEXT / MTEXT)
              if (props.type === 'text') {
                const c = ent.geojson.geometry.type === 'Point'
                  ? (ent.geojson.geometry as any).coordinates : null;
                if (!c || !props.text) return null;
                // La couleur DXF des textes est souvent blanche (fond noir CAO) → illisible
                // sur fond clair. On force une couleur foncée lisible, sauf override de calque.
                const txtColor = setting?.color || '#0f172a';
                const icon = L.divIcon({
                  className: 'dxf-text-label',
                  html: `<span style="color:${txtColor};font-size:11px;font-weight:600;white-space:nowrap;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;transform:rotate(${-(props.rotation || 0)}deg);display:inline-block;">${escapeHtml(props.text)}</span>`,
                  iconSize: [0, 0], iconAnchor: [0, 0],
                });
                return <Marker key={ent.id} position={[c[1], c[0]]} icon={icon} interactive={false} />;
              }

              const style: any = { color, weight: ent.epaisseur || 1 };
              if (ent.type === 'CIRCLE' || ent.geojson.geometry.type === 'Point') {
                style.radius = props.radius ? Math.min(props.radius * 2, 8) : 4;
                style.fillColor = color;
                style.fillOpacity = 0.4;
              }
              return <GeoJSON key={ent.id} data={ent.geojson as any} style={style} />;
            })}
          </LayerGroup>
        )}

        {/* ── Liens réseau ── */}
        <LayerGroup>
          {links.filter(layerOn).map(link => {
            const pts = linkLatLngs(link, sites);
            if (!pts) return null;
            const st = linkStyle(link);
            const siteA = resolveSiteRef(link.site_a, sites);
            const siteB = resolveSiteRef(link.site_b, sites);
            const isSelected = selectedLinkId
              ? (link.id.startsWith('sl-') ? link.id.startsWith(selectedLinkId + '-') : selectedLinkId === link.id)
              : false;
            const selectId = link.id.startsWith('sl-')
              ? link.id.split('-').slice(0, 2).join('-')
              : link.id;
            return (
              <Polyline key={link.id} positions={pts}
                eventHandlers={{ click: () => onSelectLink?.(isSelected ? null : selectId) }}
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
            const eqCount  = equipementsBySite?.get(s.site_code)?.length || 0;
            const hasCoeur = layers.coeur;
            const r        = hasCoeur ? siteRadius(s.site_code, isMov, eqCount) : (isMoving ? 13 : 5 + Math.min(Math.sqrt(eqCount) * 2.5, 12));
            const c        = hasCoeur ? siteColor(s.site_code, isHl, isMov) : (() => {
              if (isMov) return { fill: '#fef9c3', stroke: '#f59e0b' };
              return { fill: '#2563eb', stroke: '#1d4ed8' };
            })();

            return (
              <CircleMarker
                key={s.site_code}
                center={[s.lat as number, s.lng as number]}
                radius={r}
                pathOptions={{
                  color:       c.stroke,
                  fillColor:   c.fill,
                  fillOpacity: hasCoeur ? (isRef || imp !== 'normal' || isMov ? 1 : 0.45) : 0.8,
                  weight:      hasCoeur ? (imp === 'core' ? 3 : isMov ? 3 : 2) : 2,
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
                    {(() => {
                      const eqs = equipementsBySite?.get(s.site_code);
                      if (!eqs || eqs.length === 0) return null;
                      const groups = new Map<string, Equipement[]>();
                      for (const eq of eqs) {
                        const loc = eq.localisation || '—';
                        if (!groups.has(loc)) groups.set(loc, []);
                        groups.get(loc)!.push(eq);
                      }
                      const entries = [...groups.entries()];
                      return (
                        <>
                          <br /><span style={{ color: '#0ea5e9', fontWeight: 700, fontSize: 11 }}>▸ Équipements ({eqs.length})</span>
                          {entries.map(([loc, list]) => (
                            <React.Fragment key={loc}>
                              <br /><span style={{ color: '#64748b', fontSize: 10, fontStyle: 'italic' }}>  {loc}</span>
                              {list.map(eq => (
                                <span key={eq.id} style={{ display: 'block', fontSize: 11, color: '#1e293b', paddingLeft: 14 }}>
                                  {eq.type === 'SWITCH_L3' ? '🖧' : eq.type === 'SWITCH_L2' ? '🖄' : eq.type === 'ROUTEUR' ? '📡' : eq.type === 'FIREWALL' ? '🛡' : '🔌'} {eq.nom}
                                </span>
                              ))}
                            </React.Fragment>
                          ))}
                        </>
                      );
                    })()}
                    <br /><span style={{ color: '#64748b', fontSize: 11 }}>Clic pour déplacer</span>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </LayerGroup>

      </MapContainer>
    </div>
  );
};

export default NetworkMap;
