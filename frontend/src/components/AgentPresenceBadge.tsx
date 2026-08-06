// ─── Pastille de présence d'un agent (RH Studio) ───────────────────────────
// À afficher à côté de chaque nom/email d'agent affiché dans DSI Hub.
// ⭐ présent confirmé · ❌ parti · ⏳ pas encore arrivé · ❓ inconnu de RH Studio
// Recherche par email d'abord, puis par nom/prénom en repli si l'email ne
// donne rien. Résultats mis en cache en mémoire (session) + dédoublonnage
// des requêtes concurrentes, sur le modèle de UserHoverCard.
import React, { useEffect, useState } from 'react';
import { Star, UserX, Hourglass, HelpCircle } from 'lucide-react';

interface PresenceAgent {
  nom?: string;
  prenom?: string;
  present?: boolean;
  status?: string;
  statusLabel?: string;
  dateArriveePrevue?: string | null;
  dateDepart?: string | null;
}

interface PresenceInfo {
  found: boolean;
  agent?: PresenceAgent;
}

type PresenceStatus = 'present' | 'departed' | 'not_arrived' | 'unknown';

const cache = new Map<string, PresenceInfo>();
const inflight = new Map<string, Promise<PresenceInfo>>();

const presenceKey = (email?: string | null, name?: string | null) =>
  `${(email || '').trim().toLowerCase()}|${(name || '').trim().toLowerCase()}`;

async function queryPresence(params: URLSearchParams): Promise<PresenceInfo | null> {
  const token = localStorage.getItem('token');
  try {
    const response = await fetch(`/api/infra/agents/presence?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function loadPresence(email?: string | null, name?: string | null): Promise<PresenceInfo> {
  const key = presenceKey(email, name);
  if (cache.has(key)) return Promise.resolve(cache.get(key)!);
  if (!inflight.has(key)) {
    const trimmedEmail = email?.trim();
    const trimmedName = name?.trim();
    const p = (async () => {
      if (trimmedEmail) {
        const byEmail = await queryPresence(new URLSearchParams({ email: trimmedEmail }));
        if (byEmail?.found) return byEmail;
      }
      if (trimmedName) {
        const byName = await queryPresence(new URLSearchParams({ q: trimmedName }));
        if (byName?.found) return byName;
      }
      return { found: false };
    })()
      .then((result) => { cache.set(key, result); return result; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return inflight.get(key)!;
}

function classify(info: PresenceInfo | null): PresenceStatus {
  if (!info || !info.found || !info.agent) return 'unknown';
  const { agent } = info;
  if (agent.present) return 'present';

  const s = `${agent.status || ''} ${agent.statusLabel || ''}`.toLowerCase();
  if (s.includes('parti') || s.includes('depart') || s.includes('sorti')) return 'departed';
  if (s.includes('arriv') || s.includes('venir') || s.includes('attendu')) return 'not_arrived';

  const now = Date.now();
  if (agent.dateArriveePrevue && new Date(agent.dateArriveePrevue).getTime() > now) return 'not_arrived';
  if (agent.dateDepart && new Date(agent.dateDepart).getTime() < now) return 'departed';
  return 'departed';
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR');
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
}

// Nom tel que renvoyé par l'API RH Studio (source de vérité) — affiché dans
// l'infobulle sous la forme "Prénom NOM" pour que les faux matches sautent aux yeux.
function formatAgentName(agent?: PresenceAgent): string | null {
  if (!agent?.nom && !agent?.prenom) return null;
  const prenom = agent.prenom ? titleCase(agent.prenom) : '';
  const nom = agent.nom ? agent.nom.toUpperCase() : '';
  return [prenom, nom].filter(Boolean).join(' ');
}

function buildTooltip(status: PresenceStatus, info: PresenceInfo | null): string {
  const agent = info?.agent;
  const displayName = formatAgentName(agent);
  switch (status) {
    case 'present':
      return displayName ? `${displayName} est présent·e` : (agent?.statusLabel || 'Agent présent');
    case 'departed': {
      const date = formatDate(agent?.dateDepart);
      const base = displayName ? `${displayName} est parti·e` : (agent?.statusLabel || 'Agent parti');
      return date ? `${base} le ${date}` : base;
    }
    case 'not_arrived': {
      const date = formatDate(agent?.dateArriveePrevue);
      const base = displayName ? `${displayName} n'est pas encore arrivé·e` : (agent?.statusLabel || 'Agent pas encore arrivé');
      return date ? `${base} — arrivée prévue le ${date}` : base;
    }
    default:
      return 'Agent inconnu de RH Studio';
  }
}

interface Props {
  email?: string | null;
  name?: string | null;
  size?: number;
  style?: React.CSSProperties;
}

export default function AgentPresenceBadge({ email, name, size = 13, style }: Props) {
  const [info, setInfo] = useState<PresenceInfo | null>(null);
  const key = presenceKey(email, name);

  useEffect(() => {
    if (!email && !name) { setInfo(null); return; }
    let cancelled = false;
    if (cache.has(key)) {
      setInfo(cache.get(key)!);
    } else {
      loadPresence(email, name).then((result) => { if (!cancelled) setInfo(result); });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!email && !name) return null;

  const status = classify(info);
  const title = buildTooltip(status, info);

  let icon: React.ReactNode;
  switch (status) {
    case 'present':
      icon = <Star size={size} fill="currentColor" style={{ color: '#f59e0b' }} />;
      break;
    case 'departed':
      icon = <UserX size={size} style={{ color: '#e11d48' }} />;
      break;
    case 'not_arrived':
      icon = <Hourglass size={size} style={{ color: '#2563eb' }} />;
      break;
    default:
      icon = <HelpCircle size={size} style={{ color: '#94a3b8' }} />;
  }

  return (
    <span
      className={`agent-presence-badge agent-presence-${status === 'not_arrived' ? 'not-arrived' : status}`}
      title={title}
      style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0, cursor: 'help', ...style }}
    >
      {icon}
    </span>
  );
}
