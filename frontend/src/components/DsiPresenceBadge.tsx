// ─── Pastille de présence d'un agent DSI (calendrier-dsi) ──────────────────
// À afficher à côté du nom/email d'un agent DSI (défini dans /calendrier-dsi).
// 🏠 télétravail · ❌ absent (ASA, congé prévisionnel, SEDIT, à justifier...)
// ✈️ en déplacement · ✅ présent (par défaut)
// La liste complète des statuts du jour est chargée une fois et mise en cache
// en mémoire (session, TTL 5 min), sur le modèle de AgentPresenceBadge.
import React, { useEffect, useState } from 'react';
import { Home, UserX, Plane, CircleCheck, CalendarClock } from 'lucide-react';

export interface DsiAgentStatus {
  username: string;
  nom: string;
  email: string;
  status: 'present' | 'absent' | 'teletravail' | 'deplacement';
  label: string;
  absent_until: string | null;
  soon_absent: boolean;
  soon_absent_from: string | null;
  soon_absent_until: string | null;
}

let statusCache: DsiAgentStatus[] | null = null;
let statusCacheAt = 0;
let inflightPromise: Promise<DsiAgentStatus[]> | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateDsiAgentsStatusCache() {
  statusCache = null;
  statusCacheAt = 0;
}

export async function loadDsiAgentsStatus(): Promise<DsiAgentStatus[]> {
  const now = Date.now();
  if (statusCache && now - statusCacheAt < CACHE_TTL_MS) return statusCache;
  if (inflightPromise) return inflightPromise;
  const token = localStorage.getItem('token');
  inflightPromise = fetch('/api/calendrier-dsi/agents/status', {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])
    .then((data: DsiAgentStatus[]) => {
      statusCache = Array.isArray(data) ? data : [];
      statusCacheAt = Date.now();
      inflightPromise = null;
      return statusCache;
    });
  return inflightPromise;
}

export function findDsiAgentStatus(
  list: DsiAgentStatus[],
  email?: string | null,
  name?: string | null,
  username?: string | null
): DsiAgentStatus | null {
  const un = (username || '').trim().toLowerCase();
  const em = (email || '').trim().toLowerCase();
  const nm = (name || '').trim().toLowerCase();
  if (un) {
    const byUsername = list.find((a) => a.username.toLowerCase() === un);
    if (byUsername) return byUsername;
  }
  if (em) {
    const byEmail = list.find((a) => a.email && a.email.toLowerCase() === em);
    if (byEmail) return byEmail;
  }
  if (nm) {
    const byName = list.find((a) => a.nom && a.nom.trim().toLowerCase() === nm);
    if (byName) return byName;
  }
  return null;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR');
}

export function buildDsiTooltip(agent: DsiAgentStatus): string {
  if (agent.status === 'absent') {
    const isMultiDay = !!agent.absent_until && agent.absent_until !== todayStr();
    const until = formatDate(agent.absent_until);
    return isMultiDay && until ? `Absent·e jusqu'au ${until}` : `Absent·e aujourd'hui`;
  }
  if (agent.soon_absent) {
    const from = formatDate(agent.soon_absent_from);
    const until = formatDate(agent.soon_absent_until);
    const base = 'Bientôt absent·e';
    return from && until ? `${base} : du ${from} au ${until}` : base;
  }
  switch (agent.status) {
    case 'teletravail':
      return 'En télétravail aujourd\'hui';
    case 'deplacement':
      return 'En déplacement aujourd\'hui';
    default:
      return 'Présent·e aujourd\'hui';
  }
}

// Texte court à afficher en clair (sans dépendre du survol) pour les cas
// qui méritent l'attention immédiate : absent aujourd'hui, ou bientôt absent.
export function dsiStatusCaption(agent: DsiAgentStatus | null): string | null {
  if (!agent) return null;
  if (agent.status === 'absent' || agent.soon_absent) return buildDsiTooltip(agent);
  return null;
}

export function dsiStatusCaptionColor(agent: DsiAgentStatus): string {
  return agent.status === 'absent' ? '#e11d48' : '#f97316';
}

interface Props {
  email?: string | null;
  name?: string | null;
  username?: string | null;
  size?: number;
  style?: React.CSSProperties;
  /** Affiche aussi le texte (absent / bientôt absent) en clair, sans dépendre du survol. */
  showCaption?: boolean;
}

export default function DsiPresenceBadge({ email, name, username, size = 13, style, showCaption = false }: Props) {
  const [list, setList] = useState<DsiAgentStatus[] | null>(statusCache);

  useEffect(() => {
    let cancelled = false;
    if (!statusCache) {
      loadDsiAgentsStatus().then((data) => { if (!cancelled) setList(data); });
    } else {
      setList(statusCache);
    }
    return () => { cancelled = true; };
  }, []);

  if (!email && !name && !username) return null;
  if (!list) return null;

  const agent = findDsiAgentStatus(list, email, name, username);
  if (!agent) return null;

  const isSoonAbsent = agent.status !== 'absent' && agent.soon_absent;
  const title = buildDsiTooltip(agent);

  let icon: React.ReactNode;
  if (isSoonAbsent) {
    icon = <CalendarClock size={size} style={{ color: '#f97316' }} />;
  } else {
    switch (agent.status) {
      case 'absent':
        icon = <UserX size={size} style={{ color: '#e11d48' }} />;
        break;
      case 'teletravail':
        icon = <Home size={size} style={{ color: '#2563eb' }} />;
        break;
      case 'deplacement':
        icon = <Plane size={size} style={{ color: '#f59e0b' }} />;
        break;
      default:
        icon = <CircleCheck size={size} style={{ color: '#16a34a' }} />;
    }
  }

  const statusKey = isSoonAbsent ? 'soon-absent' : agent.status;
  const caption = showCaption ? dsiStatusCaption(agent) : null;

  const badge = (
    <span
      className={`dsi-presence-badge dsi-presence-${statusKey}`}
      title={title}
      style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0, cursor: 'help', ...(caption ? undefined : style) }}
    >
      {icon}
    </span>
  );

  if (!caption) return badge;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...style }}>
      {badge}
      <span style={{ fontSize: 10, fontWeight: 600, color: dsiStatusCaptionColor(agent) }}>{caption}</span>
    </span>
  );
}
