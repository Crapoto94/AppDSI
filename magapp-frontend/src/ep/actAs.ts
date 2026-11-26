// « Afficher en tant que » (module Entretiens) : tant qu'une personne est choisie, les appels au module portent l'en-tête
// X-Act-As ; le serveur revérifie le droit à chaque requête. Mémorisé pour cet onglet seulement (sessionStorage).
import axios from 'axios';

export interface ActAs { login: string; nom: string }
const KEY = 'ep_act_as';
const EP_API = /^\/api\/(entretiens|ep-base|ep-ville)(\/|\?|$)/;

export function getActAs(): ActAs | null {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return v?.login ? v : null; } catch { return null; }
}
export const clearActAs = () => { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } };

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

/** Vérifie et journalise côté serveur, puis recharge le module sous cette identité. */
export async function startActAs(login: string) {
  const r = await axios.post('/api/entretiens/act-as', { login }, { headers: headers() });
  sessionStorage.setItem(KEY, JSON.stringify({ login: r.data.login, nom: r.data.nom }));
  window.location.assign('/ep');
}

export function stopActAs() {
  const current = getActAs();
  clearActAs();
  const done = () => window.location.assign('/ep');
  if (!current) { done(); return; }
  axios.delete('/api/entretiens/act-as', { params: { login: current.login }, headers: headers() }).then(done, done);
}

axios.interceptors.request.use((config) => {
  const current = getActAs();
  if (current && EP_API.test(config.url || '')) config.headers.set('X-Act-As', encodeURIComponent(current.login));
  return config;
});
