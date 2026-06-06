import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Header';
import axios from 'axios';
import { Plus, Edit2, Trash2, Upload, Search, ChevronUp, ChevronDown, ChevronsUpDown, X, MapPin, ChevronRight, List, Network, Phone, UserCheck, UserX, AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';
import AdminOrganisation from '../AdminOrganisation';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface VilleConfig { id?: number; nom: string; code_postal: string; }
interface Elu { id?: number; nom: string; prenom: string; email?: string; telephone?: string; role: string; delegation?: string; }
interface Site {
  id?: number; code_bien?: string; nom: string; categorie?: string;
  adresse?: string; is_active: boolean; lat?: number; lng?: number;
  abbreviation?: string; geocoded_manually?: boolean;
}
interface Ecole { id?: number; nom: string; adresse?: string; code_postal?: string; email?: string; telephone?: string; directeur?: string; }
interface GeocodedSite { code: string; nom: string; lat: number; lng: number; adresse: string; categorie?: string; }

type SortKey = 'code_bien' | 'nom' | 'categorie' | 'adresse' | 'is_active';
type SortDir = 'asc' | 'desc';
type ViewMode = 'liste' | 'arborescence';
type SiteType =
  | 'site'            // S\d+
  | 'batiment'        // S\d+B\d+([A-Z]\d*)?
  | 'local'           // S\d+L\d+
  | 'ext'             // S\d+EXT
  | 'ext_n'           // S\d+EXT\d+
  | 'espace_ext'      // S\d+ESPEX\d+ ou S\d+ESPX\d+
  | 'terrain'         // S\d+T\d+
  | 'batiment_ext'    // S\d+EXTB\d+
  | 'niveau'          // S\d+B\d+[A-Z]?N-?\d+
  | 'divers_batiment' // S\d+B\d+Z\d+
  | 'local_niveau'    // S\d+B\d+[A-Z]?N-?\d+L\d+
  | 'divers_niveau'   // S\d+B\d+[A-Z]?N-?\d+Z\d+
  | 'local_bat'       // S\d+B\d+[A-Z]?L\d+
  | 'section'         // S\d+B\d+[A-Z]?C\d+
  | 'autre';

// ─── Hiérarchie des codes ─────────────────────────────────────────────────────
interface ParsedCode {
  type: SiteType;
  siteCode: string | null;   // code SXXX du site racine
  siteNum: number | null;
  parentCode: string | null; // code direct du parent pour l'arbre
  label: string;             // libellé court ("Niveau -2", "Bâtiment 1A")
  typeLabel: string;         // nom du type ("Niveau", "Bâtiment"…)
  shortLabel: string;        // badge très court ("Niv.", "Bât."…)
  depth: number;             // 0=site, 1=fils, 2=petit-fils, 3=arrière-petit-fils
}

/**
 * Logique de décodage des codes site :
 *   S\d+             → site principal
 *   S\d+EXT          → extérieur du site
 *   S\d+EXTB\d+      → bâtiment de l'extérieur
 *   S\d+ESPEX\d+     → espace extérieur
 *   S\d+T\d+         → terrain
 *   S\d+L\d+         → local direct du site
 *   S\d+B\d+[A-Z]?   → bâtiment (optionnellement suffixé A, B…)
 *   S\d+B\d+[A-Z]?N-?\d+         → niveau du bâtiment
 *   S\d+B\d+Z\d+                 → divers du bâtiment
 *   S\d+B\d+[A-Z]?N-?\d+L\d+    → local du niveau
 *   S\d+B\d+[A-Z]?N-?\d+Z\d+    → divers du niveau
 */
function parseSiteCode(code: string): ParsedCode {
  const none: ParsedCode = { type: 'autre', siteCode: null, siteNum: null, parentCode: null, label: code || '—', typeLabel: 'Autre', shortLabel: '?', depth: 0 };
  if (!code) return none;

  // Extraire le préfixe site (S suivi de chiffres)
  const sM = code.match(/^S(\d+)/);
  if (!sM) return none;

  const siteNum = parseInt(sM[1], 10);
  const siteCode = `S${sM[1]}`;
  const rest = code.slice(sM[0].length); // tout ce qui suit SXXX

  // ── Site principal ──────────────────────────────────────────────
  if (!rest) return { type: 'site', siteCode: code, siteNum, parentCode: null, label: `Site ${siteNum}`, typeLabel: 'Site', shortLabel: 'Site', depth: 0 };

  // ── EXTB\d+ → bâtiment d'extérieur ─────────────────────────────
  const extBM = rest.match(/^EXTB(\d+)$/);
  if (extBM) {
    const n = parseInt(extBM[1], 10);
    return { type: 'batiment_ext', siteCode, siteNum, parentCode: `${siteCode}EXT`, label: `Bât. Ext. ${n}`, typeLabel: 'Bât. Ext.', shortLabel: 'Bât.Ext.', depth: 2 };
  }

  // ── EXT\d+ → extérieur numéroté (ex. EXT01) ────────────────────
  const extNM = rest.match(/^EXT(\d+)$/);
  if (extNM) {
    const n = parseInt(extNM[1], 10);
    return { type: 'ext_n', siteCode, siteNum, parentCode: siteCode, label: `Ext. ${n}`, typeLabel: 'Ext. N°', shortLabel: `Ext.${n}`, depth: 1 };
  }

  // ── EXT → extérieur ────────────────────────────────────────────
  if (rest === 'EXT') return { type: 'ext', siteCode, siteNum, parentCode: siteCode, label: 'Extérieur', typeLabel: 'Extérieur', shortLabel: 'Ext.', depth: 1 };

  // ── ESPEX\d+ ou ESPX\d+ → espace extérieur ─────────────────────
  const espM = rest.match(/^ESPEX(\d+)$/) || rest.match(/^ESPX(\d+)$/);
  if (espM) {
    const n = parseInt(espM[1], 10);
    return { type: 'espace_ext', siteCode, siteNum, parentCode: siteCode, label: `Esp. Ext. ${n}`, typeLabel: 'Espace Ext.', shortLabel: 'Esp.Ext.', depth: 1 };
  }

  // ── T\d+ → terrain ─────────────────────────────────────────────
  const tM = rest.match(/^T(\d+)$/);
  if (tM) {
    const n = parseInt(tM[1], 10);
    return { type: 'terrain', siteCode, siteNum, parentCode: siteCode, label: `Terrain ${n}`, typeLabel: 'Terrain', shortLabel: 'Terrain', depth: 1 };
  }

  // ── L\d+ → local direct du site ────────────────────────────────
  const lSiteM = rest.match(/^L(\d+)$/);
  if (lSiteM) {
    const n = parseInt(lSiteM[1], 10);
    return { type: 'local', siteCode, siteNum, parentCode: siteCode, label: `Local ${n}`, typeLabel: 'Local', shortLabel: 'Local', depth: 1 };
  }

  // ── Sous-patterns du bâtiment ──────────────────────────────────
  // Ordre : plus spécifique en premier
  // Note sur le moteur regex : [A-Z]? après \d+ backtrack correctement
  // si la lettre est nécessaire comme marqueur (N, Z, L).

  // B(\d+)([A-Z]?)N(-?\d+)L(\d+) → local du niveau
  const lNivM = rest.match(/^B(\d+)([A-Z]?)N(-?\d+)L(\d+)$/);
  if (lNivM) {
    const batCode = `${siteCode}B${lNivM[1]}${lNivM[2]}`;
    const niveauCode = `${batCode}N${lNivM[3]}`;
    const n = parseInt(lNivM[4], 10);
    const batLabel = lNivM[2] ? `Bât. ${parseInt(lNivM[1],10)}${lNivM[2]}` : `Bât. ${parseInt(lNivM[1],10)}`;
    return { type: 'local_niveau', siteCode, siteNum, parentCode: niveauCode, label: `Local ${n}`, typeLabel: 'Local/Niv.', shortLabel: 'Local', depth: 3 };
  }

  // B(\d+)([A-Z]?)N(-?\d+)Z(\d+) → divers du niveau
  const dNivM = rest.match(/^B(\d+)([A-Z]?)N(-?\d+)Z(\d+)$/);
  if (dNivM) {
    const batCode = `${siteCode}B${dNivM[1]}${dNivM[2]}`;
    const niveauCode = `${batCode}N${dNivM[3]}`;
    const n = parseInt(dNivM[4], 10);
    return { type: 'divers_niveau', siteCode, siteNum, parentCode: niveauCode, label: `Divers ${n}`, typeLabel: 'Divers/Niv.', shortLabel: 'Divers', depth: 3 };
  }

  // B(\d+)([A-Z]?)N(-?\d+) → niveau
  const nivM = rest.match(/^B(\d+)([A-Z]?)N(-?\d+)$/);
  if (nivM) {
    const batCode = `${siteCode}B${nivM[1]}${nivM[2]}`;
    const nLabel = nivM[3];
    const batLabel = nivM[2] ? `Bât. ${parseInt(nivM[1],10)}${nivM[2]}` : `Bât. ${parseInt(nivM[1],10)}`;
    return { type: 'niveau', siteCode, siteNum, parentCode: batCode, label: `Niveau ${nLabel}`, typeLabel: 'Niveau', shortLabel: `Niv.${nLabel}`, depth: 2 };
  }

  // B(\d+)Z(\d+) → divers du bâtiment (Z est le marqueur, pas un suffixe lettre)
  const dBatM = rest.match(/^B(\d+)Z(\d+)$/);
  if (dBatM) {
    const batCode = `${siteCode}B${dBatM[1]}`;
    const n = parseInt(dBatM[2], 10);
    return { type: 'divers_batiment', siteCode, siteNum, parentCode: batCode, label: `Divers ${n}`, typeLabel: 'Divers', shortLabel: 'Divers', depth: 2 };
  }

  // B(\d+)([A-Z]?)C(\d+) → section du bâtiment (ex. B01C03)
  const sectM = rest.match(/^B(\d+)([A-Z]?)C(\d+)$/);
  if (sectM) {
    const batCode = `${siteCode}B${sectM[1]}${sectM[2]}`;
    const n = parseInt(sectM[3], 10);
    return { type: 'section', siteCode, siteNum, parentCode: batCode, label: `Section ${n}`, typeLabel: 'Section', shortLabel: 'Sect.', depth: 2 };
  }

  // B(\d+)([A-Z]?)L(\d+) → local du bâtiment sans niveau (ex. B02L02)
  const lBatM = rest.match(/^B(\d+)([A-Z]?)L(\d+)$/);
  if (lBatM) {
    const batCode = `${siteCode}B${lBatM[1]}${lBatM[2]}`;
    const n = parseInt(lBatM[3], 10);
    return { type: 'local_bat', siteCode, siteNum, parentCode: batCode, label: `Local ${n}`, typeLabel: 'Local/Bât.', shortLabel: 'Local', depth: 2 };
  }

  // B(\d+)([A-Z]\d*)? → bâtiment avec suffixe alphanumérique optionnel (ex. B01, B01A, B01B0)
  const batM = rest.match(/^B(\d+)([A-Z]\d*)?$/);
  if (batM) {
    const n = parseInt(batM[1], 10);
    const suffix = batM[2] || '';
    const lbl = suffix ? `Bâtiment ${n}${suffix}` : `Bâtiment ${n}`;
    return { type: 'batiment', siteCode, siteNum, parentCode: siteCode, label: lbl, typeLabel: 'Bâtiment', shortLabel: suffix ? `Bât.${suffix}` : 'Bât.', depth: 1 };
  }

  return { ...none, siteCode, siteNum };
}

const TYPE_CFG: Record<SiteType, { emoji: string; color: string; bg: string }> = {
  site:           { emoji: '🏢', color: '#2563eb', bg: '#eff6ff' },
  batiment:       { emoji: '🏗️', color: '#ea580c', bg: '#fff7ed' },
  local:          { emoji: '🚪', color: '#16a34a', bg: '#f0fdf4' },
  ext:            { emoji: '🌿', color: '#0891b2', bg: '#ecfeff' },
  ext_n:          { emoji: '🌿', color: '#0891b2', bg: '#ecfeff' },
  espace_ext:     { emoji: '🌳', color: '#059669', bg: '#ecfdf5' },
  terrain:        { emoji: '🏕️', color: '#ca8a04', bg: '#fefce8' },
  batiment_ext:   { emoji: '🏚️', color: '#7c3aed', bg: '#f5f3ff' },
  niveau:         { emoji: '📐', color: '#475569', bg: '#f8fafc' },
  divers_batiment:{ emoji: '📦', color: '#6b7280', bg: '#f9fafb' },
  local_niveau:   { emoji: '🚪', color: '#10b981', bg: '#ecfdf5' },
  divers_niveau:  { emoji: '📦', color: '#9ca3af', bg: '#f9fafb' },
  local_bat:      { emoji: '🚪', color: '#16a34a', bg: '#f0fdf4' },
  section:        { emoji: '🏘️', color: '#7c3aed', bg: '#f5f3ff' },
  autre:          { emoji: '❓', color: '#9ca3af', bg: '#f9fafb' },
};

// ─── Arborescence ─────────────────────────────────────────────────────────────
interface TreeNode { site: Site; parsed: ParsedCode; children: TreeNode[]; }

function countDescendants(node: TreeNode): number {
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0);
}

function buildTree(sites: Site[]): { roots: TreeNode[]; orphans: TreeNode[] } {
  // Créer tous les nœuds indexés par code_bien
  const byCode = new Map<string, TreeNode>();
  sites.forEach(s => {
    if (!s.code_bien) return;
    byCode.set(s.code_bien, { site: s, parsed: parseSiteCode(s.code_bien), children: [] });
  });

  const roots: TreeNode[] = [];
  const orphans: TreeNode[] = [];

  // Rattacher chaque nœud à son parent via parentCode
  byCode.forEach(node => {
    const { parsed } = node;
    if (parsed.type === 'site') {
      roots.push(node);
    } else if (parsed.parentCode) {
      const parent = byCode.get(parsed.parentCode);
      if (parent) {
        parent.children.push(node);
      } else {
        // Fallback : rattacher au site racine si le parent intermédiaire est absent
        const siteParent = parsed.siteCode ? byCode.get(parsed.siteCode) : null;
        if (siteParent) siteParent.children.push(node);
        else orphans.push(node);
      }
    } else {
      orphans.push(node);
    }
  });

  // Tri récursif des enfants
  const sortChildren = (node: TreeNode) => {
    node.children.sort((a, b) => (a.site.code_bien || '').localeCompare(b.site.code_bien || '', undefined, { numeric: true }));
    node.children.forEach(sortChildren);
  };
  roots.sort((a, b) => (a.site.code_bien || '').localeCompare(b.site.code_bien || '', undefined, { numeric: true }));
  roots.forEach(sortChildren);

  return { roots, orphans };
}

function filterTreeNodes(nodes: TreeNode[], predicate: (s: Site) => boolean): TreeNode[] {
  return nodes.reduce<TreeNode[]>((acc, node) => {
    const filteredChildren = filterTreeNodes(node.children, predicate);
    if (predicate(node.site) || filteredChildren.length > 0) {
      acc.push({ ...node, children: filteredChildren });
    }
    return acc;
  }, []);
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const ROLES = ['Maire', 'Adjoint', 'Conseiller municipal'];

const CATEGORY_ICONS: Record<string, string> = {
  'ESPACES VERTS': '🌳', 'SPORTIF': '⚽', 'ADMINISTRATIF': '🏛️', 'AUTRE ADMINISTRATION': '🏢',
  'LOGEMENT': '🏠', 'ACTIVITES': '🎯', 'HANG': '🏭', 'SCOLAIRE': '🏫', 'CULTE': '⛪',
  'CULTUREL': '🎭', 'TECHNIQUE': '🔧', 'PARKING': '🅿️', 'SANITAIRES': '🚽', 'EQUIPEMENT': '⚙️',
  'PRIVE OPERATIONNEL': '🏗️', 'PRIVE HORS OPERATION': '🚧', 'PRIVE': '🔒', 'ASSOCIATIF': '🤝',
  'SOCIAL / ASSOCIATIF': '🤲', 'SOCIAL': '🫂', 'PETITE ENFANCE': '👶', 'CITE': '🏘️',
  'FOYER': '🏡', 'CENTRE DE VACANCES': '🏖️', 'CENTRE DE LOISIRS': '🎠',
  'MAISON DE QUARTIER': '🏘️', 'CIMETIERE': '🪦', 'LOCAL TECHNIQUE': '🔩', 'SANTE': '🏥',
  'STATIONNEMENT': '🅿️', 'SANS AFFECTATION': '❓',
};

const CATEGORY_COLORS: Record<string, string> = {
  'ESPACES VERTS': '#16a34a', 'SPORTIF': '#ea580c', 'ADMINISTRATIF': '#2563eb',
  'AUTRE ADMINISTRATION': '#7c3aed', 'LOGEMENT': '#db2777', 'ACTIVITES': '#ca8a04',
  'HANG': '#4b5563', 'SCOLAIRE': '#0891b2', 'CULTE': '#9333ea', 'CULTUREL': '#c026d3',
  'TECHNIQUE': '#0f766e', 'PARKING': '#374151', 'SANITAIRES': '#0284c7', 'EQUIPEMENT': '#7c3aed',
  'PRIVE OPERATIONNEL': '#0369a1', 'PRIVE HORS OPERATION': '#92400e', 'PRIVE': '#374151',
  'ASSOCIATIF': '#0891b2', 'SOCIAL / ASSOCIATIF': '#0e7490', 'SOCIAL': '#0e7490',
  'PETITE ENFANCE': '#ec4899', 'CITE': '#7c3aed', 'FOYER': '#be185d',
  'CENTRE DE VACANCES': '#0284c7', 'CENTRE DE LOISIRS': '#d97706', 'MAISON DE QUARTIER': '#6d28d9',
  'CIMETIERE': '#1e293b', 'LOCAL TECHNIQUE': '#334155', 'SANTE': '#dc2626',
  'STATIONNEMENT': '#475569', 'SANS AFFECTATION': '#9ca3af',
};

const parseAddress = (adresse: string): string =>
  adresse.replace(/^(\d+)(?:-\d+)+\s+/, '$1 ').trim();

const isCentreDeVacances = (site: Site): boolean => {
  const nom = (site.nom || '').toUpperCase();
  const cat = (site.categorie || '').toUpperCase();
  return cat === 'CENTRE DE VACANCES' || nom.includes('VACANCES') || nom.includes('COLONIE') || nom.includes('SÉJOUR');
};

const getCategoryEmoji = (cat?: string): string => CATEGORY_ICONS[(cat || '').trim().toUpperCase()] || '📌';
const getCategoryColor = (cat?: string): string => CATEGORY_COLORS[(cat || '').trim().toUpperCase()] || '#3b82f6';
const getCategoryIcon = (cat?: string): L.DivIcon => {
  const emoji = getCategoryEmoji(cat);
  const color = getCategoryColor(cat);
  return L.divIcon({
    className: '',
    html: `<div style="background:white;border:2.5px solid ${color};border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 2px 8px rgba(0,0,0,0.25);cursor:pointer">${emoji}</div>`,
    iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -36],
  });
};

const MapController = ({ selectedCode, geocodedSites }: { selectedCode: string | null; geocodedSites: GeocodedSite[] }) => {
  const map = useMap();
  useEffect(() => {
    if (!selectedCode) return;
    const site = geocodedSites.find(g => g.code === selectedCode);
    if (site) map.flyTo([site.lat, site.lng], 17, { duration: 1.2 });
  }, [selectedCode, geocodedSites, map]);
  return null;
};

const MapMoveHandler: React.FC<{
  active: boolean;
  onPick: (lat: number, lng: number) => void;
}> = ({ active, onPick }) => {
  useMapEvents({ click(e) { if (active) onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
};

const getSortValue = (site: Site, key: SortKey): string => {
  if (key === 'is_active') return site.is_active ? '1' : '0';
  return String((site as any)[key] ?? '');
};

// ─── Composant nœud arborescence ─────────────────────────────────────────────
const TreeRow = ({
  node, depth, collapsed, onToggle, showInactifs, parentInactive = false,
}: {
  node: TreeNode; depth: number;
  collapsed: Set<string>; onToggle: (code: string) => void;
  showInactifs: boolean;
  parentInactive?: boolean;
}) => {
  const effectivelyInactive = !node.site.is_active || parentInactive;
  if (!showInactifs && effectivelyInactive && node.children.length === 0) return null;
  const code = node.site.code_bien || '';
  const isCollapsed = collapsed.has(code);
  const hasChildren = node.children.length > 0;
  const { parsed, site } = node;
  const cfg = TYPE_CFG[parsed.type];
  const isGeo = !!(site.lat && site.lng);
  const directCount = node.children.length;
  const totalCount = hasChildren ? countDescendants(node) : 0;

  const BG_BY_DEPTH = ['#fff', '#fafeff', '#f8f6ff', '#f6faf8', '#fefdf5'];
  const rowBg = effectivelyInactive ? '#fafafa' : (BG_BY_DEPTH[Math.min(depth, BG_BY_DEPTH.length - 1)]);

  return (
    <>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 10px',
          paddingLeft: 10 + depth * 22,
          borderBottom: '1px solid #f1f5f9',
          background: rowBg,
          opacity: effectivelyInactive ? 0.6 : 1,
        }}
      >
        {/* Toggle expand/collapse */}
        <div style={{ width: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {hasChildren ? (
            <button onClick={() => onToggle(code)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8', lineHeight: 1, display: 'flex' }}>
              {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
          ) : <span style={{ width: 13 }} />}
        </div>

        {/* Emoji type */}
        <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{cfg.emoji}</span>

        {/* Code */}
        <code style={{ fontSize: '11px', background: cfg.bg, color: cfg.color, padding: '1px 5px', borderRadius: 3, fontWeight: 700, flexShrink: 0, border: `1px solid ${cfg.color}25` }}>
          {code || '—'}
        </code>

        {/* Type badge (court) */}
        <span style={{ fontSize: '10px', color: cfg.color, background: cfg.bg, padding: '1px 4px', borderRadius: 3, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {parsed.shortLabel}
        </span>

        {/* Libellé du nœud (label court : "Niveau -2", "Bâtiment 1A"…) */}
        {parsed.type !== 'site' && (
          <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {parsed.label}
          </span>
        )}

        {/* Nom (désignation) */}
        <span style={{ fontSize: '13px', color: '#1e293b', fontWeight: depth === 0 ? 700 : 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {site.nom}
        </span>

        {/* Abréviation */}
        {site.abbreviation && (
          <span style={{ fontSize: '10px', color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>
            {site.abbreviation}
          </span>
        )}

        {/* Catégorie (sites principaux uniquement) */}
        {site.categorie && depth === 0 && (
          <span style={{ fontSize: '10px', color: getCategoryColor(site.categorie), background: getCategoryColor(site.categorie) + '18', padding: '1px 6px', borderRadius: 3, fontWeight: 600, flexShrink: 0, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {getCategoryEmoji(site.categorie)} {site.categorie}
          </span>
        )}

        {/* Compteur de sous-éléments */}
        {hasChildren && (
          <span
            title={totalCount > directCount ? `${directCount} direct${directCount > 1 ? 's' : ''}, ${totalCount} au total` : `${directCount} sous-élément${directCount > 1 ? 's' : ''}`}
            style={{ fontSize: '10px', background: '#e2e8f0', color: '#475569', padding: '1px 6px', borderRadius: 10, fontWeight: 700, flexShrink: 0, cursor: 'default', whiteSpace: 'nowrap' }}>
            {directCount}
            {totalCount > directCount && <span style={{ opacity: 0.65 }}> / {totalCount}</span>}
          </span>
        )}

        {/* Localisé */}
        {isGeo
          ? <span title={`${site.lat?.toFixed(5)}, ${site.lng?.toFixed(5)}`} style={{ color: '#16a34a', fontSize: 12, flexShrink: 0 }}>📍</span>
          : <span style={{ color: '#e2e8f0', fontSize: 12, flexShrink: 0 }}>📍</span>}

        {/* Inactif */}
        {effectivelyInactive && (
          <span style={{ fontSize: '10px', color: '#ef4444', background: '#fef2f2', padding: '1px 4px', borderRadius: 3, flexShrink: 0 }}>
            {!site.is_active ? 'inactif' : 'inactif (parent)'}
          </span>
        )}
      </div>

      {/* Enfants récursifs */}
      {!isCollapsed && node.children.map(child => (
        <TreeRow key={child.site.id ?? child.site.code_bien} node={child} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} showInactifs={showInactifs} parentInactive={effectivelyInactive} />
      ))}
    </>
  );
};

// ─── Onglet Encadrants ────────────────────────────────────────────────────────
interface Encadrant {
  matricule: string; nom: string; prenom: string;
  direction_code: string; direction_label: string;
  service_code: string; service_label: string;
  poste: string; role: 'dg' | 'directeur' | 'responsable_service';
  is_direction_service: boolean;
  email: string; email_source: 'ad' | 'manuel' | '';
  ad_phone: string; ad_username: string;
  telephone: string; telephone_perso: string; position: string;
}
interface ADSearchResult { username: string; displayName: string; email: string; title: string; department: string; employeeID: string; }
interface ADMember { username: string; displayName: string; email: string; title: string; department: string; }

function EncadrantsTab({ token }: { token: string | null }) {
  const [encadrants, setEncadrants] = useState<Encadrant[]>([]);
  const [adGroup, setADGroup] = useState<ADMember[]>([]);
  const [adGroupsList, setADGroupsList] = useState<{ dn: string; cn: string; displayName: string; mail: string }[]>([]);
  const [loadingGroupsList, setLoadingGroupsList] = useState(false);
  const [selectedGroupDN, setSelectedGroupDN] = useState('');
  const [groupsFilter, setGroupsFilter] = useState('');
  const [adLinkMatricule, setADLinkMatricule] = useState<string | null>(null);
  const [adSearchQ, setADSearchQ] = useState('');
  const [adSearchResults, setADSearchResults] = useState<ADSearchResult[]>([]);
  const [adSearchLoading, setADSearchLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingAD, setLoadingAD] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [editPhones, setEditPhones] = useState<Record<string, { pro: string; perso: string }>>({});
  const [searchQ, setSearchQ] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'dg' | 'directeur' | 'responsable_service'>('all');
  const [showADCompare, setShowADCompare] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/admin/rh/encadrants', { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (r.ok) {
        setEncadrants(d);
        const init: Record<string, { pro: string; perso: string }> = {};
        d.forEach((e: Encadrant) => { init[e.matricule] = { pro: e.telephone || '', perso: e.telephone_perso || '' }; });
        setEditPhones(init);
      } else setError(d.error || 'Erreur chargement');
    } catch { setError('Erreur réseau'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const savePhone = async (matricule: string) => {
    setSaving(matricule);
    try {
      const phones = editPhones[matricule] || { pro: '', perso: '' };
      const r = await fetch(`/api/admin/rh/encadrants/${matricule}/telephone`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ telephone: phones.pro, telephone_perso: phones.perso })
      });
      if (r.ok) {
        setEncadrants(prev => prev.map(e => e.matricule === matricule
          ? { ...e, telephone: phones.pro, telephone_perso: phones.perso } : e));
        setSaveMsg('✔ Téléphones enregistrés');
        setTimeout(() => setSaveMsg(''), 2000);
      }
    } finally { setSaving(null); }
  };

  const loadADGroupsList = useCallback(async () => {
    setLoadingGroupsList(true);
    try {
      const r = await fetch('/api/admin/rh/encadrants/ad-groups-list', { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (r.ok) setADGroupsList(d.groups || []);
    } catch { }
    finally { setLoadingGroupsList(false); }
  }, [token]);

  const loadADGroup = async (dn?: string) => {
    const target = dn || selectedGroupDN;
    if (!target) return;
    setLoadingAD(true); setADGroup([]);
    try {
      const r = await fetch(`/api/admin/rh/encadrants/ad-group?dn=${encodeURIComponent(target)}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (r.ok) setADGroup(d.members || []);
      else setError(d.error || 'Erreur liste AD');
    } catch { setError('Erreur réseau AD'); }
    finally { setLoadingAD(false); }
  };

  const searchAD = async (q: string) => {
    if (!q || q.length < 2) { setADSearchResults([]); return; }
    setADSearchLoading(true);
    try {
      const r = await fetch(`/api/admin/rh/encadrants/ad-search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setADSearchResults(Array.isArray(d) ? d : []);
    } catch { setADSearchResults([]); }
    finally { setADSearchLoading(false); }
  };

  const linkToAD = async (matricule: string, result: ADSearchResult) => {
    try {
      const r = await fetch(`/api/admin/rh/encadrants/${matricule}/ad-link`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_username: result.username, email: result.email })
      });
      if (r.ok) {
        setEncadrants(prev => prev.map(e => e.matricule === matricule
          ? { ...e, email: result.email, email_source: 'manuel', ad_username: result.username }
          : e));
        setSaveMsg(`✔ Lien AD créé : ${result.displayName} → ${result.email}`);
        setTimeout(() => setSaveMsg(''), 3000);
        setADLinkMatricule(null);
        setADSearchQ(''); setADSearchResults([]);
      }
    } catch { setError('Erreur lors de la liaison AD'); }
  };

  const filtered = encadrants.filter(e => {
    if (filterRole !== 'all' && e.role !== filterRole) return false;
    if (!searchQ) return true;
    const q = searchQ.toLowerCase();
    return `${e.prenom} ${e.nom} ${e.direction_label} ${e.service_label} ${e.poste}`.toLowerCase().includes(q);
  });

  // Comparaison AD
  const encadrantEmails = new Set(encadrants.map(e => e.email.toLowerCase()).filter(Boolean));
  const adEmails = new Set(adGroup.map(m => m.email.toLowerCase()).filter(Boolean));
  const absentsAD = encadrants.filter(e => e.email && !adEmails.has(e.email.toLowerCase())); // dans RH mais pas AD
  const absentsRH = adGroup.filter(m => m.email && !encadrantEmails.has(m.email.toLowerCase())); // dans AD mais pas RH

  const roleColor = (r: string) =>
    r === 'dg'         ? { bg: '#faf5ff', text: '#6b21a8', border: '#e9d5ff' } :
    r === 'directeur'  ? { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' }
                       : { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' };
  const roleLabel = (r: string) =>
    r === 'dg' ? 'Dir. Général·e' : r === 'directeur' ? 'Directeur·trice' : 'Resp. service';
  const dgCount = encadrants.filter(e => e.role === 'dg').length;
  const dirCount = encadrants.filter(e => e.role === 'directeur').length;
  const respCount = encadrants.filter(e => e.role === 'responsable_service').length;

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Chargement des encadrants…</div>;

  return (
    <div style={{ marginTop: 24 }}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1e293b' }}>👔 Encadrants</h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>
            {dgCount > 0 && <span style={{ marginRight: 10 }}><span style={{ fontWeight: 700, color: '#6b21a8' }}>{dgCount}</span> DG/DGA</span>}
            <span style={{ marginRight: 10 }}><span style={{ fontWeight: 700, color: '#1d4ed8' }}>{dirCount}</span> directeurs</span>
            <span><span style={{ fontWeight: 700, color: '#15803d' }}>{respCount}</span> resp. de service</span>
          </p>
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#475569' }}>
          <RefreshCw size={14} /> Actualiser
        </button>
        <button onClick={() => { setShowADCompare(v => !v); if (!showADCompare && !adGroupsList.length) loadADGroupsList(); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: showADCompare ? '#eff6ff' : '#f8fafc', border: `1px solid ${showADCompare ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, color: showADCompare ? '#1d4ed8' : '#475569' }}>
          Comparer avec liste AD
        </button>
      </div>

      {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13, marginBottom: 16 }}>{error}</div>}
      {saveMsg && <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#15803d', fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{saveMsg}</div>}

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Rechercher un encadrant, direction, service…"
          style={{ flex: 1, minWidth: 220, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
        {(['all', 'dg', 'directeur', 'responsable_service'] as const).map(r => {
          const active = filterRole === r;
          const rc = r === 'dg' ? { bg: '#6b21a8', off: '#faf5ff', border: '#e9d5ff' }
                   : r === 'directeur' ? { bg: '#1d4ed8', off: '#eff6ff', border: '#bfdbfe' }
                   : r === 'responsable_service' ? { bg: '#15803d', off: '#f0fdf4', border: '#bbf7d0' }
                   : { bg: '#2563eb', off: 'white', border: '#e2e8f0' };
          return (
            <button key={r} onClick={() => setFilterRole(r)}
              style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${active ? rc.bg : rc.border}`, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: active ? rc.bg : rc.off, color: active ? 'white' : '#475569' }}>
              {r === 'all' ? 'Tous' : r === 'dg' ? 'DG / DGA' : r === 'directeur' ? 'Directeurs' : 'Resp. service'}
            </button>
          );
        })}
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} affiché{filtered.length > 1 ? 's' : ''}</span>
      </div>

      {/* Tableau */}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Nom', 'Rôle', 'Direction', 'Service', 'Email', 'Téléphones'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => {
              const rc = roleColor(e.role);
              const cur = editPhones[e.matricule] || { pro: '', perso: '' };
              const phoneChanged = cur.pro !== (e.telephone || '') || cur.perso !== (e.telephone_perso || '');
              return (
                <tr key={e.matricule} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 700, color: '#1e293b' }}>{e.prenom} {e.nom}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{e.poste}</div>
                    {e.is_direction_service && <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>• service d'accueil direction</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}>
                      {roleLabel(e.role)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#475569' }}>
                    <div style={{ fontWeight: 600 }}>{e.direction_label}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{e.direction_code}</div>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#475569' }}>
                    {e.is_direction_service
                      ? <span style={{ color: '#7c3aed', fontStyle: 'italic', fontSize: 12 }}>= direction</span>
                      : <><div style={{ fontWeight: 600 }}>{e.service_label}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>{e.service_code}</div></>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {e.email ? (
                      <div>
                        <a href={`mailto:${e.email}`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}>{e.email}</a>
                        {e.email_source === 'manuel' && <span title="Lien manuel" style={{ marginLeft: 5, fontSize: 10, color: '#7c3aed', fontWeight: 700 }}>manuel</span>}
                        {e.ad_phone && <div style={{ fontSize: 11, color: '#64748b' }}>📞 {e.ad_phone}</div>}
                        <button onClick={() => { setADLinkMatricule(e.matricule); setADSearchQ(`${e.prenom} ${e.nom}`); searchAD(`${e.prenom} ${e.nom}`); }}
                          style={{ marginTop: 2, fontSize: 10, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                          Modifier lien AD
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => { setADLinkMatricule(e.matricule); setADSearchQ(`${e.prenom} ${e.nom}`); searchAD(`${e.prenom} ${e.nom}`); }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#92400e' }}>
                        🔍 Lier à l'AD
                      </button>
                    )}
                    {/* Panel de recherche AD inline */}
                    {adLinkMatricule === e.matricule && (
                      <div style={{ marginTop: 8, padding: 12, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', minWidth: 300, position: 'relative', zIndex: 50 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <strong style={{ fontSize: 12, color: '#1e293b' }}>Rechercher dans l'AD</strong>
                          <button onClick={() => { setADLinkMatricule(null); setADSearchQ(''); setADSearchResults([]); }}
                            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>✕</button>
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                          <input value={adSearchQ} onChange={ev => setADSearchQ(ev.target.value)}
                            onKeyDown={ev => ev.key === 'Enter' && searchAD(adSearchQ)}
                            placeholder="Nom, prénom…" autoFocus
                            style={{ flex: 1, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }} />
                          <button onClick={() => searchAD(adSearchQ)} disabled={adSearchLoading}
                            style={{ padding: '6px 12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                            {adSearchLoading ? '…' : '🔍'}
                          </button>
                        </div>
                        {adSearchResults.length > 0 && (
                          <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 6 }}>
                            {adSearchResults.map(r => (
                              <div key={r.username} onClick={() => linkToAD(e.matricule, r)}
                                style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}
                                onMouseEnter={ev => (ev.currentTarget.style.background = '#f0f9ff')}
                                onMouseLeave={ev => (ev.currentTarget.style.background = '')}>
                                <div style={{ fontWeight: 700, color: '#1e293b' }}>{r.displayName}</div>
                                <div style={{ color: '#64748b' }}>{r.email}{r.department ? ` · ${r.department}` : ''}</div>
                                {r.employeeID && <div style={{ fontSize: 10, color: '#94a3b8' }}>Matricule AD : {r.employeeID}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                        {adSearchResults.length === 0 && !adSearchLoading && adSearchQ.length >= 2 && (
                          <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 8 }}>Aucun résultat</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', width: 32 }}>PRO</span>
                        <input
                          value={cur.pro}
                          onChange={ev => setEditPhones(prev => ({ ...prev, [e.matricule]: { ...cur, pro: ev.target.value } }))}
                          onKeyDown={ev => ev.key === 'Enter' && savePhone(e.matricule)}
                          placeholder="01 xx xx xx xx"
                          style={{ width: 120, padding: '4px 7px', border: `1px solid ${cur.pro !== (e.telephone || '') ? '#f59e0b' : '#e2e8f0'}`, borderRadius: 6, fontSize: 12 }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', width: 32 }}>PERSO</span>
                        <input
                          value={cur.perso}
                          onChange={ev => setEditPhones(prev => ({ ...prev, [e.matricule]: { ...cur, perso: ev.target.value } }))}
                          onKeyDown={ev => ev.key === 'Enter' && savePhone(e.matricule)}
                          placeholder="06 xx xx xx xx"
                          style={{ width: 120, padding: '4px 7px', border: `1px solid ${cur.perso !== (e.telephone_perso || '') ? '#f59e0b' : '#e2e8f0'}`, borderRadius: 6, fontSize: 12 }}
                        />
                      </div>
                    </div>
                    {phoneChanged && (
                      <button onClick={() => savePhone(e.matricule)} disabled={saving === e.matricule}
                        style={{ marginTop: 4, padding: '3px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                        {saving === e.matricule ? '…' : '✔ Enregistrer'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Aucun encadrant trouvé.</div>}
      </div>

      {/* Comparaison liste AD */}
      {showADCompare && (
        <div style={{ marginTop: 24, background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap' }}>Comparer avec</h3>
            {loadingGroupsList
              ? <span style={{ fontSize: 13, color: '#94a3b8' }}>Chargement des groupes AD…</span>
              : (
                <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
                  <input
                    placeholder="Filtrer les groupes AD…"
                    value={groupsFilter}
                    onChange={e => setGroupsFilter(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                  />
                  {adGroupsList.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto', marginTop: 2 }}>
                      {adGroupsList
                        .filter(g => !groupsFilter || g.displayName.toLowerCase().includes(groupsFilter.toLowerCase()) || g.cn.toLowerCase().includes(groupsFilter.toLowerCase()))
                        .map(g => (
                          <div key={g.dn} onClick={() => { setSelectedGroupDN(g.dn); setGroupsFilter(g.displayName); loadADGroup(g.dn); }}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: '#1e293b', borderBottom: '1px solid #f1f5f9' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                            onMouseLeave={e => (e.currentTarget.style.background = '')}>
                            <span style={{ fontWeight: 600 }}>{g.displayName}</span>
                            {g.mail && <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>{g.mail}</span>}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            {adGroup.length > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>✓ {adGroup.length} membres chargés</span>}
            {loadingAD && <span style={{ fontSize: 12, color: '#94a3b8' }}>Chargement…</span>}
          </div>

          {adGroup.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Dans RH mais absent de la liste AD */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <AlertTriangle size={16} color="#d97706" />
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#92400e' }}>Dans RH, absent de la liste AD ({absentsAD.length})</span>
                </div>
                {absentsAD.length === 0
                  ? <p style={{ color: '#16a34a', fontSize: 13 }}>✔ Tous les encadrants RH sont dans la liste AD.</p>
                  : absentsAD.map(e => (
                    <div key={e.matricule} style={{ padding: '7px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                      <strong>{e.prenom} {e.nom}</strong> <span style={{ color: '#92400e' }}>({e.direction_label})</span>
                      <br /><span style={{ fontSize: 11, color: '#64748b' }}>{e.email || 'email inconnu'}</span>
                    </div>
                  ))}
              </div>
              {/* Dans la liste AD mais absent du RH */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <UserX size={16} color="#2563eb" />
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#1d4ed8' }}>Dans liste AD, absent du RH ({absentsRH.length})</span>
                </div>
                {absentsRH.length === 0
                  ? <p style={{ color: '#16a34a', fontSize: 13 }}>✔ Tous les membres AD figurent dans le référentiel RH.</p>
                  : absentsRH.map(m => (
                    <div key={m.username} style={{ padding: '7px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                      <strong>{m.displayName}</strong>
                      <br /><span style={{ fontSize: 11, color: '#64748b' }}>{m.email} · {m.title || m.department}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function ParamVille() {
  const { user: _user, token } = useAuth();
  const [selectedTab, setSelectedTab] = useState<'general' | 'elus' | 'sites' | 'ecoles' | 'carte' | 'organisation' | 'encadrants'>('general');

  const [config, setConfig] = useState<VilleConfig>({ nom: '', code_postal: '' });

  const [elus, setElus] = useState<Elu[]>([]);
  const [editingElu, setEditingElu] = useState<Elu | null>(null);
  const [eluForm, setEluForm] = useState<Elu>({ nom: '', prenom: '', role: 'Conseiller municipal' });
  const [eluUploadFile, setEluUploadFile] = useState<File | null>(null);
  const [eluImporting, setEluImporting] = useState(false);
  const [eluImportResult, setEluImportResult] = useState<any>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [sitesLoaded, setSitesLoaded] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [siteForm, setSiteForm] = useState<Site>({ nom: '', adresse: '', is_active: true });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<any>(null);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importedSitesList, setImportedSitesList] = useState<any[]>([]);

  // Sites search / filter / sort / view
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterActif, setFilterActif] = useState<'tous' | 'actifs' | 'inactifs'>('actifs');
  const [filterLocalise, setFilterLocalise] = useState<'tous' | 'localises' | 'non_localises'>('tous');
  // showInactifs est dérivé : on affiche les inactifs dès que le filtre n'est pas 'actifs'
  const showInactifs = filterActif !== 'actifs';
  const [sortKey, setSortKey] = useState<SortKey>('code_bien');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [viewMode, setViewMode] = useState<ViewMode>('liste');
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  // Carte
  const [geocodedSites, setGeocodedSites] = useState<GeocodedSite[]>([]);
  const [geocodingProgress, setGeocodingProgress] = useState(0);
  const [geocodingTotal, setGeocodingTotal] = useState(0);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const geocodingStopRef = useRef(false);
  const [selectedMapSite, setSelectedMapSite] = useState<string | null>(null);
  const [carteFilterCategorie, setCarteFilterCategorie] = useState('');
  const [showInactifsCarte, setShowInactifsCarte] = useState(false);
  const [movingAdminSite, setMovingAdminSite] = useState<Site | null>(null);
  const [movingAdminSaving, setMovingAdminSaving] = useState(false);

  const [ecoles, setEcoles] = useState<Ecole[]>([]);
  const [editingEcole, setEditingEcole] = useState<Ecole | null>(null);
  const [ecoleForm, setEcoleForm] = useState<Ecole>({ nom: '', adresse: '', code_postal: '', email: '', telephone: '', directeur: '' });

  const [loading, setLoading] = useState(false);

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  useEffect(() => {
    if (selectedTab === 'general') loadConfig();
    else if (selectedTab === 'elus') loadElus();
    else if (selectedTab === 'sites') loadSites();
    else if (selectedTab === 'carte') { if (!sitesLoaded) loadSites(); }
    else if (selectedTab === 'ecoles') loadEcoles();
  }, [selectedTab]);

  useEffect(() => {
    if (!sitesLoaded) return;
    const fromDB = sites
      .filter(s => s.code_bien && s.lat != null && s.lng != null)
      .map(s => ({ code: s.code_bien!, nom: s.nom, lat: s.lat!, lng: s.lng!, adresse: s.adresse || '', categorie: s.categorie }));
    setGeocodedSites(fromDB);
  }, [sitesLoaded]);

  // ─── GÉNÉRAL ─────────────────────────────────────────────────────
  const loadConfig = async () => {
    setLoading(true);
    try { const res = await axios.get('/api/ville/config', { headers: getHeaders() }); setConfig(res.data); }
    catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const saveConfig = async () => {
    try {
      await axios.put('/api/ville/config', config, { headers: getHeaders() });
      alert('Configuration mise à jour');
    } catch (error: any) { alert('Erreur: ' + (error.response?.data?.message || error.message)); }
  };

  // ─── ÉLUS ────────────────────────────────────────────────────────
  const loadElus = async () => {
    setLoading(true);
    try { const res = await axios.get('/api/ville/elus', { headers: getHeaders() }); setElus(res.data); }
    catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const saveElu = async () => {
    try {
      if (editingElu?.id) await axios.put(`/api/ville/elus/${editingElu.id}`, eluForm, { headers: getHeaders() });
      else await axios.post('/api/ville/elus', eluForm, { headers: getHeaders() });
      setEditingElu(null);
      setEluForm({ nom: '', prenom: '', role: 'Conseiller municipal' });
      loadElus();
    } catch (error: any) { alert('Erreur: ' + (error.response?.data?.message || error.message)); }
  };

  const deleteElu = async (id: number) => {
    if (!confirm('Confirmer la suppression?')) return;
    try { await axios.delete(`/api/ville/elus/${id}`, { headers: getHeaders() }); loadElus(); }
    catch (error: any) { alert('Erreur: ' + (error.response?.data?.message || error.message)); }
  };

  const importElus = async () => {
    if (!eluUploadFile) { alert('Sélectionner un fichier'); return; }
    setEluImporting(true); setEluImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', eluUploadFile);
      const res = await axios.post('/api/ville/elus/import', fd, {
        headers: { ...getHeaders(), 'Content-Type': 'multipart/form-data' },
      });
      setEluImportResult(res.data);
      setEluUploadFile(null);
      loadElus();
    } catch (error: any) {
      alert('Erreur import: ' + (error.response?.data?.message || error.message));
    } finally {
      setEluImporting(false);
    }
  };

  // ─── SITES ───────────────────────────────────────────────────────
  const loadSites = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/ville/sites', { headers: getHeaders() });
      setSites(res.data);
      setSitesLoaded(true);
    }
    catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const importSites = async () => {
    if (!uploadFile) { alert('Sélectionner un fichier'); return; }
    setIsImporting(true); setImportProgress(0); setImportedSitesList([]);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      const res = await axios.post('/api/ville/sites/import', formData, {
        headers: { ...getHeaders(), 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e: any) => setImportProgress(Math.min(Math.round((e.loaded * 100) / e.total), 90)),
      });
      setImportProgress(100);
      setImportStatus(res.data);
      setUploadFile(null);
      if (res.data.sites?.length > 0) {
        res.data.sites.forEach((site: any, idx: number) => {
          setTimeout(() => setImportedSitesList(prev => [...prev, site]), idx * 30);
        });
      }
      setTimeout(() => { setIsImporting(false); setImportProgress(0); loadSites(); }, 500);
    } catch (error: any) {
      setIsImporting(false); setImportProgress(0);
      alert('Erreur import: ' + (error.response?.data?.message || error.message));
    }
  };

  const saveSite = async () => {
    try {
      if (editingSite?.id) await axios.put(`/api/ville/sites/${editingSite.id}`, siteForm, { headers: getHeaders() });
      setEditingSite(null);
      setSiteForm({ nom: '', adresse: '', is_active: true });
      loadSites();
    } catch (error: any) { alert('Erreur: ' + (error.response?.data?.message || error.message)); }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const toggleCollapse = (code: string) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const collapseAll = () => {
    const siteCodes = sites.filter(s => parseSiteCode(s.code_bien || '').depth === 0).map(s => s.code_bien!).filter(Boolean);
    setCollapsedNodes(new Set(siteCodes));
  };
  const expandAll = () => setCollapsedNodes(new Set());

  // ─── Données dérivées ─────────────────────────────────────────────
  const categories = useMemo(() =>
    [...new Set(sites.map(s => s.categorie).filter(Boolean) as string[])].sort(), [sites]);

  const basePredicate = (site: Site): boolean => {
    if (filterCategorie && site.categorie !== filterCategorie) return false;
    if (filterActif === 'actifs' && !site.is_active) return false;
    if (filterActif === 'inactifs' && site.is_active) return false;
    if (filterLocalise === 'localises' && !(site.lat && site.lng)) return false;
    if (filterLocalise === 'non_localises' && (site.lat && site.lng)) return false;
    return true;
  };

  const searchPredicate = (site: Site): boolean => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (site.code_bien || '').toLowerCase().includes(q)
      || site.nom.toLowerCase().includes(q)
      || (site.categorie || '').toLowerCase().includes(q)
      || (site.adresse || '').toLowerCase().includes(q)
      || (site.abbreviation || '').toLowerCase().includes(q);
  };

  const combinedPredicate = (site: Site) => basePredicate(site) && searchPredicate(site);

  const sitesFiltered = useMemo(() => {
    let result = sites.filter(combinedPredicate);
    return [...result].sort((a, b) => {
      const cmp = getSortValue(a, sortKey).localeCompare(getSortValue(b, sortKey), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [sites, search, filterCategorie, filterActif, filterLocalise, sortKey, sortDir]);

  const { roots: treeRoots, orphans: treeOrphans } = useMemo(() => {
    const filtered = sites.filter(combinedPredicate);
    return buildTree(filtered);
  }, [sites, search, filterCategorie, filterActif, filterLocalise]);

  const treeCount = useMemo(() => {
    const count = (nodes: TreeNode[]): number => nodes.reduce((n, node) => n + 1 + count(node.children), 0);
    return count(treeRoots) + treeOrphans.length;
  }, [treeRoots, treeOrphans]);

  const allSitesSorted = useMemo(() =>
    sites.filter(s => s.code_bien && (showInactifsCarte || s.is_active))
      .sort((a, b) => (a.code_bien || '').localeCompare(b.code_bien || '', undefined, { numeric: true })),
    [sites, showInactifsCarte]);

  const carteCategories = useMemo(() =>
    [...new Set(allSitesSorted.map(s => s.categorie).filter(Boolean) as string[])].sort(), [allSitesSorted]);

  const geocodedSitesFiltered = useMemo(() =>
    carteFilterCategorie ? geocodedSites.filter(s => s.categorie === carteFilterCategorie) : geocodedSites,
    [geocodedSites, carteFilterCategorie]);

  // Statistiques localisation
  const localisedCount = useMemo(() => sites.filter(s => s.lat && s.lng).length, [sites]);

  // ─── CARTE / GÉOCODAGE ───────────────────────────────────────────
  const startGeocoding = async () => {
    geocodingStopRef.current = false;
    setGeocodingProgress(0); setIsGeocoding(true);
    const city = config.nom || 'Ivry-sur-Seine';
    const siteMap = new Map(sites.filter(s => s.code_bien).map(s => [s.code_bien!, s]));
    const toGeocode = sites
      .filter(s => !s.lat || !s.lng)
      .sort((a, b) => (a.code_bien || '').length - (b.code_bien || '').length);
    setGeocodingTotal(toGeocode.length);

    for (let i = 0; i < toGeocode.length; i++) {
      if (geocodingStopRef.current) break;
      const site = toGeocode[i];
      setGeocodingProgress(i + 1);

      let lat: number | null = null;
      let lng: number | null = null;

      if (site.adresse) {
        try {
          const cleanAddr = parseAddress(site.adresse);
          const query = isCentreDeVacances(site) || site.adresse.includes(city)
            ? `${cleanAddr}, France`
            : `${cleanAddr}, ${city}, France`;
          const res = await fetch(
            `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`
          );
          const data = await res.json();
          if (data.features && data.features[0]) {
            const coords = data.features[0].geometry.coordinates;
            lat = coords[1]; lng = coords[0];
          }
        } catch { /* skip */ }
      }

      if (lat == null && site.code_bien) {
        const parsed = parseSiteCode(site.code_bien);
        if (parsed.parentCode) {
          const parent = siteMap.get(parsed.parentCode);
          if (parent?.lat && parent?.lng) { lat = parent.lat; lng = parent.lng; }
        }
      }

      if (lat != null && lng != null) {
        const entry: GeocodedSite = { code: site.code_bien!, nom: site.nom, lat, lng, adresse: site.adresse || '', categorie: site.categorie };
        setGeocodedSites(prev => [...prev.filter(g => g.code !== site.code_bien), entry]);
        setSites(prev => prev.map(s => s.id === site.id ? { ...s, lat, lng } : s));
        if (site.id) {
          await axios.patch(`/api/ville/sites/${site.id}/geocode`, { lat, lng }, { headers: getHeaders() })
            .catch(err => console.warn(`[Géocodage] Échec ${site.code_bien}:`, err.message));
        }
      }
      await new Promise(r => setTimeout(r, 1100));
    }
    setIsGeocoding(false);
  };

  const stopGeocoding = () => { geocodingStopRef.current = true; setIsGeocoding(false); };

  // ─── ÉCOLES ──────────────────────────────────────────────────────
  const loadEcoles = async () => {
    setLoading(true);
    try { const res = await axios.get('/api/ville/ecoles', { headers: getHeaders() }); setEcoles(res.data); }
    catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const saveEcole = async () => {
    try {
      if (editingEcole?.id) await axios.put(`/api/ville/ecoles/${editingEcole.id}`, ecoleForm, { headers: getHeaders() });
      else await axios.post('/api/ville/ecoles', ecoleForm, { headers: getHeaders() });
      setEditingEcole(null);
      setEcoleForm({ nom: '', adresse: '', code_postal: '', email: '', telephone: '', directeur: '' });
      loadEcoles();
    } catch (error: any) { alert('Erreur: ' + (error.response?.data?.message || error.message)); }
  };

  const deleteEcole = async (id: number) => {
    if (!confirm('Confirmer la suppression?')) return;
    try { await axios.delete(`/api/ville/ecoles/${id}`, { headers: getHeaders() }); loadEcoles(); }
    catch (error: any) { alert('Erreur: ' + (error.response?.data?.message || error.message)); }
  };

  // ─── STYLES ──────────────────────────────────────────────────────
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `@keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  const s = {
    container: { padding: '24px', maxWidth: '1400px', margin: '0 auto' },
    title: { fontSize: '28px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px 0' },
    subtitle: { fontSize: '14px', color: '#6b7280', margin: '0 0 32px 0' },
    tabs: { display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '2px solid #e5e7eb' },
    tab: (active: boolean): React.CSSProperties => ({
      padding: '12px 24px', backgroundColor: 'transparent', color: active ? '#0ea5e9' : '#6b7280',
      border: 'none', borderBottom: active ? '2px solid #0ea5e9' : '2px solid transparent',
      cursor: 'pointer', fontWeight: active ? '600' : '500', marginBottom: '-2px', fontSize: '15px',
    }),
    btn: (variant: 'primary' | 'success' | 'danger' | 'warning' = 'primary'): React.CSSProperties => {
      const colors = { primary: '#0ea5e9', success: '#10b981', danger: '#ef4444', warning: '#f59e0b' };
      return { padding: '8px 16px', marginRight: '8px', borderRadius: '6px', border: 'none', backgroundColor: colors[variant], color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '6px' };
    },
    form: { marginBottom: '20px', padding: '20px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#f9fafb' },
    row: { marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px' },
    label: { minWidth: '140px', fontWeight: '600', fontSize: '14px', color: '#374151' },
    input: { padding: '8px 12px', width: '100%', maxWidth: '300px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' as const },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' },
    th: (sortable = false): React.CSSProperties => ({
      padding: '10px 14px', backgroundColor: '#f3f4f6', border: 'none', textAlign: 'left' as const,
      fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb',
      cursor: sortable ? 'pointer' : 'default', userSelect: 'none' as const, whiteSpace: 'nowrap' as const,
    }),
    td: { padding: '10px 14px', border: 'none', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' as const },
    badge: (color: string): React.CSSProperties => ({
      display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '12px',
      fontSize: '11px', fontWeight: '600', backgroundColor: color + '18', color: color, whiteSpace: 'nowrap' as const,
    }),
    select: { padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', backgroundColor: 'white', cursor: 'pointer' },
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronsUpDown size={12} style={{ opacity: 0.4, flexShrink: 0 }} />;
    return sortDir === 'asc' ? <ChevronUp size={12} style={{ flexShrink: 0 }} /> : <ChevronDown size={12} style={{ flexShrink: 0 }} />;
  };

  const CITY_CENTER: [number, number] = [48.8129, 2.3838];

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Header />
    <div style={s.container}>
      <h1 style={s.title}>Paramètres Ville</h1>
      <p style={s.subtitle}>Configuration générale, élus, sites et écoles</p>

      <div style={s.tabs}>
        {(['general', 'elus', 'sites', 'ecoles', 'carte', 'organisation', 'encadrants'] as const).map(tab => (
          <button key={tab} style={s.tab(selectedTab === tab)} onClick={() => setSelectedTab(tab)}>
            {tab === 'general' ? '⚙️ Général' : tab === 'elus' ? '👤 Élus' : tab === 'sites' ? '🏢 Sites' : tab === 'ecoles' ? '🏫 Écoles' : tab === 'carte' ? '🗺️ Carte' : tab === 'organisation' ? '🏛️ Organisation' : '👔 Encadrants'}
          </button>
        ))}
      </div>

      {/* ─── ORGANISATION ────────────────────────────────────────── */}
      {selectedTab === 'organisation' && (
        <div style={{ margin: '0 -24px' }}>
          <AdminOrganisation />
        </div>
      )}

      {/* ─── ENCADRANTS ──────────────────────────────────────────── */}
      {selectedTab === 'encadrants' && <EncadrantsTab token={token} />}

      {/* ─── GÉNÉRAL ─────────────────────────────────────────────── */}
      {selectedTab === 'general' && (
        <div style={s.form}>
          <div style={s.row}>
            <span style={s.label}>Nom de la ville</span>
            <input style={s.input} value={config.nom || ''} onChange={e => setConfig({ ...config, nom: e.target.value })} placeholder="Ivry-sur-Seine" />
          </div>
          <div style={s.row}>
            <span style={s.label}>Code postal</span>
            <input style={s.input} value={config.code_postal || ''} onChange={e => setConfig({ ...config, code_postal: e.target.value })} placeholder="94200" />
          </div>
          <button style={s.btn('primary')} onClick={saveConfig}>Enregistrer</button>
        </div>
      )}

      {/* ─── ÉLUS ────────────────────────────────────────────────── */}
      {selectedTab === 'elus' && (
        <>
          {/* Import Excel */}
          <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="file" accept=".xlsx,.xls" onChange={e => setEluUploadFile(e.target.files?.[0] || null)} disabled={eluImporting}
              style={{ padding: '7px', borderRadius: '6px', border: '1px solid #d1d5db', opacity: eluImporting ? 0.5 : 1 }} />
            <button style={{ ...s.btn('primary'), opacity: eluImporting ? 0.6 : 1 }} onClick={importElus} disabled={eluImporting}>
              <Upload size={15} /> {eluImporting ? 'Import en cours...' : 'Importer Excel'}
            </button>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>Écrase toutes les données existantes</span>
            {eluImportResult && (
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#16a34a' }}>
                ✓ {eluImportResult.imported} élu(s) importé(s)
              </span>
            )}
          </div>

          <button style={s.btn(editingElu ? 'success' : 'primary')} onClick={() => {
            if (editingElu) { setEditingElu(null); setEluForm({ nom: '', prenom: '', role: 'Conseiller municipal' }); }
            else setEditingElu({} as Elu);
          }}>
            {editingElu ? <><X size={16} /> Annuler</> : <><Plus size={16} /> Ajouter un élu</>}
          </button>

          {editingElu !== null && (
            <div style={s.form}>
              {([['Prénom', 'prenom'], ['Nom', 'nom'], ['Email', 'email'], ['Téléphone', 'telephone'], ['Délégation', 'delegation']] as [string, string][]).map(([lbl, key]) => (
                <div key={key} style={s.row}>
                  <span style={s.label}>{lbl}</span>
                  <input style={s.input} type={key === 'email' ? 'email' : 'text'} value={(eluForm as any)[key] || ''} onChange={e => setEluForm({ ...eluForm, [key]: e.target.value })} />
                </div>
              ))}
              <div style={s.row}>
                <span style={s.label}>Rôle</span>
                <select style={s.input} value={eluForm.role} onChange={e => setEluForm({ ...eluForm, role: e.target.value })}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <button style={s.btn('success')} onClick={saveElu}>{editingElu?.id ? 'Enregistrer' : 'Créer'}</button>
            </div>
          )}

          <table style={s.table}>
            <thead><tr>
              {['Nom', 'Rôle', 'Email', 'Téléphone', 'Délégation', 'Actions'].map(h => <th key={h} style={s.th()}>{h}</th>)}
            </tr></thead>
            <tbody>
              {elus.map(e => (
                <tr key={e.id}>
                  <td style={s.td}><strong>{e.prenom} {e.nom}</strong></td>
                  <td style={s.td}><span style={s.badge('#8b5cf6')}>{e.role}</span></td>
                  <td style={s.td}><code style={{ fontSize: '12px' }}>{e.email || '—'}</code></td>
                  <td style={s.td}>{e.telephone || '—'}</td>
                  <td style={s.td}>{e.delegation || '—'}</td>
                  <td style={{ ...s.td, display: 'flex', gap: '6px' }}>
                    <button style={{ ...s.btn('warning'), padding: '5px 9px' }} onClick={() => { setEditingElu(e); setEluForm(e); }}><Edit2 size={15} /></button>
                    <button style={{ ...s.btn('danger'), padding: '5px 9px' }} onClick={() => deleteElu(e.id!)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
              {elus.length === 0 && <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', padding: '30px', color: '#9ca3af' }}>Aucun élu</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {/* ─── SITES ───────────────────────────────────────────────── */}
      {selectedTab === 'sites' && (
        <>
          {/* Import */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ marginBottom: '10px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="file" accept=".xlsx,.xls" onChange={e => setUploadFile(e.target.files?.[0] || null)} disabled={isImporting}
                style={{ padding: '7px', borderRadius: '6px', border: '1px solid #d1d5db', opacity: isImporting ? 0.5 : 1 }} />
              <button style={{ ...s.btn('primary'), opacity: isImporting ? 0.6 : 1 }} onClick={importSites} disabled={isImporting}>
                <Upload size={15} /> {isImporting ? 'Import en cours...' : 'Importer Excel'}
              </button>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>Colonnes : A=Code · B=Désignation · C=Catégorie · D=Abréviation · E-G=Adresse</span>
            </div>
            {isImporting && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <div style={{ flex: 1, height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', backgroundColor: '#0ea5e9', width: `${importProgress}%`, transition: 'width 0.3s ease' }} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#0ea5e9', minWidth: '42px', textAlign: 'right' }}>{importProgress}%</span>
                </div>
                {importedSitesList.length > 0 && (
                  <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '10px', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #86efac' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#16a34a', marginBottom: '6px' }}>Sites importés ({importedSitesList.length})</div>
                    {importedSitesList.map((site: any, idx: number) => (
                      <div key={idx} style={{ fontSize: '12px', color: '#15803d', padding: '4px 8px', backgroundColor: 'white', borderRadius: '4px', borderLeft: '3px solid #22c55e', marginBottom: '3px', animation: 'slideIn 0.3s ease-in-out' }}>
                        <strong>{site.code}</strong> — {site.designation}
                        {site.disabled && <span style={{ color: '#f59e0b', marginLeft: '6px' }}>(désactivé)</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {importStatus && !isImporting && (
              <div style={{ padding: '10px 14px', borderRadius: '6px', backgroundColor: importStatus.errors?.length ? '#fef2f2' : '#f0fdf4' }}>
                <span style={{ color: importStatus.errors?.length ? '#dc2626' : '#16a34a', fontWeight: '600' }}>
                  ✓ {importStatus.imported} importé(s), {importStatus.updated} mis à jour{importStatus.disabled ? `, ${importStatus.disabled} désactivé(s)` : ''}
                </span>
                {importStatus.errors?.length > 0 && (
                  <details style={{ marginTop: '8px' }}>
                    <summary style={{ cursor: 'pointer', color: '#dc2626' }}>Voir les erreurs ({importStatus.errors.length})</summary>
                    <ul style={{ marginTop: '6px', paddingLeft: '18px' }}>
                      {importStatus.errors.map((e: string, i: number) => <li key={i} style={{ color: '#dc2626', fontSize: '12px' }}>{e}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* Barre de contrôle */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
            {/* Recherche */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid #d1d5db', borderRadius: '6px', overflow: 'hidden', flex: '1', minWidth: '200px', maxWidth: '360px' }}>
              <input
                placeholder="Code, nom, catégorie, adresse, abréviation..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setSearch(searchInput)}
                style={{ flex: 1, padding: '8px 12px', border: 'none', outline: 'none', fontSize: '13px' }}
              />
              {searchInput && <button onClick={() => { setSearchInput(''); setSearch(''); }} style={{ padding: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af' }}><X size={14} /></button>}
              <button onClick={() => setSearch(searchInput)} style={{ padding: '8px 12px', border: 'none', borderLeft: '1px solid #d1d5db', background: '#f3f4f6', cursor: 'pointer', color: '#374151' }}><Search size={15} /></button>
            </div>

            {/* Catégorie */}
            <select style={s.select} value={filterCategorie} onChange={e => setFilterCategorie(e.target.value)}>
              <option value="">Toutes catégories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* Actif/inactif */}
            <select style={s.select} value={filterActif} onChange={e => setFilterActif(e.target.value as any)}>
              <option value="tous">Tous</option>
              <option value="actifs">Actifs</option>
              <option value="inactifs">Inactifs</option>
            </select>

            {/* Localisation */}
            <select style={s.select} value={filterLocalise} onChange={e => setFilterLocalise(e.target.value as any)}>
              <option value="tous">📍 Tous ({localisedCount} localisés)</option>
              <option value="localises">📍 Localisés seulement</option>
              <option value="non_localises">Non localisés</option>
            </select>

            {/* Inactifs toggle */}
            <button onClick={() => setFilterActif(v => v === 'actifs' ? 'tous' : 'actifs')}
              style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #d1d5db', background: showInactifs ? '#fef2f2' : 'white', color: showInactifs ? '#ef4444' : '#6b7280', fontSize: '12px', cursor: 'pointer', fontWeight: '500', whiteSpace: 'nowrap' as const }}>
              {showInactifs ? '✕ Masquer inactifs' : '⚠ Afficher inactifs'}
            </button>

            {/* Toggle liste / arborescence */}
            <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
              <button onClick={() => setViewMode('liste')}
                style={{ padding: '7px 12px', border: 'none', background: viewMode === 'liste' ? '#0ea5e9' : 'white', color: viewMode === 'liste' ? 'white' : '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px', fontWeight: 600 }}>
                <List size={14} /> Liste
              </button>
              <button onClick={() => setViewMode('arborescence')}
                style={{ padding: '7px 12px', border: 'none', borderLeft: '1px solid #d1d5db', background: viewMode === 'arborescence' ? '#0ea5e9' : 'white', color: viewMode === 'arborescence' ? 'white' : '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px', fontWeight: 600 }}>
                <Network size={14} /> Arborescence
              </button>
            </div>

            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              {viewMode === 'liste' ? sitesFiltered.length : treeCount} / {sites.length} sites
            </span>
          </div>

          {/* Form édition */}
          {editingSite && (
            <div style={s.form}>
              <div style={s.row}><span style={s.label}>Nom</span><input style={s.input} value={siteForm.nom} onChange={e => setSiteForm({ ...siteForm, nom: e.target.value })} /></div>
              <div style={s.row}><span style={s.label}>Adresse</span><input style={s.input} value={siteForm.adresse || ''} onChange={e => setSiteForm({ ...siteForm, adresse: e.target.value })} /></div>
              <div style={s.row}><label><input type="checkbox" checked={siteForm.is_active} onChange={e => setSiteForm({ ...siteForm, is_active: e.target.checked })} style={{ marginRight: 6 }} />Actif</label></div>
              <button style={s.btn('success')} onClick={saveSite}>Enregistrer</button>
              <button style={s.btn('danger')} onClick={() => setEditingSite(null)}>Annuler</button>
            </div>
          )}

          {/* ── VUE LISTE ─────────────────────────────────────── */}
          {viewMode === 'liste' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead><tr>
                  {([
                    ['code_bien', 'Code'],
                    ['nom', 'Désignation'],
                    ['categorie', 'Catégorie'],
                    ['adresse', 'Adresse'],
                    ['is_active', 'État'],
                  ] as [SortKey, string][]).map(([key, lbl]) => (
                    <th key={key} style={s.th(true)} onClick={() => handleSort(key)}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>{lbl} <SortIcon k={key} /></span>
                    </th>
                  ))}
                  <th style={s.th()}>Type</th>
                  <th style={s.th()}>Abrév.</th>
                  <th style={s.th()}>📍</th>
                  <th style={s.th()}>Actions</th>
                </tr></thead>
                <tbody>
                  {sitesFiltered.map(site => {
                    const parsed = parseSiteCode(site.code_bien || '');
                    const cfg = TYPE_CFG[parsed.type];
                    const isGeo = !!(site.lat && site.lng);
                    return (
                      <tr key={site.id} style={{ background: site.is_active ? 'white' : '#fafafa' }}>
                        <td style={s.td}>
                          <code style={{ fontSize: '12px', background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{site.code_bien || '—'}</code>
                        </td>
                        <td style={s.td}><strong style={{ fontSize: '13px' }}>{site.nom}</strong></td>
                        <td style={s.td}>{site.categorie ? <span style={s.badge('#6366f1')}>{getCategoryEmoji(site.categorie)} {site.categorie}</span> : '—'}</td>
                        <td style={{ ...s.td, color: '#6b7280', fontSize: '12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.adresse || '—'}</td>
                        <td style={s.td}><span style={s.badge(site.is_active ? '#10b981' : '#ef4444')}>{site.is_active ? '✓ Actif' : '✕ Inactif'}</span></td>
                        <td style={s.td}>
                          <span style={{ fontSize: '12px', background: cfg.bg, color: cfg.color, padding: '2px 7px', borderRadius: '4px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {cfg.emoji} {parsed.shortLabel}
                          </span>
                        </td>
                        <td style={{ ...s.td, fontSize: '12px', color: '#475569', fontStyle: 'italic' }}>{site.abbreviation || '—'}</td>
                        <td style={{ ...s.td, textAlign: 'center' }}>
                          {isGeo ? (
                            <span title={`${site.lat?.toFixed(5)}, ${site.lng?.toFixed(5)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'help' }}>
                              <span style={{ color: '#16a34a' }}>📍</span>
                              {site.geocoded_manually && (
                                <span style={{ fontSize: 10, background: '#fef9c3', color: '#92400e', padding: '1px 5px', borderRadius: 8, fontWeight: 700 }}>Manuel</span>
                              )}
                            </span>
                          ) : (
                            <span title="Non localisé" style={{ color: '#d1d5db', cursor: 'help' }}>📍</span>
                          )}
                        </td>
                        <td style={{ ...s.td }}>
                          <button style={{ ...s.btn('warning'), padding: '5px 9px' }} onClick={() => { setEditingSite(site); setSiteForm(site); }}><Edit2 size={14} /></button>
                        </td>
                      </tr>
                    );
                  })}
                  {sitesFiltered.length === 0 && (
                    <tr><td colSpan={9} style={{ ...s.td, textAlign: 'center', padding: '30px', color: '#9ca3af' }}>Aucun résultat</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── VUE ARBORESCENCE ──────────────────────────────── */}
          {viewMode === 'arborescence' && (
            <div>
              {/* Légende + contrôles */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {(Object.entries(TYPE_CFG) as [SiteType, typeof TYPE_CFG[SiteType]][])
                    .filter(([t]) => t !== 'autre')
                    .map(([type, cfg]) => {
                      const labels: Record<SiteType, string> = {
                        site: 'Site', batiment: 'Bâtiment', local: 'Local', ext: 'Extérieur',
                        ext_n: 'Ext. N°', espace_ext: 'Esp. Ext.', terrain: 'Terrain',
                        batiment_ext: 'Bât. Ext.', niveau: 'Niveau', divers_batiment: 'Divers',
                        local_niveau: 'Local/Niv.', divers_niveau: 'Divers/Niv.',
                        local_bat: 'Local/Bât.', section: 'Section', autre: 'Autre',
                      };
                      return (
                        <span key={type} style={{ fontSize: '11px', background: cfg.bg, color: cfg.color, padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                          {cfg.emoji} {labels[type]}
                        </span>
                      );
                    })}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button onClick={expandAll} style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid #d1d5db', background: 'white', fontSize: '12px', cursor: 'pointer', color: '#374151' }}>
                    Tout déplier
                  </button>
                  <button onClick={collapseAll} style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid #d1d5db', background: 'white', fontSize: '12px', cursor: 'pointer', color: '#374151' }}>
                    Tout replier
                  </button>
                </div>
              </div>

              {/* Arbre */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: 'white' }}>
                {/* En-tête */}
                <div style={{ display: 'flex', padding: '8px 10px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', gap: 6 }}>
                  <span style={{ width: 18, flexShrink: 0 }} />
                  <span style={{ width: 20, flexShrink: 0 }}>Type</span>
                  <span style={{ width: 100, flexShrink: 0 }}>Code</span>
                  <span style={{ width: 60, flexShrink: 0 }}>Niveau</span>
                  <span style={{ flex: 1 }}>Désignation</span>
                  <span style={{ width: 70, flexShrink: 0 }}>Abrév.</span>
                  <span style={{ width: 80, flexShrink: 0 }}>Catégorie</span>
                  <span style={{ width: 24, flexShrink: 0 }}>📍</span>
                  <span style={{ width: 50, flexShrink: 0 }}>État</span>
                </div>

                {treeRoots.length === 0 && treeOrphans.length === 0 && (
                  <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Aucun résultat</div>
                )}

                {treeRoots.map(node => (
                  <TreeRow key={node.site.id ?? node.site.code_bien} node={node} depth={0} collapsed={collapsedNodes} onToggle={toggleCollapse} showInactifs={showInactifs} />
                ))}

                {treeOrphans.length > 0 && (
                  <>
                    <div style={{ padding: '6px 10px', background: '#fef3c7', borderTop: '1px solid #fde68a', fontSize: '11px', fontWeight: 700, color: '#92400e' }}>
                      ⚠ Codes non rattachés ({treeOrphans.length})
                    </div>
                    {treeOrphans.map(node => (
                      <TreeRow key={node.site.id ?? node.site.code_bien} node={node} depth={0} collapsed={collapsedNodes} onToggle={toggleCollapse} showInactifs={showInactifs} />
                    ))}
                  </>
                )}
              </div>

              {/* Stats hiérarchie */}
              {(() => {
                const counts: Record<SiteType, number> = { site: 0, batiment: 0, local: 0, ext: 0, ext_n: 0, espace_ext: 0, terrain: 0, batiment_ext: 0, niveau: 0, divers_batiment: 0, local_niveau: 0, divers_niveau: 0, local_bat: 0, section: 0, autre: 0 };
                sites.forEach(s => { const p = parseSiteCode(s.code_bien || ''); counts[p.type]++; });
                return (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(Object.entries(counts) as [SiteType, number][]).filter(([t, n]) => n > 0 && t !== 'autre').map(([type, n]) => {
                      const cfg = TYPE_CFG[type];
                      const LABELS: Record<SiteType, [string, string]> = {
                        site: ['site', 'sites'], batiment: ['bât.', 'bât.'], local: ['local', 'locaux'],
                        ext: ['ext.', 'ext.'], ext_n: ['ext.n°', 'ext.n°'],
                        espace_ext: ['esp.ext.', 'esp.ext.'], terrain: ['terrain', 'terrains'],
                        batiment_ext: ['bât.ext.', 'bât.ext.'], niveau: ['niveau', 'niveaux'],
                        divers_batiment: ['divers', 'divers'], local_niveau: ['local/niv.', 'locaux/niv.'],
                        divers_niveau: ['divers/niv.', 'divers/niv.'],
                        local_bat: ['local/bât.', 'locaux/bât.'], section: ['section', 'sections'],
                        autre: ['autre', 'autres'],
                      };
                      const [sg, pl] = LABELS[type];
                      return (
                        <span key={type} style={{ fontSize: '12px', background: cfg.bg, color: cfg.color, padding: '3px 10px', borderRadius: 6, fontWeight: 600 }}>
                          {cfg.emoji} {n} {n > 1 ? pl : sg}
                        </span>
                      );
                    })}
                    <span style={{ fontSize: '12px', color: '#16a34a', background: '#f0fdf4', padding: '3px 10px', borderRadius: 6, fontWeight: 600 }}>
                      📍 {localisedCount} localisé{localisedCount > 1 ? 's' : ''}
                    </span>
                  </div>
                );
              })()}
            </div>
          )}
        </>
      )}

      {/* ─── ÉCOLES ──────────────────────────────────────────────── */}
      {selectedTab === 'ecoles' && (
        <>
          <button style={s.btn(editingEcole ? 'danger' : 'primary')} onClick={() => {
            if (editingEcole) { setEditingEcole(null); setEcoleForm({ nom: '', adresse: '', code_postal: '', email: '', telephone: '', directeur: '' }); }
            else setEditingEcole({} as Ecole);
          }}>
            {editingEcole ? <><X size={16} /> Annuler</> : <><Plus size={16} /> Ajouter une école</>}
          </button>

          {editingEcole !== null && (
            <div style={s.form}>
              {([['Nom', 'nom'], ['Adresse', 'adresse'], ['Code postal', 'code_postal'], ['Email', 'email'], ['Téléphone', 'telephone'], ['Directeur', 'directeur']] as [string, string][]).map(([lbl, key]) => (
                <div key={key} style={s.row}>
                  <span style={s.label}>{lbl}</span>
                  <input style={s.input} type={key === 'email' ? 'email' : 'text'} value={(ecoleForm as any)[key] || ''} onChange={e => setEcoleForm({ ...ecoleForm, [key]: e.target.value })} />
                </div>
              ))}
              <button style={s.btn('success')} onClick={saveEcole}>{editingEcole?.id ? 'Enregistrer' : 'Créer'}</button>
            </div>
          )}

          <table style={s.table}>
            <thead><tr>
              {['Nom', 'Adresse', 'Code postal', 'Email', 'Directeur', 'Actions'].map(h => <th key={h} style={s.th()}>{h}</th>)}
            </tr></thead>
            <tbody>
              {ecoles.map(e => (
                <tr key={e.id}>
                  <td style={s.td}><strong>{e.nom}</strong></td>
                  <td style={s.td}>{e.adresse || '—'}</td>
                  <td style={s.td}>{e.code_postal || '—'}</td>
                  <td style={s.td}><code style={{ fontSize: '12px' }}>{e.email || '—'}</code></td>
                  <td style={s.td}>{e.directeur || '—'}</td>
                  <td style={{ ...s.td, display: 'flex', gap: '6px' }}>
                    <button style={{ ...s.btn('warning'), padding: '5px 9px' }} onClick={() => { setEditingEcole(e); setEcoleForm(e); }}><Edit2 size={14} /></button>
                    <button style={{ ...s.btn('danger'), padding: '5px 9px' }} onClick={() => deleteEcole(e.id!)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {ecoles.length === 0 && <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', padding: '30px', color: '#9ca3af' }}>Aucune école</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {/* ─── CARTE ───────────────────────────────────────────────── */}
      {selectedTab === 'carte' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', padding: '10px 14px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={15} color="#0ea5e9" />
              <strong style={{ fontSize: '13px', color: '#1e293b' }}>
                Tous les sites — {allSitesSorted.length}{!showInactifsCarte ? ' actifs' : ''}
              </strong>
            </div>

            <button onClick={() => setShowInactifsCarte(v => !v)}
              style={{ padding: '6px 11px', borderRadius: '6px', border: '1px solid #d1d5db', background: showInactifsCarte ? '#fef2f2' : 'white', color: showInactifsCarte ? '#ef4444' : '#6b7280', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>
              {showInactifsCarte ? '✕ Masquer inactifs' : '⚠ Afficher hors service'}
            </button>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {!isGeocoding && geocodedSites.length === 0 && (
                <button style={s.btn('primary')} onClick={startGeocoding}><MapPin size={14} /> Géocoder les sites</button>
              )}
              {isGeocoding && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '120px', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', backgroundColor: '#0ea5e9', width: `${geocodingTotal ? Math.round((geocodingProgress / geocodingTotal) * 100) : 0}%`, transition: 'width 0.5s ease' }} />
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {geocodingProgress}/{geocodingTotal} — {geocodedSites.length} localisés
                    </span>
                  </div>
                  <button style={s.btn('danger')} onClick={stopGeocoding}>Arrêter</button>
                </>
              )}
              {!isGeocoding && geocodedSites.length > 0 && (
                <>
                  <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '600' }}>
                    ✓ {geocodedSites.length} localisés
                    {sites.filter(s => !s.lat).length > 0 && <span style={{ color: '#f59e0b', marginLeft: '6px' }}>({sites.filter(s => !s.lat).length} restants)</span>}
                  </span>
                  <button style={s.btn('warning')} onClick={startGeocoding}>
                    {sites.filter(s => !s.lat).length > 0 ? 'Continuer' : 'Relancer'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '14px', height: 'calc(100vh - 300px)', minHeight: '500px' }}>
            {/* Liste SXXX */}
            <div style={{ width: '270px', flexShrink: 0, display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: 'white', overflow: 'hidden' }}>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', flexShrink: 0 }}>
                <select
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '5px', border: '1px solid #d1d5db', fontSize: '12px', backgroundColor: 'white' }}
                  value={carteFilterCategorie}
                  onChange={e => setCarteFilterCategorie(e.target.value)}
                >
                  <option value="">Toutes catégories ({allSitesSorted.length})</option>
                  {carteCategories.map(c => (
                    <option key={c} value={c}>{getCategoryEmoji(c)} {c} ({allSitesSorted.filter(s => s.categorie === c).length})</option>
                  ))}
                </select>
              </div>

              <div style={{ overflowY: 'auto', flex: 1 }}>
                {allSitesSorted.filter(s => !carteFilterCategorie || s.categorie === carteFilterCategorie).map(site => {
                  const geocoded = geocodedSites.find(g => g.code === site.code_bien);
                  const isSelected = selectedMapSite === site.code_bien;
                  return (
                    <div key={site.id} onClick={() => setSelectedMapSite(isSelected ? null : (site.code_bien || null))}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', backgroundColor: isSelected ? '#eff6ff' : (!site.is_active ? '#fafafa' : 'transparent'), borderLeft: `3px solid ${isSelected ? getCategoryColor(site.categorie) : 'transparent'}`, transition: 'all 0.15s', opacity: site.is_active ? 1 : 0.6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '15px', lineHeight: 1 }}>{getCategoryEmoji(site.categorie)}</span>
                        <code style={{ fontSize: '11px', background: '#f1f5f9', padding: '1px 5px', borderRadius: '3px', fontWeight: '700', color: '#334155' }}>{site.code_bien}</code>
                        {!site.is_active && <span style={{ fontSize: '10px', color: '#ef4444' }}>inactif</span>}
                        <span style={{ marginLeft: 'auto', fontSize: '10px', color: geocoded ? '#10b981' : '#d1d5db', fontWeight: geocoded ? '600' : '400' }}>📍</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#374151', lineHeight: 1.3 }}>{site.nom}</div>
                      {site.adresse && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{site.adresse}</div>}
                    </div>
                  );
                })}
              </div>

              {geocodedSites.length > 0 && (
                <div style={{ borderTop: '1px solid #e2e8f0', padding: '8px 10px', backgroundColor: '#f8fafc', flexShrink: 0, maxHeight: '180px', overflowY: 'auto' }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Légende</div>
                  {carteCategories.map(cat => {
                    const count = geocodedSites.filter(g => g.categorie === cat).length;
                    if (count === 0) return null;
                    const isActive = carteFilterCategorie === cat;
                    return (
                      <div key={cat} onClick={() => setCarteFilterCategorie(isActive ? '' : cat)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px', borderRadius: '4px', cursor: 'pointer', backgroundColor: isActive ? getCategoryColor(cat) + '20' : 'transparent', border: isActive ? `1px solid ${getCategoryColor(cat)}40` : '1px solid transparent', marginBottom: '2px' }}>
                        <span style={{ fontSize: '14px' }}>{getCategoryEmoji(cat)}</span>
                        <span style={{ fontSize: '11px', color: '#475569', flex: 1 }}>{cat}</span>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: getCategoryColor(cat) }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Carte Leaflet */}
            <div style={{ flex: 1, borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', position: 'relative', cursor: movingAdminSite ? 'crosshair' : '' }}>
              {/* Bandeau mode déplacement */}
              {movingAdminSite && (
                <div style={{
                  position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                  zIndex: 1000, background: '#1e293b', color: 'white', padding: '8px 18px',
                  borderRadius: 10, fontSize: 13, fontWeight: 600,
                  boxShadow: '0 4px 16px rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span>📍 Cliquez pour repositionner :</span>
                  <strong style={{ color: '#fbbf24' }}>{movingAdminSite.code_bien} — {movingAdminSite.nom}</strong>
                  {movingAdminSaving && <span style={{ color: '#94a3b8' }}>Enregistrement…</span>}
                  <button onClick={() => setMovingAdminSite(null)} style={{
                    background: 'rgba(255,255,255,.15)', border: 'none', color: 'white',
                    borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 12,
                  }}>✕ Annuler</button>
                </div>
              )}
              <MapContainer center={CITY_CENTER} zoom={14} style={{ height: '100%', width: '100%' }}>
                <TileLayer attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapController selectedCode={selectedMapSite} geocodedSites={geocodedSites} />
                <MapMoveHandler active={!!movingAdminSite} onPick={async (lat, lng) => {
                  if (!movingAdminSite || movingAdminSaving) return;
                  setMovingAdminSaving(true);
                  try {
                    await axios.patch(`/api/ville/sites/${movingAdminSite.id}/geocode`, { lat, lng, manual: true }, { headers: getHeaders() });
                    setSites(prev => prev.map(s => s.id === movingAdminSite.id ? { ...s, lat, lng, geocoded_manually: true } : s));
                    setGeocodedSites(prev => {
                      const existing = prev.find(g => g.code === movingAdminSite.code_bien);
                      if (existing) return prev.map(g => g.code === movingAdminSite.code_bien ? { ...g, lat, lng } : g);
                      return [...prev, { code: movingAdminSite.code_bien!, nom: movingAdminSite.nom, lat, lng, adresse: movingAdminSite.adresse || '', categorie: movingAdminSite.categorie }];
                    });
                  } catch { alert('Erreur lors de l\'enregistrement'); }
                  finally { setMovingAdminSaving(false); setMovingAdminSite(null); }
                }} />
                {geocodedSitesFiltered.map(site => {
                  const fullSite = sites.find(s => s.code_bien === site.code);
                  const isManual = fullSite?.geocoded_manually;
                  return (
                  <Marker key={site.code} position={[site.lat, site.lng]} icon={getCategoryIcon(site.categorie)}>
                    <Popup>
                      <div style={{ minWidth: '180px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '22px' }}>{getCategoryEmoji(site.categorie)}</span>
                          <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontWeight: '700' }}>{site.code}</code>
                          {isManual && <span style={{ fontSize: 10, background: '#fef9c3', color: '#92400e', padding: '1px 5px', borderRadius: 8, fontWeight: 700 }}>📍 Manuel</span>}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>{site.nom}</div>
                        {site.categorie && <div style={{ fontSize: '11px', color: getCategoryColor(site.categorie), fontWeight: '600', marginBottom: '4px' }}>{site.categorie}</div>}
                        {site.adresse && <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px' }}>{site.adresse}</div>}
                        <button
                          onClick={() => { setMovingAdminSite(fullSite || { id: undefined, nom: site.nom, code_bien: site.code, lat: site.lat, lng: site.lng, is_active: true }); }}
                          style={{ width: '100%', padding: '6px', background: '#1e293b', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          ✋ Déplacer ce site
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                  );
                })}
              </MapContainer>

              {/* Overlay filtres */}
              <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000, backgroundColor: 'white', borderRadius: '8px', padding: '10px 12px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)', minWidth: '200px', maxHeight: '60vh', overflowY: 'auto' }}
                onMouseDown={e => e.stopPropagation()}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Catégories</div>
                <div onClick={() => setCarteFilterCategorie('')}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 6px', borderRadius: '5px', cursor: 'pointer', marginBottom: '4px', backgroundColor: !carteFilterCategorie ? '#eff6ff' : 'transparent', fontWeight: !carteFilterCategorie ? '600' : '400' }}>
                  <span style={{ fontSize: '14px' }}>🗺️</span>
                  <span style={{ fontSize: '12px', color: '#334155', flex: 1 }}>Tout afficher</span>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>{geocodedSites.length}</span>
                </div>
                {carteCategories.map(cat => {
                  const count = geocodedSites.filter(g => g.categorie === cat).length;
                  if (count === 0) return null;
                  const isActive = carteFilterCategorie === cat;
                  return (
                    <div key={cat} onClick={() => setCarteFilterCategorie(isActive ? '' : cat)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 6px', borderRadius: '5px', cursor: 'pointer', marginBottom: '2px', backgroundColor: isActive ? getCategoryColor(cat) + '18' : 'transparent', borderLeft: isActive ? `3px solid ${getCategoryColor(cat)}` : '3px solid transparent' }}>
                      <span style={{ fontSize: '16px', lineHeight: 1 }}>{getCategoryEmoji(cat)}</span>
                      <span style={{ fontSize: '12px', color: '#334155', flex: 1 }}>{cat}</span>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: getCategoryColor(cat) }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    </div>
  );
}
