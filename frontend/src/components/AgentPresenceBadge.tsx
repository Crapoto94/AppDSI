// ─── Pastille de présence d'un agent (RH Studio) ───────────────────────────
// À afficher à côté de chaque nom/email d'agent affiché dans DSI Hub.
// ⭐ présent confirmé · ❌ parti · ⏳ pas encore arrivé · ❓ inconnu de RH Studio
// Recherche par email d'abord, puis par nom/prénom en repli si l'email ne
// donne rien. Résultats mis en cache en mémoire (session) + dédoublonnage
// des requêtes concurrentes, sur le modèle de UserHoverCard. Logique pure
// (cache, classify…) dans utils/agentPresence.ts pour être réutilisable
// ailleurs (ex. BoitesPartagees.tsx) sans casser react-refresh.
import React, { useEffect, useState } from 'react';
import { Star, UserX, Hourglass, HelpCircle } from 'lucide-react';
import { classify, loadPresence, presenceCache, presenceKey, type PresenceAgent, type PresenceInfo, type PresenceStatus } from '../utils/agentPresence';

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
    if (presenceCache.has(key)) {
      setInfo(presenceCache.get(key)!);
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
