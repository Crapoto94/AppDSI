import React, { useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { NetworkLink, Duct, SiteRef } from './types';
import { linkStyle } from './utils';

const CITY_CENTER: [number, number] = [48.8129, 2.3838];

// Résout la polyligne [ [lat,lng], … ] d'un lien : géométrie stockée sinon coords des sites.
function linkLatLngs(link: NetworkLink, sites: Map<string, SiteRef>): [number, number][] | null {
  if (link.geometry && Array.isArray(link.geometry.coordinates) && link.geometry.coordinates.length >= 2) {
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
  if (duct.geometry && Array.isArray(duct.geometry.coordinates) && duct.geometry.coordinates.length >= 2) {
    return duct.geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
  }
  return null;
}

// Capture des clics + déplacements souris en mode tracé manuel.
const DrawHandler: React.FC<{
  active: boolean;
  onClick: (lat: number, lng: number) => void;
  onMove: (lat: number, lng: number) => void;
}> = ({ active, onClick, onMove }) => {
  useMapEvents({
    click(e) { if (active) onClick(e.latlng.lat, e.latlng.lng); },
    mousemove(e) { if (active) onMove(e.latlng.lat, e.latlng.lng); },
  });
  return null;
};

interface Props {
  sites: Map<string, SiteRef>;
  links: NetworkLink[];
  ducts: Duct[];
  layers: { fibre: boolean; wan: boolean; operator: boolean; ducts: boolean; sites: boolean };
  drawMode: boolean;
  drawnPoints: [number, number][];
  onMapClick: (lat: number, lng: number) => void;
  highlightSites?: string[];
}

const NetworkMap: React.FC<Props> = ({ sites, links, ducts, layers, drawMode, drawnPoints, onMapClick, highlightSites = [] }) => {
  const [cursor, setCursor] = useState<[number, number] | null>(null);

  // Sites référencés par au moins un lien (pour ne pas afficher les 874 marqueurs).
  const referenced = new Set<string>();
  links.forEach(l => { referenced.add(l.site_a); referenced.add(l.site_b); });
  highlightSites.forEach(s => referenced.add(s));

  // Point d'ancrage de l'élastique = dernier point tracé (le 1er est le site A).
  const anchor = drawnPoints.length > 0 ? drawnPoints[drawnPoints.length - 1] : null;

  const layerOn = (link: NetworkLink) =>
    (link.type === 'FIBRE' && layers.fibre) ||
    (link.type === 'WAN' && layers.wan) ||
    (link.type === 'OPERATEUR' && layers.operator);

  return (
    <MapContainer center={CITY_CENTER} zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <DrawHandler active={drawMode} onClick={onMapClick} onMove={(la, ln) => setCursor([la, ln])} />

      {/* Liens */}
      {links.filter(layerOn).map(link => {
        const pts = linkLatLngs(link, sites);
        if (!pts) return null;
        const st = linkStyle(link);
        return (
          <Polyline key={link.id} positions={pts} pathOptions={{ color: st.color, weight: st.weight, dashArray: st.dashArray }}>
            <Tooltip sticky>
              <strong>{link.site_a} → {link.site_b}</strong><br />
              {link.type}{link.operator ? ` · ${link.operator}` : ''}{link.capacity ? ` · ${link.capacity}` : ''}
              {link.is_loop ? ' · boucle' : ''}{link.is_redundant ? ' · redondant' : ''}
            </Tooltip>
          </Polyline>
        );
      })}

      {/* Fourreaux (couche indépendante) */}
      {layers.ducts && ducts.map(duct => {
        const pts = ductLatLngs(duct);
        if (!pts) return null;
        return (
          <Polyline key={duct.id} positions={pts} pathOptions={{ color: '#92400e', weight: 5, dashArray: '2 8', opacity: 0.7 }}>
            <Tooltip sticky>{duct.name} · {duct.status} · {duct.used_capacity}/{duct.capacity}</Tooltip>
          </Polyline>
        );
      })}

      {/* Tracé manuel en cours (le 1er point est le site A) */}
      {drawMode && drawnPoints.length > 0 && (
        <Polyline positions={drawnPoints} pathOptions={{ color: '#0ea5e9', weight: 3, dashArray: '4 4' }} />
      )}
      {/* Élastique : du dernier point (ou site A) jusqu'à la position de la souris */}
      {drawMode && anchor && cursor && (
        <Polyline positions={[anchor, cursor]} pathOptions={{ color: '#0ea5e9', weight: 2, dashArray: '2 6', opacity: 0.8 }} />
      )}

      {/* Marqueurs sites : référencés (si couche active) + toujours les sites sélectionnés */}
      {Array.from(referenced).map(code => {
        const s = sites.get(code);
        if (!s || s.lat == null || s.lng == null) return null;
        const isHl = highlightSites.includes(code);
        if (!layers.sites && !isHl) return null; // hors couche : seuls les sites sélectionnés restent visibles
        const isCore = code === 'S001' || code === 'S064';
        return (
          <CircleMarker
            key={code}
            center={[s.lat, s.lng]}
            radius={isCore ? 8 : 6}
            pathOptions={{ color: isHl ? '#dc2626' : (isCore ? '#0f172a' : '#2563eb'), fillColor: isHl ? '#fecaca' : '#fff', fillOpacity: 1, weight: 2 }}
          >
            <Tooltip>{code} — {s.nom}</Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
};

export default NetworkMap;
