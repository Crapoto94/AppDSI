import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { Plus, Edit2, Trash2, Upload, Search, ChevronUp, ChevronDown, ChevronsUpDown, X, MapPin, ChevronRight, List, Network } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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
  abbreviation?: string;
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

// ─── Composant principal ──────────────────────────────────────────────────────
export default function ParamVille() {
  const { user: _user } = useAuth();
  const [selectedTab, setSelectedTab] = useState<'general' | 'elus' | 'sites' | 'ecoles' | 'carte'>('general');

  const [config, setConfig] = useState<VilleConfig>({ nom: '', code_postal: '' });

  const [elus, setElus] = useState<Elu[]>([]);
  const [editingElu, setEditingElu] = useState<Elu | null>(null);
  const [eluForm, setEluForm] = useState<Elu>({ nom: '', prenom: '', role: 'Conseiller municipal' });

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
      .filter(s => s.code_bien && /^S\d{3}$/.test(s.code_bien) && s.lat != null && s.lng != null)
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

  const sitesSXXX = useMemo(() =>
    sites.filter(s => s.code_bien && /^S\d{3}$/.test(s.code_bien) && (showInactifsCarte || s.is_active))
      .sort((a, b) => (a.code_bien || '').localeCompare(b.code_bien || '', undefined, { numeric: true })),
    [sites, showInactifsCarte]);

  const carteCategories = useMemo(() =>
    [...new Set(sitesSXXX.map(s => s.categorie).filter(Boolean) as string[])].sort(), [sitesSXXX]);

  const sitesSXXXFiltered = useMemo(() =>
    carteFilterCategorie ? sitesSXXX.filter(s => s.categorie === carteFilterCategorie) : sitesSXXX,
    [sitesSXXX, carteFilterCategorie]);

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
    const toGeocode = sitesSXXX.filter(s => !s.lat || !s.lng);
    setGeocodingTotal(toGeocode.length);

    for (let i = 0; i < toGeocode.length; i++) {
      if (geocodingStopRef.current) break;
      const site = toGeocode[i];
      setGeocodingProgress(i + 1);
      if (site.adresse) {
        try {
          const cleanAddr = parseAddress(site.adresse);
          const cityPart = isCentreDeVacances(site) ? '' : `, ${city}`;
          const query = `${cleanAddr}${cityPart}, France`;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
            { headers: { 'User-Agent': 'AppDSI-Ville/1.0' } }
          );
          const data = await res.json();
          if (data[0]) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            const entry: GeocodedSite = { code: site.code_bien!, nom: site.nom, lat, lng, adresse: site.adresse || '', categorie: site.categorie };
            setGeocodedSites(prev => [...prev.filter(g => g.code !== site.code_bien), entry]);
            setSites(prev => prev.map(s => s.id === site.id ? { ...s, lat, lng } : s));
            if (site.id) {
              axios.patch(`/api/ville/sites/${site.id}/geocode`, { lat, lng }, { headers: getHeaders() })
                .catch(err => console.warn(`[Géocodage] Échec ${site.code_bien}:`, err.message));
            }
          }
        } catch { /* skip */ }
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
    <div style={s.container}>
      <h1 style={s.title}>Paramètres Ville</h1>
      <p style={s.subtitle}>Configuration générale, élus, sites et écoles</p>

      <div style={s.tabs}>
        {(['general', 'elus', 'sites', 'ecoles', 'carte'] as const).map(tab => (
          <button key={tab} style={s.tab(selectedTab === tab)} onClick={() => setSelectedTab(tab)}>
            {tab === 'general' ? '⚙️ Général' : tab === 'elus' ? '👤 Élus' : tab === 'sites' ? '🏢 Sites' : tab === 'ecoles' ? '🏫 Écoles' : '🗺️ Carte'}
          </button>
        ))}
      </div>

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
                          {isGeo
                            ? <span title={`${site.lat?.toFixed(5)}, ${site.lng?.toFixed(5)}`} style={{ color: '#16a34a', cursor: 'help' }}>📍</span>
                            : <span style={{ color: '#d1d5db' }}>—</span>}
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
                Sites principaux (SXXX) — {sitesSXXX.length}{!showInactifsCarte ? ' actifs' : ''}
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
                    {sitesSXXX.filter(s => !s.lat).length > 0 && <span style={{ color: '#f59e0b', marginLeft: '6px' }}>({sitesSXXX.filter(s => !s.lat).length} restants)</span>}
                  </span>
                  <button style={s.btn('warning')} onClick={startGeocoding}>
                    {sitesSXXX.filter(s => !s.lat).length > 0 ? 'Continuer' : 'Relancer'}
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
                  <option value="">Toutes catégories ({sitesSXXX.length})</option>
                  {carteCategories.map(c => (
                    <option key={c} value={c}>{getCategoryEmoji(c)} {c} ({sitesSXXX.filter(s => s.categorie === c).length})</option>
                  ))}
                </select>
              </div>

              <div style={{ overflowY: 'auto', flex: 1 }}>
                {sitesSXXXFiltered.map(site => {
                  const geocoded = geocodedSites.find(g => g.code === site.code_bien);
                  const isSelected = selectedMapSite === site.code_bien;
                  return (
                    <div key={site.id} onClick={() => setSelectedMapSite(isSelected ? null : (site.code_bien || null))}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', backgroundColor: isSelected ? '#eff6ff' : (!site.is_active ? '#fafafa' : 'transparent'), borderLeft: `3px solid ${isSelected ? getCategoryColor(site.categorie) : 'transparent'}`, transition: 'all 0.15s', opacity: site.is_active ? 1 : 0.6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '15px', lineHeight: 1 }}>{getCategoryEmoji(site.categorie)}</span>
                        <code style={{ fontSize: '11px', background: '#f1f5f9', padding: '1px 5px', borderRadius: '3px', fontWeight: '700', color: '#334155' }}>{site.code_bien}</code>
                        {!site.is_active && <span style={{ fontSize: '10px', color: '#ef4444' }}>inactif</span>}
                        {geocoded
                          ? <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#10b981', fontWeight: '600' }}>📍</span>
                          : <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#cbd5e1' }}>—</span>}
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
            <div style={{ flex: 1, borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', position: 'relative' }}>
              <MapContainer center={CITY_CENTER} zoom={14} style={{ height: '100%', width: '100%' }}>
                <TileLayer attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapController selectedCode={selectedMapSite} geocodedSites={geocodedSites} />
                {geocodedSitesFiltered.map(site => (
                  <Marker key={site.code} position={[site.lat, site.lng]} icon={getCategoryIcon(site.categorie)}>
                    <Popup>
                      <div style={{ minWidth: '180px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '22px' }}>{getCategoryEmoji(site.categorie)}</span>
                          <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontWeight: '700' }}>{site.code}</code>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>{site.nom}</div>
                        {site.categorie && <div style={{ fontSize: '11px', color: getCategoryColor(site.categorie), fontWeight: '600', marginBottom: '4px' }}>{site.categorie}</div>}
                        {site.adresse && <div style={{ fontSize: '11px', color: '#64748b' }}>{site.adresse}</div>}
                      </div>
                    </Popup>
                  </Marker>
                ))}
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
  );
}
