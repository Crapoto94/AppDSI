import React, { useState } from 'react';
import {
  MapContainer, TileLayer, Polyline, CircleMarker, Marker,
  Tooltip, Popup, useMapEvents, LayerGroup,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { NetworkLink, Duct, SiteRef } from './types';
import { linkStyle } from './utils';

// ── Constantes ──────────────────────────────────────────────────────
const CITY_CENTER: [number, number] = [48.8130, 2.3890];

// Importance des sites réseau (pour dimensionner le marqueur)
const CORE_SITES = new Set(['S001', 'S001B01', 'S064', 'S064B01']); // Cœur
const IRF_NORD = new Set(['S001B02','S004B01','S005B01','S022B01']); // Boucle Nord
const IRF_SUD  = new Set(['S007B01','S045B01','S002B01','S002B02']); // Boucle Sud

function siteImportance(code: string): 'core' | 'irf' | 'normal' {
  if (CORE_SITES.has(code)) return 'core';
  if (IRF_NORD.has(code) || IRF_SUD.has(code)) return 'irf';
  return 'normal';
}

// Couleur d'un marqueur selon son rôle réseau
function siteColor(code: string, isHighlighted: boolean): { fill: string; stroke: string } {
  if (isHighlighted) return { fill: '#fecaca', stroke: '#dc2626' };
  const imp = siteImportance(code);
  if (imp === 'core') return { fill: '#0f172a', stroke: '#0f172a' };
  if (IRF_NORD.has(code)) return { fill: '#2563eb', stroke: '#1d4ed8' };
  if (IRF_SUD.has(code))  return { fill: '#16a34a', stroke: '#15803d' };
  return { fill: '#fff', stroke: '#64748b' };
}

function siteRadius(code: string): number {
  const imp = siteImportance(code);
  if (imp === 'core') return 11;
  if (imp === 'irf')  return 8;
  return 5;
}

// ── Résolution des positions ─────────────────────────────────────────
function linkLatLngs(link: NetworkLink, sites: Map<string, SiteRef>): [number, number][] | null {
  if (link.geometry?.coordinates?.length >= 2) {
    return link.geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
  }
  const a = sites.get(link.site_a);
  const b = sites.get(link.site_b);
  if (a?.lat != null && a?.lng != null && b?.lat != null && b?.lng != null) {
    return [[a.lat, a.lng], [b.lat, b.lng]];
  }
  return null;
}

function ductLatLngs(duct: Duct): [number, number][] | null {
  if (duct.geometry?.coordinates?.length >= 2) {
    return duct.geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
  }
  return null;
}

// ── Légende ──────────────────────────────────────────────────────────
const Legend: React.FC = () => (
  <div style={{
    position: 'absolute', bottom: 28, left: 12, zIndex: 1000,
    background: 'white', borderRadius: 10, padding: '10px 14px',
    boxShadow: '0 2px 12px rgba(0,0,0,.15)', fontSize: 12, minWidth: 180,
  }}>
    <div style={{ fontWeight: 700, marginBottom: 8, color: '#0f172a' }}>Légende</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {[
        ['─────', '#0f172a', 7,  'Fibre 40G (DAC)'],
        ['─────', '#16a34a', 4,  'Fibre 10G (IRF)'],
        ['─────', '#16a34a', 2,  'Fibre 1G'],
        ['- - -', '#f97316', 3,  'Opérateur LINKT'],
        ['- - -', '#ef4444', 3,  'Opérateur RED'],
        ['· · ·', '#f59e0b', 2,  'Laser 100Mb'],
        ['- · -', '#3b82f6', 3,  'WAN'],
      ].map(([dash, color, , label]) => (
        <div key={label as string} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: color as string, fontFamily: 'monospace', fontWeight: 700, fontSize: 14, width: 30 }}>{dash}</span>
          <span style={{ color: '#374151' }}>{label}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 4, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          ['●', '#0f172a', 'Cœur (HP5940)'],
          ['●', '#2563eb', 'IRF Boucle Nord'],
          ['●', '#16a34a', 'IRF Boucle Sud'],
          ['○', '#64748b', 'Site dépendant'],
        ].map(([sym, color, label]) => (
          <div key={label as string} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: color as string, fontSize: 16, lineHeight: 1 }}>{sym}</span>
            <span style={{ color: '#374151' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ── DrawHandler ───────────────────────────────────────────────────────
const DrawHandler: React.FC<{
  active: boolean;
  onClick: (lat: number, lng: number) => void;
  onMove:  (lat: number, lng: number) => void;
}> = ({ active, onClick, onMove }) => {
  useMapEvents({
    click(e)     { if (active) onClick(e.latlng.lat, e.latlng.lng); },
    mousemove(e) { if (active) onMove(e.latlng.lat,  e.latlng.lng); },
  });
  return null;
};

// ── Props ─────────────────────────────────────────────────────────────
interface Props {
  sites:    Map<string, SiteRef>;
  links:    NetworkLink[];
  ducts:    Duct[];
  layers:   { fibre: boolean; wan: boolean; operator: boolean; ducts: boolean; sites: boolean };
  drawMode: boolean;
  drawnPoints:  [number, number][];
  onMapClick:   (lat: number, lng: number) => void;
  highlightSites?: string[];
}

// ── Composant ─────────────────────────────────────────────────────────
const NetworkMap: React.FC<Props> = ({
  sites, links, ducts, layers, drawMode, drawnPoints, onMapClick, highlightSites = [],
}) => {
  const [cursor, setCursor] = useState<[number, number] | null>(null);

  // Sites référencés par au moins un lien + sites sélectionnés dans le formulaire
  const referenced = new Set<string>();
  links.forEach(l => { referenced.add(l.site_a); referenced.add(l.site_b); });
  highlightSites.forEach(s => { if (s) referenced.add(s); });

  // Afficher tous les sites géolocalisés si la couche sites est active
  const siteEntries = layers.sites
    ? Array.from(sites.values()).filter(s => s.lat != null && s.lng != null)
    : Array.from(referenced)
        .map(c => sites.get(c))
        .filter((s): s is SiteRef => !!s && s.lat != null && s.lng != null);

  // Filtre par type pour les liens
  const layerOn = (link: NetworkLink) =>
    (link.type === 'FIBRE'    && layers.fibre)    ||
    (link.type === 'LASER'    && layers.fibre)     || // Laser avec couche fibre
    (link.type === 'WAN'      && layers.wan)        ||
    (link.type === 'OPERATEUR'&& layers.operator);

  const anchor = drawnPoints.length > 0 ? drawnPoints[drawnPoints.length - 1] : null;

  return (
    <MapContainer
      center={CITY_CENTER}
      zoom={14}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <DrawHandler
        active={drawMode}
        onClick={onMapClick}
        onMove={(la, ln) => setCursor([la, ln])}
      />

      {/* ── Fourreaux ── */}
      {layers.ducts && (
        <LayerGroup>
          {ducts.map(duct => {
            const pts = ductLatLngs(duct);
            if (!pts) return null;
            return (
              <Polyline key={duct.id} positions={pts}
                pathOptions={{ color: '#92400e', weight: 6, dashArray: '2 8', opacity: 0.5 }}>
                <Tooltip sticky>
                  <strong>Fourreau :</strong> {duct.name}<br />
                  {duct.status} · {duct.used_capacity}/{duct.capacity} paires
                </Tooltip>
              </Polyline>
            );
          })}
        </LayerGroup>
      )}

      {/* ── Liens réseau ── */}
      <LayerGroup>
        {links.filter(layerOn).map(link => {
          const pts = linkLatLngs(link, sites);
          if (!pts) return null;
          const st = linkStyle(link);
          const siteA = sites.get(link.site_a);
          const siteB = sites.get(link.site_b);
          return (
            <Polyline
              key={link.id}
              positions={pts}
              pathOptions={{ color: st.color, weight: st.weight, dashArray: st.dashArray, opacity: 0.9 }}
            >
              <Tooltip sticky>
                <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 13, lineHeight: 1.5 }}>
                  <strong style={{ color: st.color }}>
                    {link.type}{link.operator ? ` · ${link.operator}` : ''}
                    {link.capacity ? ` · ${link.capacity}` : ''}
                  </strong><br />
                  <span>{siteA?.nom || link.site_a}</span><br />
                  <span>↕</span><br />
                  <span>{siteB?.nom || link.site_b}</span>
                  {link.fo_pairs && <><br /><small>Paires : {link.fo_pairs}</small></>}
                  {link.bag_id   && <><br /><small>Agrégat : {link.bag_id}</small></>}
                  {link.is_loop  && <><br /><span style={{ color: '#16a34a' }}>● Boucle IRF</span></>}
                  {link.is_redundant && <><br /><span style={{ color: '#8b5cf6' }}>● Lien redondant</span></>}
                  {link.notes && <><br /><small style={{ color: '#64748b' }}>{link.notes}</small></>}
                </div>
              </Tooltip>
            </Polyline>
          );
        })}
      </LayerGroup>

      {/* ── Tracé manuel en cours ── */}
      {drawMode && drawnPoints.length > 0 && (
        <Polyline positions={drawnPoints}
          pathOptions={{ color: '#0ea5e9', weight: 3, dashArray: '4 4' }} />
      )}
      {drawMode && anchor && cursor && (
        <Polyline positions={[anchor, cursor]}
          pathOptions={{ color: '#0ea5e9', weight: 2, dashArray: '2 6', opacity: 0.7 }} />
      )}

      {/* ── Marqueurs sites ── */}
      <LayerGroup>
        {siteEntries.map(s => {
          const isHl  = highlightSites.includes(s.site_code);
          const isRef = referenced.has(s.site_code);
          const imp   = siteImportance(s.site_code);
          const c     = siteColor(s.site_code, isHl);
          const r     = siteRadius(s.site_code);
          // Sites non-référencés : petits points gris semi-transparents
          if (!isRef && !layers.sites) return null;

          return (
            <CircleMarker
              key={s.site_code}
              center={[s.lat!, s.lng!]}
              radius={r}
              pathOptions={{
                color:        isRef || imp !== 'normal' ? c.stroke : '#94a3b8',
                fillColor:    isRef || imp !== 'normal' ? c.fill   : '#cbd5e1',
                fillOpacity:  isRef || imp !== 'normal' ? 1 : 0.5,
                weight:       imp === 'core' ? 3 : 2,
              }}
            >
              <Tooltip permanent={imp === 'core'} direction="top" offset={[0, -r]}>
                <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 12, lineHeight: 1.4 }}>
                  <strong>{s.site_code}</strong><br />
                  {s.nom}
                  {imp === 'core' && <><br /><span style={{ color: '#2563eb', fontWeight: 600 }}>⬡ Cœur IRF</span></>}
                  {IRF_NORD.has(s.site_code) && <><br /><span style={{ color: '#2563eb' }}>⬢ Boucle Nord</span></>}
                  {IRF_SUD.has(s.site_code)  && <><br /><span style={{ color: '#16a34a' }}>⬢ Boucle Sud</span></>}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </LayerGroup>

      {/* ── Légende ── */}
      <Legend />
    </MapContainer>
  );
};

export default NetworkMap;
