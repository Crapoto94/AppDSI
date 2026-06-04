// ─── Client API du parc mobilité (façade /api/mobilite) ───────────────────────
import axios from 'axios';

const h = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface MobStore { id: number; code: string; name: string; my_role: 'viewer' | 'operator' | 'manager' | null }

// Appareil mobilité (table hub_parc.mobilite_devices). `SerialItem` est conservé
// comme alias pour la compatibilité des composants existants.
export interface Device {
  device_key: string; id?: number; serial_item_id?: number | null; store_id?: number | null;
  imei?: string | null; serial?: string | null; etiquetage?: string | null;
  modele?: string | null; item_label?: string; model?: string | null; type_appareil?: string | null;
  famille?: string | null; numero_ligne?: string | null; order_number?: string | null;
  statut?: string | null; last_action?: string | null; last_action_norm?: string | null; last_statut?: string | null;
  last_direction?: string | null; last_service?: string | null; last_agent?: string | null;
  last_date?: string | null; first_date?: string | null; created_at?: string | null; updated_at?: string | null;
  pret_due_date?: string | null; fiche_document_id?: number | null; attrib?: any;
  // alias hérités
  serial_number?: string | null; status?: string;
}
export type SerialItem = Device;
export interface MobModel { id: number; reference: string | null; label: string; category: string | null; brand: string | null; model: string | null }
export interface AdUser { username: string; displayName: string; email: string; service: string; direction: string }
export interface OrgSecteur { code: string; label: string }
export interface OrgService { code: string; label: string; secteurs: OrgSecteur[] }
export interface OrgDirection { code: string; label: string; services: OrgService[] }

export const mobiliteApi = {
  getStore: (token: string) => axios.get<MobStore>('/api/mobilite/store', { headers: h(token) }).then(r => r.data),
  listModels: (token: string) => axios.get<MobModel[]>('/api/mobilite/models', { headers: h(token) }).then(r => r.data),
  organisation: (token: string) => axios.get<OrgDirection[]>('/api/mobilite/organisation', { headers: h(token) }).then(r => r.data),

  // Stock = appareils statut 'stock'. (le paramètre status est ignoré côté serveur, conservé pour compat)
  listStock: (token: string, _opts: { missingSerial?: boolean; status?: string } = {}) =>
    axios.get<{ store_id: number; items: Device[] }>('/api/mobilite/stock', { headers: h(token) }).then(r => r.data),
  listAttributions: (token: string) =>
    axios.get<{ store_id: number; items: Device[] }>('/api/mobilite/attributions', { headers: h(token) }).then(r => r.data),
  // Liste principale (appareils attribués) — sert aussi de source au sélecteur de retour.
  listDevices: (token: string, params: Record<string, unknown> = {}) =>
    axios.get<{ total: number; items: Device[] }>('/api/mobilite/devices', { headers: h(token), params }).then(r => r.data),

  stockEntry: (token: string, body: Record<string, unknown>) =>
    axios.post('/api/mobilite/stock/entry', body, { headers: h(token) }).then(r => r.data),
  setSerial: (token: string, serialItemId: number, serial_number: string) =>
    axios.patch(`/api/mobilite/stock/serial/${serialItemId}`, { serial_number }, { headers: h(token) }).then(r => r.data),

  // Attribution 2 phases
  attribute: (token: string, body: Record<string, unknown>) =>
    axios.post<{ ok: boolean; device_key: string; statut: string }>('/api/mobilite/attribute', body, { headers: h(token) }).then(r => r.data),
  deliverSign: (token: string, key: string, recipient_signature: string | null) =>
    axios.post<{ ok: boolean; statut: string; fiche_document_id: number | null }>(`/api/mobilite/attributions/${encodeURIComponent(key)}/deliver`, { recipient_signature }, { headers: h(token) }).then(r => r.data),
  deliverUpload: (token: string, key: string, file: File) => {
    const fd = new FormData(); fd.append('fiche', file);
    return axios.post<{ ok: boolean; statut: string; fiche_document_id: number | null }>(`/api/mobilite/attributions/${encodeURIComponent(key)}/deliver`, fd, { headers: h(token) }).then(r => r.data);
  },
  cancelAttribution: (token: string, key: string) =>
    axios.post(`/api/mobilite/attributions/${encodeURIComponent(key)}/cancel`, {}, { headers: h(token) }).then(r => r.data),

  // Retours
  quickReturn: (token: string, key: string) =>
    axios.post(`/api/mobilite/devices/${encodeURIComponent(key)}/return`, {}, { headers: h(token) }).then(r => r.data),
  returnDevice: (token: string, body: Record<string, unknown>) =>
    axios.post<{ ok: boolean; statut: string; fiche_document_id: number | null }>('/api/mobilite/return', body, { headers: h(token) }).then(r => r.data),
  // Édition libre d'un appareil
  updateDevice: (token: string, key: string, body: Record<string, unknown>) =>
    axios.patch<Device>(`/api/mobilite/devices/${encodeURIComponent(key)}`, body, { headers: h(token) }).then(r => r.data),

  // Import Excel (écrase la base mobile)
  importExcel: (token: string, file: File) => {
    const fd = new FormData(); fd.append('file', file);
    return axios.post<{ ok: boolean; devices: number; events: number }>('/api/mobilite/import', fd, { headers: h(token) }).then(r => r.data);
  },

  searchAd: (token: string, q: string) =>
    axios.get<AdUser[]>('/api/ad/search', { headers: h(token), params: { q } }).then(r => r.data),
  // Ouvre une fiche PDF par id de document
  openFiche: async (token: string, docId: number) => {
    const r = await axios.get(`/api/mobilite/fiche/${docId}`, { headers: h(token), responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
};
