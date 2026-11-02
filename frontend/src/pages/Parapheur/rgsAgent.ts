// Signature avec une clé matérielle RGS** via l'agent local du poste (voir /signature-agent).
// Le navigateur sert de relais : le serveur pose des « défis » (empreintes SHA-256), l'agent les fait signer par la
// clé (confirmation à l'écran + code PIN), et le navigateur renvoie les signatures au serveur.

export const AGENT_URL = 'http://127.0.0.1:47821';

export interface AgentCertificate {
  thumbprint: string;
  subject: string;
  issuer: string;
  notAfter: string;
  nonRepudiation: boolean;
  certificate: string; // DER en base64
  chain: string[];
}

async function agentFetch(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${AGENT_URL}${path}`, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** true si l'agent répond sur ce poste (et accepte l'origine de cette page). */
export async function detectAgent(): Promise<boolean> {
  try {
    const r = await agentFetch('/status', {}, 2500);
    return r.ok;
  } catch {
    return false;
  }
}

export async function listCertificates(): Promise<AgentCertificate[]> {
  const r = await agentFetch('/certificates', {}, 30000);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Agent : erreur ${r.status}`);
  return d.certificates || [];
}

/** Fait signer une empreinte SHA-256 (base64) par la clé ; échoue si l'utilisateur refuse. */
async function signHash(thumbprint: string, hash: string, label: string): Promise<{ signature: string; timings?: Record<string, number> }> {
  const r = await agentFetch('/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thumbprint, hash, label }),
  }, 5 * 60 * 1000 + 15000);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Agent : erreur ${r.status}`);
  if (d.cancelled) throw new Error("Signature refusée sur le poste.");
  return { signature: d.signature as string, timings: d.timings };
}

/** Nom courant (CN) d'un sujet X.509 « CN=MARC CHEVALIER, O=… ». */
export function commonName(subject: string): string {
  const m = subject.match(/(?:^|,\s*)CN=([^,]+)/i);
  return (m ? m[1] : subject).trim();
}

type Result = { message?: string; done?: boolean; next?: unknown };

/**
 * Relaie à l'agent les « défis » d'une opération de signature côté serveur (signature d'un parapheur, ou test de la
 * clé en administration) jusqu'à sa fin. `base` : racine des routes (…/rgs ou …/rgs-test) ; `startBody` : corps de la
 * demande de démarrage ; `headers` : authentification ; `onStatus` : message d'avancement affiché à l'utilisateur.
 * Renvoie le résultat de l'opération.
 */
export async function driveHardwareKeyJob<T = Result>(
  base: string,
  headers: Record<string, string>,
  startBody: Record<string, unknown>,
  cert: AgentCertificate,
  onStatus: (message: string) => void,
): Promise<T> {
  const json = { 'Content-Type': 'application/json', ...headers };
  const readJson = async (r: Response) => { try { return await r.json(); } catch { return {}; } };

  onStatus('Préparation de la signature…');
  const startRes = await fetch(`${base}/start`, { method: 'POST', headers: json, body: JSON.stringify({ ...startBody, certificate: cert.certificate, chain: cert.chain }) });
  const start = await readJson(startRes);
  if (!startRes.ok) throw new Error(start.message || `Signature impossible (${startRes.status})`);

  for (;;) {
    const pollRes = await fetch(`${base}/${start.jobId}`, { headers });
    const ev = await readJson(pollRes);
    if (!pollRes.ok) throw new Error(ev.message || `Suivi de la signature impossible (${pollRes.status})`);
    if (ev.state === 'done') return ev.result as T;
    if (ev.state === 'error') throw new Error(ev.message || 'Signature impossible');
    if (ev.state !== 'challenge') continue; // « wait » : on réinterroge

    onStatus(`Confirmez la signature de « ${ev.label} » dans la fenêtre Windows, puis saisissez le code PIN de votre clé…`);
    let answer: Record<string, unknown>;
    try {
      const r = await signHash(cert.thumbprint, ev.hash, ev.label);
      answer = { challengeId: ev.challengeId, signature: r.signature, timings: r.timings };
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Signature impossible';
      answer = { challengeId: ev.challengeId, error: m.includes('Failed to fetch') ? "Agent de signature injoignable." : m };
    }
    const ansRes = await fetch(`${base}/${start.jobId}/answer`, { method: 'POST', headers: json, body: JSON.stringify(answer) });
    if (!ansRes.ok) throw new Error((await readJson(ansRes)).message || `Réponse refusée (${ansRes.status})`);
    onStatus("Signature en cours d'enregistrement…");
  }
}

/** Signature d'un parapheur avec la clé (lien de signature `token`). */
export function signWithHardwareKey(
  token: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  cert: AgentCertificate,
  onStatus: (message: string) => void,
): Promise<Result> {
  return driveHardwareKeyJob<Result>(`/api/parapheur/public/${token}/rgs`, headers, body, cert, onStatus);
}
