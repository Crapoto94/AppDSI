export type LinkType = 'FIBRE' | 'WAN' | 'OPERATEUR' | 'LASER';
export type Operator = 'LINKT' | 'MOJI' | 'RED' | 'OTHER' | 'SFR';
export type AccessType = 'FIBRE' | 'WAN' | 'ADSL' | 'SDSL' | '4G' | '3G';
export type DuctStatus = 'LIBRE' | 'OCCUPE';
export type EquipType = 'SWITCH_L3' | 'SWITCH_L2' | 'ROUTEUR' | 'FIREWALL' | 'SWITCH_IRF_MEMBRE';
export type EquipStatut = 'PROD' | 'BACKUP' | 'HS';

export interface GeoLineString {
  type: 'LineString';
  coordinates: number[][]; // [ [lng,lat], … ]
}

export interface NetworkLink {
  id: string;
  site_a: string;
  site_b: string;
  type: LinkType;
  capacity?: string | null;
  operator?: Operator | null;
  carries_data: boolean;
  carries_voice: boolean;
  is_loop: boolean;
  is_redundant: boolean;
  geometry?: GeoLineString | null;
  bag_id?: string | null;
  fo_pairs?: string | null;
  port_a?: string | null;
  port_b?: string | null;
  vlan_trunk?: string | null;
  notes?: string | null;
  irf_stack_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface NetworkAccess {
  id: string;
  site_code: string;
  type: AccessType;
  operator?: Operator | null;
  mode?: string | null;
  bandwidth?: string | null;
  carries_data: boolean;
  carries_voice: boolean;
  comment?: string | null;
}

export interface Duct {
  id: string;
  name?: string | null;
  status: DuctStatus;
  capacity?: number | null;
  used_capacity?: number | null;
  geometry?: GeoLineString | null;
}

export interface SiteRef {
  id?: number | null;
  site_code: string;
  nom: string;
  categorie?: string | null;
  lat: number | null;
  lng: number | null;
  lat_own?: number | null;
  lng_own?: number | null;
  geocoded_manually?: boolean;
}

export interface IrfStack {
  id: number;
  nom: string;
  irf_domain?: number | null;
  ip_management?: string | null;
  vlan_management?: number | null;
  type_equipement?: string | null;
  description?: string | null;
  firmware?: string | null;
  actif: boolean;
  membres?: Equipement[];
}

export interface Equipement {
  id: number;
  site_code?: string | null;
  site_nom?: string | null;
  nom: string;
  type: EquipType;
  modele?: string | null;
  reference?: string | null;
  ip_management?: string | null;
  numero_serie?: string | null;
  firmware?: string | null;
  irf_stack_id?: number | null;
  irf_membre_num?: number | null;
  boucle?: string | null;
  localisation?: string | null;
  statut: EquipStatut;
  notes?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface Vlan {
  id: number;
  vlan_id: number;
  nom: string;
  description?: string | null;
  adresse_ip?: string | null;
  adresse_ip2?: string | null;
  dhcp_relay?: string | null;
  passerelle?: string | null;
  usage?: string | null;
  actif: boolean;
}

export interface LiaisonFO {
  id: number;
  site_a: string;
  site_b: string;
  site_a_nom?: string | null;
  site_b_nom?: string | null;
  libelle?: string | null;
  paires?: string | null;
  boite_jonction?: string | null;
  capacite?: string | null;
  boucle?: string | null;
  statut: string;
  notes?: string | null;
}

export interface SwitchLink {
  id: number;
  ext_id?: number | null;
  local_switch_id?: number | null;
  local_hostname?: string | null;
  local_alias?: string | null;
  local_site_id?: string | null;
  local_ip?: string | null;
  local_port?: string | null;
  local_port_description?: string | null;
  remote_switch_id?: number | null;
  remote_hostname?: string | null;
  remote_alias?: string | null;
  remote_site_id?: string | null;
  remote_ip?: string | null;
  remote_port?: string | null;
  remote_port_description?: string | null;
  is_intra_site: boolean;
  synced_at?: string | null;
}

export interface SiteWithSwitches {
  site_code: string;
  nom: string;
  categorie?: string | null;
  lat: number | null;
  lng: number | null;
  total_switchs: number;
  switchs_ok: number;
  switchs_ko: number;
}

export interface ReseauStats {
  liens_total: number;
  liens_intra: number;
  liens_inter: number;
  equipements: number;
  vlans_actifs: number;
  sites_connectes: number;
}

export interface DxfCalque {
  nom: string;
  nb_entites: number;
  types: string[];
}

export interface DxfEntite {
  id: number;
  calque: string;
  type: string;
  geojson: GeoJSON.Feature;
  couleur: string;
  epaisseur: number;
}

export interface DxfLayerStyle {
  calque: string;
  couleur?: string | null;
  visible?: boolean;
}

export interface DxfDocument {
  id: number;
  nom_fichier: string;
  calques: string[];
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number } | null;
  cree_le: string;
  entites: DxfEntite[];
}
