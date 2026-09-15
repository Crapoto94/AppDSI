/**
 * SiteSelectField — Champ de sélection d'un site (hub.sites) réutilisable.
 * Charge la liste des sites (/api/ville/sites/list), filtre en local
 * (insensible aux accents), affiche un dropdown et supporte le clavier.
 */
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

export interface SiteItem {
  id: number;
  code_bien: string | null;
  nom: string;
  abbreviation: string | null;
  categorie: string | null;
}

interface SiteSelectFieldProps {
  token?: string | null;
  /** Appelé quand un site de la liste est sélectionné */
  onSelect: (site: SiteItem) => void;
  /** Appelé quand l'utilisateur efface la sélection */
  onClear?: () => void;
  /** Appelé à chaque frappe (pour refléter la saisie en direct dans le formulaire) */
  onQueryChange?: (q: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Valeur initiale affichée au montage (pré-remplissage, ex: édition d'un ticket) */
  initialValue?: string;
  /** Icône affichée à gauche dans le champ (ex: MapPin) */
  icon?: React.ReactNode;
  /** Style compact (padding réduit) */
  compact?: boolean;
  /** Style du champ, fusionné au style par défaut */
  inputStyle?: React.CSSProperties;
  /** Style du dropdown, fusionné au style par défaut */
  dropdownStyle?: React.CSSProperties;
  /** Nombre max de résultats affichés (défaut 50) */
  maxResults?: number;
  /** Afficher l'abréviation du site dans les résultats */
  showAbbreviation?: boolean;
  disabled?: boolean;
  /** Afficher le bouton ✕ pour effacer */
  clearable?: boolean;
}

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const baseInputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};

const baseDropdownStyle: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, marginTop: 4,
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 250, overflow: 'auto',
};

export default function SiteSelectField({
  token,
  onSelect,
  onClear,
  onQueryChange,
  placeholder = 'Rechercher un site…',
  autoFocus,
  initialValue,
  icon,
  compact = false,
  inputStyle,
  dropdownStyle,
  maxResults = 50,
  showAbbreviation = true,
  disabled = false,
  clearable = true,
}: SiteSelectFieldProps) {
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [query, setQuery] = useState(initialValue || '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const auth = token ?? localStorage.getItem('token');
    axios.get('/api/ville/sites/list', { headers: { Authorization: `Bearer ${auth}` } })
      .then(res => { if (!cancelled) setSites(res.data || []); })
      .catch(() => { /* silencieux */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.children[activeIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const q = normalize(query.trim());
  const filtered = q
    ? sites.filter(s => normalize(`${s.code_bien || ''} ${s.nom} ${s.abbreviation || ''}`).includes(q))
    : sites;
  const shown = filtered.slice(0, maxResults);
  const hiddenCount = filtered.length - shown.length;

  const siteLabel = (s: SiteItem) => (s.code_bien ? `${s.code_bien} — ${s.nom}` : s.nom);

  const selectSite = (s: SiteItem) => {
    setQuery(siteLabel(s));
    setOpen(false);
    setActiveIndex(-1);
    onSelect(s);
  };

  const handleClear = () => {
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
    onClear?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const resultsOpen = open && shown.length > 0;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      if (shown.length > 0) setActiveIndex(prev => (prev + 1) % shown.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (shown.length > 0) setActiveIndex(prev => (prev <= 0 ? shown.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      if (resultsOpen && activeIndex >= 0 && shown[activeIndex]) {
        e.preventDefault();
        selectSite(shown[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const mergedInputStyle: React.CSSProperties = {
    ...baseInputStyle,
    ...inputStyle,
    padding: inputStyle?.padding ?? (compact ? '5px 8px' : '10px 14px'),
    paddingLeft: icon ? 36 : 12,
    paddingRight: clearable && query ? 32 : 12,
  };

  const showDropdown = open && !disabled && shown.length > 0;
  const selectedIndex = activeIndex;

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {icon && (
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none', display: 'flex' }}>
          {icon}
        </span>
      )}
      <input
        type="text"
        value={query}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIndex(-1); onQueryChange?.(e.target.value); }}
        onFocus={() => { setOpen(true); if (shown.length > 0 && activeIndex < 0) setActiveIndex(0); }}
        onKeyDown={handleKeyDown}
        style={mergedInputStyle}
      />
      {clearable && query && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          title="Effacer"
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8',
            fontSize: 14, padding: 2, lineHeight: 1,
          }}>
          ✕
        </button>
      )}
      {showDropdown && (
        <div ref={listRef} style={{ ...baseDropdownStyle, ...dropdownStyle }}>
          {shown.map((s, i) => (
            <div
              key={s.id}
              onMouseDown={(e) => { e.preventDefault(); selectSite(s); }}
              onMouseEnter={() => setActiveIndex(i)}
              style={{
                padding: compact ? '6px 10px' : '9px 12px',
                cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                display: 'flex', alignItems: 'center', gap: 8,
                background: i === selectedIndex ? '#eff6ff' : '#fff',
              }}>
              <span style={{ fontFamily: 'monospace', fontSize: compact ? 10 : 11, color: '#6366f1', fontWeight: 600, flexShrink: 0 }}>
                {s.code_bien || '—'}
              </span>
              <span style={{ color: '#1e293b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: compact ? 12 : 13 }}>
                {s.nom}
              </span>
              {showAbbreviation && s.abbreviation && (
                <span style={{ fontSize: compact ? 10 : 11, color: '#94a3b8', flexShrink: 0 }}>{s.abbreviation}</span>
              )}
            </div>
          ))}
          {hiddenCount > 0 && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
              {hiddenCount} autre{hiddenCount > 1 ? 's' : ''} — affinez la recherche
            </div>
          )}
        </div>
      )}
      {open && !disabled && shown.length === 0 && !loading && query.trim() && (
        <div style={baseDropdownStyle as React.CSSProperties}>
          <div style={{ padding: '9px 12px', fontSize: 13, color: '#94a3b8' }}>Aucun site trouvé</div>
        </div>
      )}
    </div>
  );
}