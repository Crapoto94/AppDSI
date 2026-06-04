import axios from 'axios';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export interface StoreRole { store_id: number; role: 'viewer' | 'operator' | 'manager'; }
export interface MyRole { is_admin: boolean; stores: StoreRole[]; store_id: number | null; role: string | null; }
export interface Store { id: number; code?: string; name: string; address?: string; is_active: boolean; my_role?: string | null; }
export interface StorageLocation { id: number; store_id: number; code?: string; name: string; parent_id?: number | null; description?: string; is_active: boolean; }
export interface Member { id: number; store_id: number; username: string; role: string; }
export interface Item {
  id: number; reference?: string; label: string; category?: string; brand?: string; model?: string;
  ean?: string; specs?: Record<string, unknown>; tracking_mode: 'batch' | 'serial'; unit?: string; min_threshold?: number;
}
export interface StockLevel {
  id: number; item_id: number; store_id: number; location_id?: number | null; stock_type: string;
  quantity: number; min_threshold: number; reference?: string; label: string; category?: string;
  brand?: string; model?: string; unit?: string; tracking_mode: string; location_name?: string;
}
export interface Movement {
  id: number; item_id: number; store_id: number; location_id?: number | null; type: string; stock_type: string;
  quantity: number; reason?: string; reference?: string; created_by?: string; created_at: string;
  item_label?: string; item_reference?: string; location_name?: string;
}

const get = <T>(url: string, params?: object) => axios.get<T>(url, { params, headers: authHeaders() }).then(r => r.data);
const post = <T>(url: string, body?: object) => axios.post<T>(url, body, { headers: authHeaders() }).then(r => r.data);
const put = <T>(url: string, body?: object) => axios.put<T>(url, body, { headers: authHeaders() }).then(r => r.data);
const del = <T>(url: string) => axios.delete<T>(url, { headers: authHeaders() }).then(r => r.data);

export const stocksApi = {
  myRole: (storeId?: number) => get<MyRole>('/api/stocks/my-role', storeId ? { store_id: storeId } : undefined),

  listStores: () => get<Store[]>('/api/stocks/stores'),
  createStore: (b: Partial<Store>) => post<{ id: number }>('/api/stocks/stores', b),
  updateStore: (id: number, b: Partial<Store>) => put(`/api/stocks/stores/${id}`, b),
  deleteStore: (id: number) => del(`/api/stocks/stores/${id}`),

  listMembers: (storeId: number) => get<Member[]>(`/api/stocks/stores/${storeId}/members`),
  upsertMember: (storeId: number, username: string, role: string) => post(`/api/stocks/stores/${storeId}/members`, { username, role }),
  removeMember: (storeId: number, memberId: number) => del(`/api/stocks/stores/${storeId}/members/${memberId}`),

  listLocations: (storeId: number) => get<StorageLocation[]>(`/api/stocks/stores/${storeId}/locations`),
  createLocation: (storeId: number, b: Partial<StorageLocation>) => post(`/api/stocks/stores/${storeId}/locations`, b),
  updateLocation: (storeId: number, id: number, b: Partial<StorageLocation>) => put(`/api/stocks/stores/${storeId}/locations/${id}`, b),
  deleteLocation: (storeId: number, id: number) => del(`/api/stocks/stores/${storeId}/locations/${id}`),

  listItems: (params?: { search?: string; category?: string }) => get<Item[]>('/api/stocks/items', params),
  createItem: (b: Partial<Item>) => post<{ id: number }>('/api/stocks/items', b),
  updateItem: (id: number, b: Partial<Item>) => put(`/api/stocks/items/${id}`, b),
  deleteItem: (id: number) => del(`/api/stocks/items/${id}`),

  getStockLevels: (storeId: number, stock_type?: string) => get<StockLevel[]>(`/api/stocks/stores/${storeId}/stock-levels`, stock_type ? { stock_type } : undefined),
  updateThreshold: (storeId: number, levelId: number, min_threshold: number) => put(`/api/stocks/stores/${storeId}/stock-levels/${levelId}/threshold`, { min_threshold }),

  listMovements: (storeId: number, params?: { item_id?: number; limit?: number; offset?: number }) => get<Movement[]>(`/api/stocks/stores/${storeId}/movements`, params),
  createMovement: (storeId: number, b: object) => post<{ movementId: number }>(`/api/stocks/stores/${storeId}/movements`, b),

  // ─── Phase 2 : réception ───────────────────────────────────
  eanLookup: (code: string) => get<EanResult>(`/api/stocks/ean/${encodeURIComponent(code)}`),
  listOrders: (storeId: number, params: { fiscalYear?: string | number; budgetScope?: string }) => get<Order[]>(`/api/stocks/stores/${storeId}/orders`, params),
  listReceptions: (storeId: number) => get<Reception[]>(`/api/stocks/stores/${storeId}/receptions`),
  createReception: (storeId: number, b: Partial<Reception>) => post<Reception>(`/api/stocks/stores/${storeId}/receptions`, b),
  getReception: (storeId: number, id: number) => get<Reception & { lines: ReceptionLine[] }>(`/api/stocks/stores/${storeId}/receptions/${id}`),
  addReceptionLine: (storeId: number, id: number, line: Partial<ReceptionLine>) => post<{ id: number }>(`/api/stocks/stores/${storeId}/receptions/${id}/lines`, line),
  deleteReceptionLine: (storeId: number, id: number, lineId: number) => del(`/api/stocks/stores/${storeId}/receptions/${id}/lines/${lineId}`),
  validateReception: (storeId: number, id: number) => post<{ reception_id: number; serials_created?: number; already?: boolean }>(`/api/stocks/stores/${storeId}/receptions/${id}/validate`),
  listSerialItems: (storeId: number, params?: { status?: string; missing_serial?: string }) => get<SerialItem[]>(`/api/stocks/stores/${storeId}/serial-items`, params),
  setSerialNumber: (storeId: number, id: number, serial_number: string) => axios.patch(`/api/stocks/stores/${storeId}/serial-items/${id}`, { serial_number }, { headers: authHeaders() }).then(r => r.data),

  // ─── Phase 3 : sorties / prêts / prévision ─────────────────
  listDeliveries: (storeId: number, status?: string) => get<Delivery[]>(`/api/stocks/stores/${storeId}/deliveries`, status ? { status } : undefined),
  // Phase 1 : préparation (décrémente le stock, signature préparateur, BL pré-signé)
  prepareDelivery: (storeId: number, b: object) => post<Delivery>(`/api/stocks/stores/${storeId}/deliveries/prepare`, b),
  // Phase 2 : remise (signature destinataire, BL final)
  deliverDelivery: (storeId: number, id: number, recipient_signature?: string | null) =>
    post<Delivery>(`/api/stocks/stores/${storeId}/deliveries/${id}/deliver`, { recipient_signature }),
  getDelivery: (storeId: number, id: number) => get<Delivery>(`/api/stocks/stores/${storeId}/deliveries/${id}`),
  // Récupère le PDF du BL (authentifié) en blob → URL objet pour ouverture/affichage
  downloadBlUrl: async (storeId: number, id: number) => {
    const r = await axios.get(`/api/stocks/stores/${storeId}/deliveries/${id}/bl.pdf`, { headers: authHeaders(), responseType: 'blob' });
    return URL.createObjectURL(r.data as Blob);
  },

  // ─── Gabarits de Bon de Livraison ──────────────────────────
  listBlTemplates: () => get<BlTemplate[]>('/api/stocks/bl-templates'),
  getBlTemplate: (id: number) => get<BlTemplate>(`/api/stocks/bl-templates/${id}`),
  createBlTemplate: (b: Partial<BlTemplate>) => post<BlTemplate>('/api/stocks/bl-templates', b),
  updateBlTemplate: (id: number, b: Partial<BlTemplate>) => put<BlTemplate>(`/api/stocks/bl-templates/${id}`, b),
  deleteBlTemplate: (id: number) => del(`/api/stocks/bl-templates/${id}`),
  uploadBlTemplateBase: (id: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return axios.post(`/api/stocks/bl-templates/${id}/base`, fd, { headers: { ...authHeaders() } }).then(r => r.data);
  },
  listLoans: (storeId: number, status?: string) => get<Loan[]>(`/api/stocks/stores/${storeId}/loans`, status ? { status } : undefined),
  createLoan: (storeId: number, b: object) => post<Loan>(`/api/stocks/stores/${storeId}/loans`, b),
  returnLoan: (storeId: number, id: number) => post(`/api/stocks/stores/${storeId}/loans/${id}/return`),
  getForecast: (storeId: number, days?: number) => get<ForecastRow[]>(`/api/stocks/stores/${storeId}/forecast`, days ? { days } : undefined),
};

export interface Delivery {
  id: number; store_id: number; beneficiary_name?: string; beneficiary_username?: string; beneficiary_email?: string;
  status: 'prepared' | 'delivered'; bl_document_id?: number | null;
  preparer_signature_document_id?: number | null; recipient_signature_document_id?: number | null;
  template_id?: number | null; prepared_by?: string; prepared_at?: string; signed_at?: string;
  notes?: string; delivered_by?: string; created_at: string; line_count?: number;
  lines?: { id: number; item_id: number; item_label?: string; item_reference?: string; quantity: number; serial_number?: string }[];
}
export interface BlTemplate {
  id: number; name: string; base_document_id?: number | null; fields?: Array<Record<string, unknown>>;
  category?: 'bl' | 'remise' | 'retour'; is_default?: boolean; created_by?: string; created_at?: string; updated_at?: string;
}
export interface Loan {
  id: number; store_id: number; item_id: number; serial_item_id?: number | null; borrower_name?: string;
  borrower_username?: string; quantity: number; loaned_at: string; due_date?: string; returned_at?: string;
  status: 'active' | 'returned'; overdue?: boolean; item_label?: string; serial_number?: string;
}
export interface ForecastRow {
  item_id: number; label: string; reference?: string; unit?: string; quantity: number; min_threshold: number;
  consumed: number; avg_per_day: number; days_to_rupture: number | null; below_threshold: boolean;
  severity: 'rupture' | 'critical' | 'warning' | 'ok';
}

export interface EanResult {
  found: boolean; source: string; item_id?: number; label?: string; brand?: string;
  model?: string; category?: string; ean?: string; specs?: Record<string, string>;
}
export interface Order {
  id: string; order_number: string; description?: string; provider?: string;
  TIERS_TIERS?: string; COMMANDE_LIBELLE?: string; 'Date de la commande'?: string;
  amount_ht?: number; 'Nb lignes'?: number;
}
export interface Reception {
  id: number; order_number?: string; store_id: number; supplier?: string;
  status: 'draft' | 'partial' | 'received'; notes?: string; received_by?: string;
  received_at?: string; created_at: string; line_count?: number;
}
export interface ReceptionLine {
  id: number; reception_id: number; item_id?: number | null; reference?: string;
  label?: string; ean?: string; quantity_received: number; tracking_mode: 'batch' | 'serial';
  location_id?: number | null; specs?: Record<string, unknown>;
}
export interface SerialItem {
  id: number; item_id: number; store_id: number; serial_number?: string | null; status: string;
  order_number?: string; item_label?: string; item_reference?: string; brand?: string; model?: string;
}
