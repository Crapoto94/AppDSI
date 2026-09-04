// ─── Présence agent (RH Studio) — logique partagée ─────────────────────────
// Extrait de AgentPresenceBadge.tsx (composant) pour que les fonctions pures
// et le cache soient importables ailleurs (ex. BoitesPartagees.tsx, comptage
// en masse) sans déclencher react-refresh/only-export-components.
export interface PresenceAgent {
  nom?: string;
  prenom?: string;
  present?: boolean;
  status?: string;
  statusLabel?: string;
  dateArriveePrevue?: string | null;
  dateDepart?: string | null;
}

export interface PresenceInfo {
  found: boolean;
  agent?: PresenceAgent;
}

export type PresenceStatus = 'present' | 'departed' | 'not_arrived' | 'unknown';

export const presenceCache = new Map<string, PresenceInfo>();
const inflight = new Map<string, Promise<PresenceInfo>>();

export const presenceKey = (email?: string | null, name?: string | null) =>
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

export function loadPresence(email?: string | null, name?: string | null): Promise<PresenceInfo> {
  const key = presenceKey(email, name);
  if (presenceCache.has(key)) return Promise.resolve(presenceCache.get(key)!);
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
      .then((result) => { presenceCache.set(key, result); return result; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return inflight.get(key)!;
}

export function classify(info: PresenceInfo | null): PresenceStatus {
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
