export type LinkType = 'FIBRE' | 'WAN' | 'OPERATEUR';
export type Operator = 'LINKT' | 'MOJI' | 'RED' | 'OTHER';
export type AccessType = 'FIBRE' | 'WAN' | 'ADSL' | 'SDSL' | '4G';
export type DuctStatus = 'LIBRE' | 'OCCUPE';

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
  site_code: string;
  nom: string;
  categorie?: string | null;
  lat: number | null;
  lng: number | null;
}
