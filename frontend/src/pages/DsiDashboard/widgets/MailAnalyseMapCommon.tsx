import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { WINDOW_OPTIONS, DEFAULT_WINDOW_MINUTES, windowLabel } from './analyseMailWindows';

/**
 * Carte « connexions suspectes » alimentée par l'application Analyse-mail (via le
 * relais /api/analyse-mail/kpis — la clé d'API reste côté serveur).
 *
 * Deux déclinaisons : une carte monde et une carte du pays de référence (France),
 * chacune étant un widget distinct avec son propre sélecteur de durée (fenêtre
 * glissante transmise à l'API amont via ?minutes=). Fond de carte OpenStreetMap
 * (libre, sans clé) assombri par filtre CSS pour rester lisible sur le thème.
 */

export interface GeoPoint {
  city: string;
  country: string;
  country_code: string;
  count: number;
  fail_count: number;
  trust_score: number;
  is_suspicious: boolean;
  is_acknowledged?: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  lat: number;
  lon: number;
}

interface Kpis {
  connections_geo_world?: GeoPoint[];
  connections_geo_home?: GeoPoint[];
  signins_window_hours?: number;
  signins_window_minutes?: number;
  home_country_code?: string;
}

export interface MapWidgetProps {
  config?: { window_minutes?: number; zoom?: number; center?: { lat: number; lon: number } } | null;
  onConfigChange?: (patch: Record<string, unknown>) => void;
}

const REFRESH_MS = 5 * 60 * 1000;

function buildMarkerIcon(p: GeoPoint): L.DivIcon {
  const acked = !!p.is_acknowledged;
  const coreSize = acked
    ? Math.max(6, Math.min(16, 4 + Math.sqrt(p.count) * 2.2))
    : Math.max(8, Math.min(28, 6 + Math.sqrt(p.count) * 4));
  const ringSize = acked ? coreSize : coreSize * 3.2;
  const color = p.is_suspicious ? '#ff3b3b' : (p.trust_score > 65 ? '#fd9e02' : '#39ff88');
  const cls = 'mailmap-marker' + (p.is_suspicious ? ' mailmap-suspicious' : '') + (acked ? ' mailmap-acked' : '');
  const side = acked ? coreSize : ringSize;
  const html =
    `<div class="${cls}" style="--mail-core:${coreSize}px; --mail-ring:${ringSize}px; width:${side}px; height:${side}px;">` +
    (acked ? '' : `<div class="mailmap-ring" style="width:${coreSize}px; height:${coreSize}px; border:2px solid ${color};"></div>`) +
    `<div class="mailmap-core" style="width:${coreSize}px; height:${coreSize}px; background:${color}; box-shadow:0 0 ${Math.round(coreSize / 1.5)}px ${color};"></div>` +
    `</div>`;
  return L.divIcon({ html, className: '', iconSize: [side, side] });
}

function PointPopup({ p }: { p: GeoPoint }) {
  const when = p.acknowledged_at ? String(p.acknowledged_at).replace('T', ' ').slice(0, 19) : '';
  return (
    <div style={{ fontSize: 12 }}>
      <strong>{p.city || p.country || 'Lieu inconnu'}</strong>
      {p.city && p.country ? `, ${p.country}` : ''}<br />
      {p.count} connexion(s), {p.fail_count} échec(s)<br />
      Confiance : {p.trust_score}%
      {p.is_suspicious && (
        p.is_acknowledged
          ? <><br /><span style={{ color: '#198754', fontWeight: 600 }}>vérifié par {p.acknowledged_by || '?'}{when ? ` — ${when} UTC` : ''}</span></>
          : <><br /><span style={{ color: '#ff3b3b', fontWeight: 600 }}>à examiner</span></>
      )}
    </div>
  );
}

function ViewTracker({ initialZoom, initialCenter, onZoom, onCenter }: {
  initialZoom: number;
  initialCenter: [number, number];
  onZoom: (z: number) => void;
  onCenter: (c: { lat: number; lon: number }) => void;
}) {
  // Ignore les événements initiaux (setView de montage) : sinon la carte se marquerait
  // "modifiée" et persisterait sa vue par défaut dès l'ouverture.
  const lastZoomRef = useRef(initialZoom);
  const lastCenterRef = useRef(initialCenter);
  const map = useMapEvents({
    zoomend: () => {
      const z = map.getZoom();
      if (z !== lastZoomRef.current) {
        lastZoomRef.current = z;
        onZoom(z);
      }
    },
    moveend: () => {
      const c = map.getCenter();
      if (c.lat !== lastCenterRef.current[0] || c.lng !== lastCenterRef.current[1]) {
        lastCenterRef.current = [c.lat, c.lng];
        onCenter({ lat: c.lat, lon: c.lng });
      }
    },
  });
  return null;
}

function ConnexionsMap({ points, center, zoom, onZoom, onCenter }: {
  points: GeoPoint[];
  center: [number, number];
  zoom: number;
  onZoom?: (z: number) => void;
  onCenter?: (c: { lat: number; lon: number }) => void;
}) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      attributionControl={false}
      scrollWheelZoom
      wheelPxPerZoomLevel={150}
      style={{ height: '100%', width: '100%', background: '#05070c' }}
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap'
        className="mailmap-tiles-dark"
        opacity={0.9}
      />
      {onZoom && onCenter && (
        <ViewTracker initialZoom={zoom} initialCenter={center} onZoom={onZoom} onCenter={onCenter} />
      )}
      {points.map((p, i) => (
        <Marker key={`${p.city}|${p.country_code}|${i}`} position={[p.lat, p.lon] as [number, number]} icon={buildMarkerIcon(p)}>
          <Popup><PointPopup p={p} /></Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

const selectStyle: React.CSSProperties = {
  fontSize: 11, padding: '2px 6px', borderRadius: 6, border: '1px solid #cbd5e1',
  background: 'white', color: '#334155', cursor: 'pointer', outline: 'none',
};

interface Props extends MapWidgetProps {
  scope: 'world' | 'home';
  title: string;
  center: [number, number];
  zoom: number;
}

export default function MailAnalyseMapCard({ scope, title, center, zoom, config, onConfigChange }: Props) {
  const { token } = useAuth();
  const minutes = Number(config?.window_minutes) || DEFAULT_WINDOW_MINUTES;
  const [data, setData] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<Kpis | null>(null);

  const load = useCallback(() => {
    return axios.get('/api/analyse-mail/kpis', {
      params: { minutes },
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        dataRef.current = r.data || {};
        setData(r.data || {});
        setError(null);
      })
      .catch((e: unknown) => {
        // On ne masque pas une carte déjà affichée à cause d'un échec de rafraîchissement.
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        if (!dataRef.current) setError(msg || 'Analyse-mail injoignable');
      })
      .finally(() => setLoading(false));
  }, [token, minutes]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const homeCode = data?.home_country_code || 'FR';
  const points = scope === 'home' ? (data?.connections_geo_home || []) : (data?.connections_geo_world || []);
  const initialZoom = Number(config?.zoom) || zoom;
  const initialCenter: [number, number] =
    config?.center && Number.isFinite(config.center.lat) && Number.isFinite(config.center.lon)
      ? [config.center.lat, config.center.lon]
      : center;

  const selector = (
    <select
      value={minutes}
      onChange={e => onConfigChange?.({ window_minutes: Number(e.target.value) })}
      style={selectStyle}
      title="Durée de la fenêtre analysée"
    >
      {WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <WidgetWrapper title={`${title} — ${windowLabel(minutes)}`} loading={loading} error={error} actions={selector}>
      <style>{`
        .mailmap-tiles-dark { filter: invert(1) hue-rotate(180deg) brightness(.85) contrast(.9) saturate(.75); }
        .mailmap-marker { position: relative; }
        .mailmap-core { position: absolute; top: 50%; left: 50%; border-radius: 50%; transform: translate(-50%, -50%); }
        .mailmap-ring { position: absolute; top: 50%; left: 50%; border-radius: 50%; transform: translate(-50%, -50%); animation: mailmap-ring 2.2s ease-out infinite; }
        @keyframes mailmap-ring { 0% { width: var(--mail-core); height: var(--mail-core); opacity: .75; } 100% { width: var(--mail-ring); height: var(--mail-ring); opacity: 0; } }
        .mailmap-marker.mailmap-suspicious .mailmap-core { animation: mailmap-blink .9s steps(1) infinite; }
        @keyframes mailmap-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: .15; } }
        .mailmap-marker.mailmap-acked .mailmap-ring { display: none; }
        .mailmap-marker.mailmap-acked .mailmap-core { animation: none; opacity: 1; }
      `}</style>
      <div style={{ height: '100%', minHeight: 0, position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
        <ConnexionsMap
          points={points}
          center={initialCenter}
          zoom={initialZoom}
          onZoom={z => onConfigChange?.({ zoom: z })}
          onCenter={c => onConfigChange?.({ center: c })}
        />
        {points.length === 0 && (
          <div style={{
            position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 500,
            background: 'rgba(0,0,0,.65)', color: '#cbd5e1', fontSize: 12, padding: '4px 10px',
            borderRadius: 6, pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            Aucune connexion géolocalisable{scope === 'home' ? ` (${homeCode})` : ''} sur la fenêtre en cours.
          </div>
        )}
      </div>
    </WidgetWrapper>
  );
}
