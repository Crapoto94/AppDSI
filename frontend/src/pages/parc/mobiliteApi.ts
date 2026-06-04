// ─── Client API du parc mobilité (façade /api/mobilite) ───────────────────────
import axios from 'axios';

const h = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface MobStore { id: number; code: string; name: string; my_role: 'viewer' | 'operator' | 'manager' | null }
export interface SerialItem {
  id: number; item_id: number; store_id: number; serial_number: string | null; status: string;
  order_number: string | null; item_label?: string; item_reference?: string; brand?: string; model?: string;
  location_id?: number | null; created_at?: string;
}
export interface MobModel { id: number; reference: string | null; label: string; category: string | null; brand: string | null; model: string | null }
export interface AdUser { username: string; displayName: string; email: string; service: string; direction: string }

export const mobiliteApi = {
  getStore: (token: string) => axios.get<MobStore>('/api/mobilite/store', { headers: h(token) }).then(r => r.data),
  listModels: (token: string) => axios.get<MobModel[]>('/api/mobilite/models', { headers: h(token) }).then(r => r.data),
  listStock: (token: string, opts: { missingSerial?: boolean; status?: string } = {}) =>
    axios.get<{ store_id: number; items: SerialItem[] }>('/api/mobilite/stock', {
      headers: h(token),
      params: { ...(opts.missingSerial ? { missing_serial: 1 } : {}), ...(opts.status ? { status: opts.status } : {}) },
    }).then(r => r.data),
  stockEntry: (token: string, body: Record<string, unknown>) =>
    axios.post('/api/mobilite/stock/entry', body, { headers: h(token) }).then(r => r.data),
  setSerial: (token: string, id: number, serial_number: string) =>
    axios.patch(`/api/mobilite/stock/serial/${id}`, { serial_number }, { headers: h(token) }).then(r => r.data),
  attribute: (token: string, body: Record<string, unknown>) =>
    axios.post<{ delivery_id: number; status: string; fiche_document_id: number | null }>('/api/mobilite/attribute', body, { headers: h(token) }).then(r => r.data),
  returnDevice: (token: string, body: Record<string, unknown>) =>
    axios.post<{ return_id: number; status: string; fiche_document_id: number | null }>('/api/mobilite/return', body, { headers: h(token) }).then(r => r.data),
  ficheUrl: (id: number, token: string) => `/api/mobilite/fiche/${id}?token=${encodeURIComponent(token)}`,
  searchAd: (token: string, q: string) =>
    axios.get<AdUser[]>('/api/ad/search', { headers: h(token), params: { q } }).then(r => r.data),
  // ouvre la fiche PDF (le token transite en query pour la balise <a>/onglet)
  openFiche: async (token: string, id: number) => {
    const r = await axios.get(`/api/mobilite/fiche/${id}`, { headers: h(token), responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
};
