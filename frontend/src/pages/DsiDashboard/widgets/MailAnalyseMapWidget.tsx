import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

/**
 * Widget « Carte des connexions » alimenté par l'application Analyse-mail
 * (via le relais /api/analyse-mail/kpis — la clé d'API reste côté serveur).
 * Reprend les deux cartes du tableau de bord Analyse-mail (monde + pays de
 * référence) avec les animations de marqueurs : halo pulsant pour une
 * connexion normale, clignotement pour un lieu suspect, point fixe réduit
 * lorsqu'un administrateur l'a acquitté.
 */

interface GeoPoint {
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
  home_country_code?: string;
}

const REFRESH_MS = 5 * 60 * 1000;

function buildMarkerIcon(p: GeoPoint): L.DivIcon {
  const acked = !!p.is_acknowledged;
  const coreSize = acked
    ? Math.max(6, Math.min(16, 4 + Math.sqrt(p.count) * 2.2))
    : Math.max(8, Math.min(28, 6 + Math.sqrt(p.count) * 4));
  const ringSize = acked ? coreSize : coreSize * 3.2;
  const color = p.is_suspicious ? '#ff3b3b' : (p.fail_count > 0 ? '#fd9e02' : '#39ff88');
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

function ConnexionsMap({ points, center, zoom }: { points: GeoPoint[]; center: [number, number]; zoom: number }) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      attributionControl={false}
      scrollWheelZoom
      style={{ height: '100%', width: '100%', background: '#05070c' }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
        opacity={0.85}
      />
      {points.map((p, i) => (
        <Marker key={`${p.city}|${p.country_code}|${i}`} position={[p.lat, p.lon] as [number, number]} icon={buildMarkerIcon(p)}>
          <Popup><PointPopup p={p} /></Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

const mapLabelStyle: React.CSSProperties = {
  position: 'absolute', top: 6, left: 8, zIndex: 500,
  background: 'rgba(0,0,0,.55)', color: '#cbd5e1', fontSize: 10,
  padding: '1px 6px', borderRadius: 4, pointerEvents: 'none',
};

export default function MailAnalyseMapWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<Kpis | null>(null);

  const load = useCallback(() => {
    return axios.get('/api/analyse-mail/kpis', { headers: { Authorization: `Bearer ${token}` } })
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
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const world = data?.connections_geo_world || [];
  const home = data?.connections_geo_home || [];
  const homeCode = data?.home_country_code || 'FR';
  const hours = data?.signins_window_hours ?? 24;

  return (
    <WidgetWrapper title={`Connexions suspectes — ${hours}h`} loading={loading} error={error}>
      <style>{`
        .mailmap-marker { position: relative; }
        .mailmap-core { position: absolute; top: 50%; left: 50%; border-radius: 50%; transform: translate(-50%, -50%); }
        .mailmap-ring { position: absolute; top: 50%; left: 50%; border-radius: 50%; transform: translate(-50%, -50%); animation: mailmap-ring 2.2s ease-out infinite; }
        @keyframes mailmap-ring { 0% { width: var(--mail-core); height: var(--mail-core); opacity: .75; } 100% { width: var(--mail-ring); height: var(--mail-ring); opacity: 0; } }
        .mailmap-marker.mailmap-suspicious .mailmap-core { animation: mailmap-blink .9s steps(1) infinite; }
        @keyframes mailmap-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: .15; } }
        .mailmap-marker.mailmap-acked .mailmap-ring { display: none; }
        .mailmap-marker.mailmap-acked .mailmap-core { animation: none; opacity: 1; }
      `}</style>
      {world.length === 0 && home.length === 0 ? (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
          Aucune connexion géolocalisable sur la fenêtre en cours.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', minHeight: 0 }}>
          <div className="mailmap-pane" style={{ flex: 1, minHeight: 0, position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
            <span style={mapLabelStyle}>Monde</span>
            <ConnexionsMap points={world} center={[20, 0]} zoom={2} />
          </div>
          <div className="mailmap-pane" style={{ flex: 1, minHeight: 0, position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
            <span style={mapLabelStyle}>{homeCode}</span>
            <ConnexionsMap points={home} center={[46.6, 2.2]} zoom={5} />
          </div>
        </div>
      )}
    </WidgetWrapper>
  );
}
