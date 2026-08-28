// ─────────────────────────────────────────────────────────────────────────────
//  Synoptique réseau interactif — onglet « Synoptique » de /reseau.
//
//  Transposition du plan « synoptique-2026.pdf » en carte topologique :
//  zoom / panoramique, déplacement des sites, mise en évidence du voisinage,
//  recherche, filtres, calcul de chemin et analyse d'impact d'une coupure.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Search, ZoomIn, ZoomOut, Maximize2, Save, RotateCcw, Download, Info,
  Route, AlertTriangle, Cable, X, Lock, Unlock, Layers, Radio,
} from 'lucide-react';
import {
  SYN_NODES, SYN_LINKS, SYN_GROUPS, SYN_VIEWBOX,
  type SynNode, type SynLink, type SynCat, type SynKind,
} from './synoptiqueData';
import {
  buildAdjacency, reachable, impactLien, impactSite, pointsCritiques,
  plusCourtChemin, sautsVersCoeur, COEUR_IDS,
} from './synoptiqueGraph';

// ── Palette (reprise de la légende du synoptique d'origine) ───────────────────
const CAT_STYLE: Record<SynCat, { fill: string; stroke: string; text: string; label: string }> = {
  coeur:     { fill: '#fff275', stroke: '#b59f00', text: '#3f3a00', label: 'Cœur de réseau' },
  nord:      { fill: '#9ff2f2', stroke: '#0e7490', text: '#0b3f47', label: 'Boucle Nord' },
  sud:       { fill: '#fbd3ac', stroke: '#c2740c', text: '#5a3406', label: 'Boucle Sud' },
  sudouest:  { fill: '#f4dedb', stroke: '#b4736a', text: '#5c332d', label: 'Boucle Sud-Ouest' },
  linkt:     { fill: '#eaf2dc', stroke: '#79993f', text: '#33421a', label: 'Site Linkt' },
  sfr:       { fill: '#e11d1d', stroke: '#8e1010', text: '#ffffff', label: 'Site SFR' },
  moji:      { fill: '#ffc000', stroke: '#a86b00', text: '#4a2f00', label: 'Moji' },
  operateur: { fill: '#38bdf8', stroke: '#0369a1', text: '#08304a', label: 'Opérateur / datacenter' },
  site:      { fill: '#ffffff', stroke: '#334155', text: '#0f172a', label: 'Site installé' },
};

const KIND_STYLE: Record<SynKind, { color: string; label: string; dash?: string }> = {
  fibre:  { color: '#1e293b', label: 'Fibre optique municipale' },
  cuivre: { color: '#1f4780', label: 'Rocade cuivre (RJ45)' },
  iblo:   { color: '#00a44e', label: 'Fibre cœur de réseau IBLO' },
  moji:   { color: '#f0a500', label: 'Collecte Moji' },
  linkt:  { color: '#93b06a', label: 'Collecte Linkt' },
};

/** Épaisseur du trait en fonction du nombre de brins. */
function epaisseur(l: SynLink): number {
  if (l.kind === 'iblo') return 4.5;
  if (l.media === 'operateur') return 3;
  if (l.brins == null) return 1.8;
  if (l.brins >= 48) return 4;
  if (l.brins >= 24) return 2.8;
  if (l.brins >= 12) return 1.9;
  return 1.3;
}

type Pos = { x: number; y: number };
type Vue = { k: number; tx: number; ty: number };
type Mode = 'explorer' | 'chemin' | 'impact';

const LS_KEY = 'reseau.synoptique.layout';

// ── Utilitaires géométrie ────────────────────────────────────────────────────
function centre(n: SynNode, p: Pos) { return { x: p.x + n.w / 2, y: p.y + n.h / 2 }; }

/** Tracé orthogonal « en coude » entre deux boîtes, ancré sur leurs bords. */
function tracer(a: SynNode, pa: Pos, b: SynNode, pb: Pos) {
  const ca = centre(a, pa), cb = centre(b, pb);
  const dx = cb.x - ca.x, dy = cb.y - ca.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  let p1: Pos, p2: Pos, d: string, mid: Pos;
  if (horizontal) {
    p1 = { x: dx > 0 ? pa.x + a.w : pa.x, y: ca.y };
    p2 = { x: dx > 0 ? pb.x : pb.x + b.w, y: cb.y };
    const mx = (p1.x + p2.x) / 2;
    d = `M ${p1.x} ${p1.y} L ${mx} ${p1.y} L ${mx} ${p2.y} L ${p2.x} ${p2.y}`;
    mid = { x: mx, y: (p1.y + p2.y) / 2 };
  } else {
    p1 = { x: ca.x, y: dy > 0 ? pa.y + a.h : pa.y };
    p2 = { x: cb.x, y: dy > 0 ? pb.y : pb.y + b.h };
    const my = (p1.y + p2.y) / 2;
    d = `M ${p1.x} ${p1.y} L ${p1.x} ${my} L ${p2.x} ${my} L ${p2.x} ${p2.y}`;
    mid = { x: (p1.x + p2.x) / 2, y: my };
  }
  return { d, mid };
}

/** Découpe un libellé en lignes tenant dans la largeur de la boîte. */
function lignes(texte: string, largeur: number, taille: number): string[] {
  const parChar = Math.max(6, Math.floor((largeur - 6) / (taille * 0.53)));
  const mots = texte.split(' ');
  const out: string[] = [];
  let cur = '';
  for (const m of mots) {
    if (!cur) { cur = m; continue; }
    if ((cur + ' ' + m).length <= parChar) cur += ' ' + m;
    else { out.push(cur); cur = m; }
  }
  if (cur) out.push(cur);
  return out.slice(0, 4);
}

export default function SynoptiqueReseau({ isAdmin }: { isAdmin: boolean }) {
  const token = localStorage.getItem('token');
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // ── Disposition ────────────────────────────────────────────────────────────
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [layoutMeta, setLayoutMeta] = useState<{ maj_le: string | null; maj_par: string | null }>({ maj_le: null, maj_par: null });
  const [dirty, setDirty] = useState(false);
  const [verrouille, setVerrouille] = useState(true);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; txt: string } | null>(null);

  // ── Vue ────────────────────────────────────────────────────────────────────
  const [vue, setVue] = useState<Vue>({ k: 0.55, tx: 20, ty: 10 });
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [enPano, setEnPano] = useState(false);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);

  // ── Interaction ────────────────────────────────────────────────────────────
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selLink, setSelLink] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [mode, setMode] = useState<Mode>('explorer');
  const [chemin, setChemin] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [afficherCritiques, setAfficherCritiques] = useState(false);
  const [libellesLiens, setLibellesLiens] = useState(true);
  const [rattachements, setRattachements] = useState(false);
  const [catsMasquees, setCatsMasquees] = useState<Set<SynCat>>(new Set());
  const [kindsMasques, setKindsMasques] = useState<Set<SynKind>>(new Set());
  const [brinsMin, setBrinsMin] = useState(0);

  // ── Chargement de la disposition ───────────────────────────────────────────
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const { data } = await axios.get('/api/network/synoptique/layout', { headers });
        if (annule) return;
        if (data?.positions && Object.keys(data.positions).length) {
          setPositions(data.positions);
          setLayoutMeta({ maj_le: data.maj_le || null, maj_par: data.maj_par || null });
          return;
        }
      } catch { /* pas de disposition serveur : on retombe sur le local */ }
      try {
        const local = localStorage.getItem(LS_KEY);
        if (!annule && local) setPositions(JSON.parse(local));
      } catch { /* ignore */ }
    })();
    return () => { annule = true; };
  }, [headers]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  // ── Données dérivées ───────────────────────────────────────────────────────
  const nodeById = useMemo(() => {
    const m = new Map<string, SynNode>();
    SYN_NODES.forEach(n => m.set(n.id, n));
    return m;
  }, []);

  const pos = useCallback((n: SynNode): Pos => positions[n.id] || { x: n.x, y: n.y }, [positions]);

  /** Liens réellement affichés = liens du plan + éventuels rattachements opérateurs déduits. */
  const liensDeduits = useMemo<SynLink[]>(() => {
    const relies = new Set<string>();
    SYN_LINKS.forEach(l => { relies.add(l.a); relies.add(l.b); });
    const out: SynLink[] = [];
    SYN_NODES.forEach(n => {
      if (relies.has(n.id)) return;
      if (n.cat === 'linkt') out.push({ id: `d-${n.id}`, a: 'linkt-cloud', b: n.id, kind: 'linkt', media: 'operateur', brins: null, label: 'Rattachement Linkt (déduit)', metres: null });
      else if (n.cat === 'sfr') out.push({ id: `d-${n.id}`, a: 'sfr-cloud', b: n.id, kind: 'linkt', media: 'operateur', brins: null, label: 'Rattachement SFR (déduit)', metres: null });
    });
    return out;
  }, []);

  const tousLiens = useMemo(
    () => (rattachements ? [...SYN_LINKS, ...liensDeduits] : SYN_LINKS),
    [rattachements, liensDeduits],
  );

  const adj = useMemo(() => buildAdjacency(SYN_NODES, tousLiens), [tousLiens]);
  const critiques = useMemo(() => pointsCritiques(adj), [adj]);
  const raccordes = useMemo(() => reachable(adj, COEUR_IDS), [adj]);

  const stats = useMemo(() => {
    const brins = SYN_LINKS.reduce((s, l) => s + (l.brins || 0), 0);
    const metres = SYN_LINKS.reduce((s, l) => s + (l.metres || 0), 0);
    const fibres = SYN_LINKS.filter(l => l.media === 'fibre').length;
    const cuivres = SYN_LINKS.filter(l => l.media === 'cuivre').length;
    return { sites: SYN_NODES.length, liens: SYN_LINKS.length, brins, metres, fibres, cuivres };
  }, []);

  // ── Filtres ────────────────────────────────────────────────────────────────
  const liensVisibles = useMemo(() => tousLiens.filter(l => {
    if (kindsMasques.has(l.kind)) return false;
    if (brinsMin > 0 && (l.brins || 0) < brinsMin) return false;
    const na = nodeById.get(l.a), nb = nodeById.get(l.b);
    if (!na || !nb) return false;
    if (catsMasquees.has(na.cat) || catsMasquees.has(nb.cat)) return false;
    return true;
  }), [tousLiens, kindsMasques, brinsMin, catsMasquees, nodeById]);

  const nodesVisibles = useMemo(
    () => SYN_NODES.filter(n => !catsMasquees.has(n.cat)),
    [catsMasquees],
  );

  // ── Sélections calculées ───────────────────────────────────────────────────
  const cheminCalcule = useMemo(() => {
    if (mode !== 'chemin' || !chemin.from || !chemin.to) return null;
    return plusCourtChemin(adj, chemin.from, chemin.to);
  }, [mode, chemin, adj]);

  const impact = useMemo(() => {
    if (mode !== 'impact') return null;
    if (selLink) return { type: 'lien' as const, cible: selLink, isoles: impactLien(adj, selLink) };
    if (selNode) return { type: 'site' as const, cible: selNode, isoles: impactSite(adj, selNode) };
    return null;
  }, [mode, selLink, selNode, adj]);

  const isolesSet = useMemo(() => new Set(impact?.isoles || []), [impact]);

  const voisinage = useMemo(() => {
    const focus = hoverNode || selNode;
    if (!focus) return null;
    const nodes = new Set<string>([focus]);
    const links = new Set<string>();
    (adj.voisins.get(focus) || []).forEach(({ id, link }) => { nodes.add(id); links.add(link.id); });
    return { nodes, links };
  }, [hoverNode, selNode, adj]);

  const surlignes = useMemo(() => {
    if (cheminCalcule) return { nodes: new Set(cheminCalcule.nodes), links: new Set(cheminCalcule.links) };
    return voisinage;
  }, [cheminCalcule, voisinage]);

  const resultatsRecherche = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (q.length < 2) return [];
    return SYN_NODES
      .filter(n => n.name.toLowerCase().includes(q) || (n.note || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [recherche]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const ajuster = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const k = Math.min(el.clientWidth / SYN_VIEWBOX.w, el.clientHeight / SYN_VIEWBOX.h) * 0.97;
    setVue({ k, tx: (el.clientWidth - SYN_VIEWBOX.w * k) / 2, ty: (el.clientHeight - SYN_VIEWBOX.h * k) / 2 });
  }, []);

  useEffect(() => { ajuster(); }, [ajuster]);

  const centrerSur = useCallback((id: string) => {
    const n = nodeById.get(id);
    const el = wrapRef.current;
    if (!n || !el) return;
    const p = positions[id] || { x: n.x, y: n.y };
    const k = Math.max(vue.k, 1);
    setVue({ k, tx: el.clientWidth / 2 - (p.x + n.w / 2) * k, ty: el.clientHeight / 2 - (p.y + n.h / 2) * k });
    setSelNode(id); setSelLink(null);
  }, [nodeById, positions, vue.k]);

  const zoomer = useCallback((facteur: number) => {
    const el = wrapRef.current;
    if (!el) return;
    setVue(v => {
      const k = Math.min(4, Math.max(0.15, v.k * facteur));
      const cx = el.clientWidth / 2, cy = el.clientHeight / 2;
      return { k, tx: cx - (cx - v.tx) * (k / v.k), ty: cy - (cy - v.ty) * (k / v.k) };
    });
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    setVue(v => {
      const k = Math.min(4, Math.max(0.15, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      return { k, tx: mx - (mx - v.tx) * (k / v.k), ty: my - (my - v.ty) * (k / v.k) };
    });
  }, []);

  // ── Panoramique + déplacement de site ──────────────────────────────────────
  const onPointerDownFond = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pan.current = { x: e.clientX, y: e.clientY, tx: vue.tx, ty: vue.ty };
    setEnPano(true);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current) {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - vue.tx) / vue.k - drag.current.dx;
      const y = (e.clientY - r.top - vue.ty) / vue.k - drag.current.dy;
      drag.current.moved = true;
      setPositions(p => ({ ...p, [drag.current!.id]: { x: Math.round(x), y: Math.round(y) } }));
      setDirty(true);
      return;
    }
    if (pan.current) {
      setVue(v => ({ ...v, tx: pan.current!.tx + (e.clientX - pan.current!.x), ty: pan.current!.ty + (e.clientY - pan.current!.y) }));
    }
  };

  const onPointerUp = () => { pan.current = null; drag.current = null; setEnPano(false); };

  const onPointerDownNode = (e: React.PointerEvent, n: SynNode) => {
    e.stopPropagation();
    if (verrouille) return;
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = pos(n);
    drag.current = {
      id: n.id,
      dx: (e.clientX - r.left - vue.tx) / vue.k - p.x,
      dy: (e.clientY - r.top - vue.ty) / vue.k - p.y,
      moved: false,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const cliquerNode = (n: SynNode) => {
    if (drag.current?.moved) return;
    if (mode === 'chemin') {
      setChemin(c => (!c.from || (c.from && c.to)) ? { from: n.id, to: null } : { from: c.from, to: n.id });
      setSelNode(n.id); setSelLink(null);
      return;
    }
    setSelNode(prev => (prev === n.id ? null : n.id));
    setSelLink(null);
  };

  // ── Persistance ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dirty) return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(positions)); } catch { /* quota */ }
  }, [positions, dirty]);

  async function enregistrer() {
    try {
      await axios.put('/api/network/synoptique/layout', { vue: 'default', positions }, { headers });
      setDirty(false);
      setLayoutMeta({ maj_le: new Date().toISOString(), maj_par: 'vous' });
      setMessage({ type: 'ok', txt: 'Disposition enregistrée pour tous les utilisateurs.' });
    } catch (e: unknown) {
      const msg = axios.isAxiosError(e) ? (e.response?.data?.message || e.message) : 'Erreur';
      setMessage({ type: 'err', txt: `Enregistrement impossible : ${msg}` });
    }
  }

  async function reinitialiser() {
    setPositions({});
    setDirty(false);
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    if (isAdmin) {
      try {
        await axios.delete('/api/network/synoptique/layout?vue=default', { headers });
        setLayoutMeta({ maj_le: null, maj_par: null });
      } catch { /* pas bloquant */ }
    }
    setMessage({ type: 'ok', txt: 'Disposition d’origine du synoptique restaurée.' });
  }

  function exporterSvg() {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(SYN_VIEWBOX.w));
    clone.setAttribute('height', String(SYN_VIEWBOX.h));
    clone.setAttribute('viewBox', `0 0 ${SYN_VIEWBOX.w} ${SYN_VIEWBOX.h}`);
    const racine = clone.querySelector('#syn-monde');
    if (racine) racine.setAttribute('transform', 'translate(0,0) scale(1)');
    const fond = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    fond.setAttribute('width', String(SYN_VIEWBOX.w));
    fond.setAttribute('height', String(SYN_VIEWBOX.h));
    fond.setAttribute('fill', '#ffffff');
    clone.insertBefore(fond, clone.firstChild);
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `synoptique-reseau-ivry-${new Date().toISOString().slice(0, 10)}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ── Rendu d'une liaison ────────────────────────────────────────────────────
  function rendreLien(l: SynLink) {
    const a = nodeById.get(l.a), b = nodeById.get(l.b);
    if (!a || !b) return null;
    const { d, mid } = tracer(a, pos(a), b, pos(b));
    const style = KIND_STYLE[l.kind];
    const deduit = l.id.startsWith('d-');
    const actif = !surlignes || surlignes.links.has(l.id);
    const critique = afficherCritiques && critiques.ponts.has(l.id);
    const cible = impact?.type === 'lien' && impact.cible === l.id;
    const selectionne = selLink === l.id;
    const w = epaisseur(l);
    return (
      <g key={l.id} opacity={actif ? 1 : 0.13}>
        {/* zone de clic élargie */}
        <path d={d} stroke="transparent" strokeWidth={Math.max(10, w + 8)} fill="none" style={{ cursor: 'pointer' }}
          onClick={e => { e.stopPropagation(); setSelLink(prev => (prev === l.id ? null : l.id)); setSelNode(null); }} />
        <path
          d={d} fill="none"
          stroke={cible ? '#dc2626' : critique ? '#f97316' : style.color}
          strokeWidth={(selectionne || cible ? w + 2.4 : critique ? w + 1.2 : w)}
          strokeLinejoin="round" strokeLinecap="round"
          strokeDasharray={deduit ? '7 6' : selectionne ? undefined : undefined}
          pointerEvents="none"
        />
        {libellesLiens && l.label && vue.k > 0.42 && (
          <g pointerEvents="none">
            <rect x={mid.x - l.label.length * 2.4 - 3} y={mid.y - 6.5} width={l.label.length * 4.8 + 6} height={13} rx={3}
              fill="#ffffff" opacity={0.88} />
            <text x={mid.x} y={mid.y + 3.4} textAnchor="middle" fontSize={8.6}
              fill={cible ? '#b91c1c' : '#334155'} fontWeight={600}
              fontFamily="system-ui, -apple-system, Segoe UI, sans-serif">{l.label}</text>
          </g>
        )}
      </g>
    );
  }

  // ── Rendu d'un site ────────────────────────────────────────────────────────
  function rendreNode(n: SynNode) {
    const p = pos(n);
    const s = CAT_STYLE[n.cat];
    const actif = !surlignes || surlignes.nodes.has(n.id);
    const selectionne = selNode === n.id;
    const spof = afficherCritiques && critiques.articulations.has(n.id);
    const isole = isolesSet.has(n.id);
    const cibleImpact = impact?.type === 'site' && impact.cible === n.id;
    const depart = chemin.from === n.id, arrivee = chemin.to === n.id;
    const taille = n.w > 100 ? 11 : 9.6;
    const nom = lignes(n.name, n.w, taille);
    const hasNote = !!n.note && n.h > 34;
    const totalH = nom.length * (taille + 1.4) + (hasNote ? 9 : 0);
    const y0 = p.y + n.h / 2 - totalH / 2 + taille * 0.85;

    return (
      <g key={n.id} opacity={actif ? 1 : 0.16}
        style={{ cursor: verrouille ? 'pointer' : 'grab' }}
        onPointerDown={e => onPointerDownNode(e, n)}
        onClick={e => { e.stopPropagation(); cliquerNode(n); }}
        onMouseEnter={() => setHoverNode(n.id)}
        onMouseLeave={() => setHoverNode(h => (h === n.id ? null : h))}
      >
        {(selectionne || depart || arrivee) && (
          <rect x={p.x - 5} y={p.y - 5} width={n.w + 10} height={n.h + 10} rx={8}
            fill="none" stroke={arrivee ? '#7c3aed' : '#2563eb'} strokeWidth={2.5} />
        )}
        {isole && (
          <rect x={p.x - 3} y={p.y - 3} width={n.w + 6} height={n.h + 6} rx={7}
            fill="#fee2e2" stroke="#dc2626" strokeWidth={2} strokeDasharray="4 3" />
        )}
        <rect
          x={p.x} y={p.y} width={n.w} height={n.h} rx={5}
          fill={cibleImpact ? '#dc2626' : s.fill}
          stroke={spof ? '#f97316' : s.stroke}
          strokeWidth={spof ? 2.6 : 1.3}
        />
        <text textAnchor="middle" fontSize={taille} fontWeight={700}
          fill={cibleImpact ? '#ffffff' : s.text} pointerEvents="none"
          fontFamily="system-ui, -apple-system, Segoe UI, sans-serif">
          {nom.map((ligne, i) => (
            <tspan key={i} x={p.x + n.w / 2} y={y0 + i * (taille + 1.4)}>{ligne}</tspan>
          ))}
        </text>
        {hasNote && (
          <text x={p.x + n.w / 2} y={y0 + nom.length * (taille + 1.4) + 1} textAnchor="middle"
            fontSize={7.2} fill={cibleImpact ? '#fee2e2' : s.text} opacity={0.75} pointerEvents="none"
            fontFamily="system-ui, -apple-system, Segoe UI, sans-serif">{n.note}</text>
        )}
        {spof && <circle cx={p.x + n.w - 3} cy={p.y + 3} r={3.6} fill="#f97316" stroke="#fff" strokeWidth={1} />}
      </g>
    );
  }

  // ── Panneau de détail ──────────────────────────────────────────────────────
  const detailNode = selNode ? nodeById.get(selNode) : null;
  const detailLink = selLink ? tousLiens.find(l => l.id === selLink) : null;
  const liaisonsDuSite = detailNode ? (adj.voisins.get(detailNode.id) || []) : [];
  const brinsDuSite = liaisonsDuSite.reduce((s, v) => s + (v.link.brins || 0), 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 330px', gap: 14, height: 'calc(100vh - 250px)', minHeight: 560 }}>
      {/* ══════════════ Plan ══════════════ */}
      <div style={{ position: 'relative', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#f8fafc' }}>
        {/* barre d'outils */}
        <div style={barre}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 8, top: 8, color: '#94a3b8' }} />
            <input
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
              placeholder="Rechercher un site…"
              style={{ ...champ, paddingLeft: 27, width: 190 }}
            />
            {resultatsRecherche.length > 0 && (
              <div style={liste}>
                {resultatsRecherche.map(n => (
                  <button key={n.id} onClick={() => { centrerSur(n.id); setRecherche(''); }} style={ligneListe}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: CAT_STYLE[n.cat].fill, border: `1px solid ${CAT_STYLE[n.cat].stroke}` }} />
                    <span style={{ flex: 1, textAlign: 'left' }}>{n.name}</span>
                    {n.note && <span style={{ fontSize: 10, color: '#94a3b8' }}>{n.note}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span style={sep} />

          <button title="Zoom avant" onClick={() => zoomer(1.25)} style={btnIcone}><ZoomIn size={15} /></button>
          <button title="Zoom arrière" onClick={() => zoomer(1 / 1.25)} style={btnIcone}><ZoomOut size={15} /></button>
          <button title="Ajuster à l'écran" onClick={ajuster} style={btnIcone}><Maximize2 size={15} /></button>

          <span style={sep} />

          <button
            title={verrouille ? 'Déverrouiller pour déplacer les sites' : 'Verrouiller les positions'}
            onClick={() => setVerrouille(v => !v)}
            style={verrouille ? btnIcone : { ...btnIcone, background: '#dbeafe', color: '#1d4ed8', borderColor: '#93c5fd' }}
          >{verrouille ? <Lock size={15} /> : <Unlock size={15} />}</button>
          {isAdmin && (
            <button title="Enregistrer la disposition pour tous" onClick={enregistrer} disabled={!dirty}
              style={{ ...btnIcone, opacity: dirty ? 1 : 0.45, cursor: dirty ? 'pointer' : 'default' }}><Save size={15} /></button>
          )}
          <button title="Restaurer la disposition d'origine" onClick={reinitialiser} style={btnIcone}><RotateCcw size={15} /></button>
          <button title="Exporter en SVG" onClick={exporterSvg} style={btnIcone}><Download size={15} /></button>

          <span style={sep} />

          {([
            ['explorer', 'Explorer'],
            ['chemin', 'Chemin'],
            ['impact', 'Impact'],
          ] as [Mode, string][]).map(([m, lbl]) => (
            <button key={m}
              onClick={() => { setMode(m); setChemin({ from: null, to: null }); }}
              style={mode === m ? btnModeActif : btnMode}>
              {m === 'chemin' ? <Route size={13} /> : m === 'impact' ? <AlertTriangle size={13} /> : <Info size={13} />}
              {lbl}
            </button>
          ))}
        </div>

        {/* bandeau contextuel */}
        {mode === 'chemin' && (
          <div style={bandeau}>
            {!chemin.from ? 'Cliquez le site de départ.'
              : !chemin.to ? `Départ : ${nodeById.get(chemin.from)?.name}. Cliquez le site d’arrivée.`
              : cheminCalcule
                ? `${cheminCalcule.nodes.length - 1} saut(s) — ${cheminCalcule.nodes.map(id => nodeById.get(id)?.name).join(' → ')}`
                : 'Aucun chemin : ces deux sites ne sont pas reliés sur le synoptique.'}
          </div>
        )}
        {mode === 'impact' && (
          <div style={{ ...bandeau, background: impact && impact.isoles.length ? '#fef2f2' : '#f1f5f9', color: impact && impact.isoles.length ? '#991b1b' : '#475569' }}>
            {!impact ? 'Cliquez une liaison ou un site : les sites qui perdraient l’accès au cœur de réseau apparaîtront en rouge.'
              : impact.isoles.length === 0 ? 'Aucune perte de service : le cœur de réseau reste joignable par un autre chemin.'
              : `${impact.isoles.length} site(s) isolé(s) du cœur de réseau : ${impact.isoles.map(id => nodeById.get(id)?.name).join(', ')}`}
          </div>
        )}
        {message && (
          <div style={{ ...bandeau, background: message.type === 'ok' ? '#ecfdf5' : '#fef2f2', color: message.type === 'ok' ? '#065f46' : '#991b1b' }}>
            {message.txt}
          </div>
        )}

        {/* canevas */}
        <div ref={wrapRef} onWheel={onWheel} style={{ position: 'absolute', inset: 0, cursor: enPano ? 'grabbing' : 'default' }}>
          <svg
            ref={svgRef} width="100%" height="100%"
            onPointerDown={onPointerDownFond}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onClick={() => { if (!drag.current?.moved) { setSelNode(null); setSelLink(null); } }}
            style={{ display: 'block', touchAction: 'none', background: '#f8fafc' }}
          >
            <defs>
              <pattern id="syn-grille" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#syn-grille)" />
            <g id="syn-monde" transform={`translate(${vue.tx},${vue.ty}) scale(${vue.k})`}>
              {/* groupes (campus) */}
              {SYN_GROUPS.map(g => (
                <g key={g.id}>
                  <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={10}
                    fill="#eef2f9" stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="7 5" opacity={0.85} />
                  <text x={g.x + 10} y={g.y + 16} fontSize={11} fontWeight={700} fill="#475569"
                    fontFamily="system-ui, -apple-system, Segoe UI, sans-serif">{g.name}</text>
                </g>
              ))}
              {liensVisibles.map(rendreLien)}
              {nodesVisibles.map(rendreNode)}
            </g>
          </svg>
        </div>

        {/* légende */}
        <div style={legende}>
          <div style={{ fontWeight: 700, fontSize: 11, color: '#334155', marginBottom: 5 }}>Légende — cliquez pour masquer</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
            {(Object.keys(CAT_STYLE) as SynCat[]).map(c => (
              <button key={c} onClick={() => setCatsMasquees(s => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; })}
                style={{ ...puce, opacity: catsMasquees.has(c) ? 0.35 : 1 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: CAT_STYLE[c].fill, border: `1px solid ${CAT_STYLE[c].stroke}` }} />
                {CAT_STYLE[c].label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {(Object.keys(KIND_STYLE) as SynKind[]).map(k => (
              <button key={k} onClick={() => setKindsMasques(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
                style={{ ...puce, opacity: kindsMasques.has(k) ? 0.35 : 1 }}>
                <span style={{ width: 16, height: 3, borderRadius: 2, background: KIND_STYLE[k].color }} />
                {KIND_STYLE[k].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════ Panneau latéral ══════════════ */}
      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* chiffres clés */}
        <div style={carte}>
          <h3 style={titreCarte}><Cable size={15} /> Synoptique 2026</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['Sites', stats.sites, '#2563eb'],
              ['Liaisons', stats.liens, '#7c3aed'],
              ['Brins de fibre', stats.brins, '#16a34a'],
              ['Métrage relevé', `${stats.metres.toLocaleString('fr-FR')} m`, '#ea580c'],
            ].map(([lbl, val, c]) => (
              <div key={lbl as string} style={{ background: '#f8fafc', borderRadius: 8, padding: '7px 9px' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: c as string }}>{val}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{lbl}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
            Source : synoptique des liaisons existantes du 23/07/2026.
            {layoutMeta.maj_le && <> Disposition modifiée le {new Date(layoutMeta.maj_le).toLocaleDateString('fr-FR')}{layoutMeta.maj_par ? ` par ${layoutMeta.maj_par}` : ''}.</>}
          </div>
        </div>

        {/* affichage */}
        <div style={carte}>
          <h3 style={titreCarte}><Layers size={15} /> Affichage</h3>
          <label style={caseLigne}>
            <input type="checkbox" checked={libellesLiens} onChange={e => setLibellesLiens(e.target.checked)} />
            Capacités sur les liaisons
          </label>
          <label style={caseLigne}>
            <input type="checkbox" checked={afficherCritiques} onChange={e => setAfficherCritiques(e.target.checked)} />
            Points de défaillance unique (SPOF)
          </label>
          <label style={caseLigne}>
            <input type="checkbox" checked={rattachements} onChange={e => setRattachements(e.target.checked)} />
            <span>Rattachements opérateurs <span style={{ color: '#94a3b8' }}>(déduits)</span></span>
          </label>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
              Capacité minimale : <b>{brinsMin === 0 ? 'toutes' : `${brinsMin} brins`}</b>
            </div>
            <input type="range" min={0} max={48} step={6} value={brinsMin}
              onChange={e => setBrinsMin(Number(e.target.value))} style={{ width: '100%' }} />
          </div>
          {afficherCritiques && (
            <div style={{ fontSize: 10.5, color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 7, padding: '6px 8px', marginTop: 8, lineHeight: 1.5 }}>
              {critiques.articulations.size} site(s) et {critiques.ponts.size} liaison(s) dont la perte coupe une partie du réseau.
            </div>
          )}
          {!verrouille && (
            <div style={{ fontSize: 10.5, color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 7, padding: '6px 8px', marginTop: 8, lineHeight: 1.5 }}>
              Déplacement activé : faites glisser les sites.{' '}
              {isAdmin ? 'Enregistrez pour partager la disposition.' : 'Votre disposition est conservée sur ce poste.'}
            </div>
          )}
        </div>

        {/* détail liaison */}
        {detailLink && (() => {
          const a = nodeById.get(detailLink.a), b = nodeById.get(detailLink.b);
          const isoles = impactLien(adj, detailLink.id);
          return (
            <div style={carte}>
              <h3 style={titreCarte}>
                <span style={{ width: 18, height: 3, borderRadius: 2, background: KIND_STYLE[detailLink.kind].color }} />
                Liaison
                <button onClick={() => setSelLink(null)} style={btnFermer}><X size={13} /></button>
              </h3>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.45 }}>
                {a?.name} <span style={{ color: '#94a3b8' }}>↔</span> {b?.name}
              </div>
              <dl style={dl}>
                <dt style={dt}>Nature</dt><dd style={dd}>{KIND_STYLE[detailLink.kind].label}</dd>
                <dt style={dt}>Capacité</dt><dd style={dd}>{detailLink.label || 'non précisée'}</dd>
                {detailLink.brins != null && (<><dt style={dt}>Brins</dt><dd style={dd}>{detailLink.brins}</dd></>)}
                {detailLink.metres != null && (<><dt style={dt}>Longueur</dt><dd style={dd}>{detailLink.metres} m</dd></>)}
                <dt style={dt}>Criticité</dt>
                <dd style={dd}>
                  {critiques.ponts.has(detailLink.id)
                    ? <span style={{ color: '#c2410c', fontWeight: 700 }}>Liaison critique — aucun secours</span>
                    : <span style={{ color: '#15803d', fontWeight: 700 }}>Secourue par un autre chemin</span>}
                </dd>
              </dl>
              <div style={{ fontSize: 11.5, color: isoles.length ? '#991b1b' : '#475569', background: isoles.length ? '#fef2f2' : '#f8fafc', borderRadius: 7, padding: '7px 9px', lineHeight: 1.5 }}>
                {isoles.length === 0
                  ? 'En cas de coupure, aucun site ne perd l’accès au cœur de réseau.'
                  : <>En cas de coupure, <b>{isoles.length} site(s)</b> perdent l’accès au cœur : {isoles.map(id => nodeById.get(id)?.name).join(', ')}.</>}
              </div>
            </div>
          );
        })()}

        {/* détail site */}
        {detailNode && (
          <div style={carte}>
            <h3 style={titreCarte}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: CAT_STYLE[detailNode.cat].fill, border: `1px solid ${CAT_STYLE[detailNode.cat].stroke}` }} />
              Site
              <button onClick={() => setSelNode(null)} style={btnFermer}><X size={13} /></button>
            </h3>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{detailNode.name}</div>
            {detailNode.note && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{detailNode.note}</div>}
            <dl style={dl}>
              <dt style={dt}>Rôle</dt><dd style={dd}>{CAT_STYLE[detailNode.cat].label}</dd>
              {detailNode.group && (<><dt style={dt}>Campus</dt><dd style={dd}>{SYN_GROUPS.find(g => g.id === detailNode.group)?.name}</dd></>)}
              <dt style={dt}>Liaisons</dt><dd style={dd}>{liaisonsDuSite.length}</dd>
              {brinsDuSite > 0 && (<><dt style={dt}>Brins cumulés</dt><dd style={dd}>{brinsDuSite}</dd></>)}
              <dt style={dt}>Distance au cœur</dt>
              <dd style={dd}>
                {(() => {
                  const s = sautsVersCoeur(adj, detailNode.id);
                  return s == null
                    ? <span style={{ color: '#b45309' }}>non raccordé sur ce plan</span>
                    : s === 0 ? 'cœur de réseau' : `${s} saut(s)`;
                })()}
              </dd>
              {critiques.articulations.has(detailNode.id) && (
                <><dt style={dt}>Criticité</dt><dd style={{ ...dd, color: '#c2410c', fontWeight: 700 }}>Point de défaillance unique</dd></>
              )}
            </dl>
            {liaisonsDuSite.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', margin: '4px 0 5px' }}>Raccordements</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {liaisonsDuSite.map(({ id, link }) => (
                    <button key={link.id} onClick={() => centrerSur(id)} style={ligneLien}>
                      <span style={{ width: 12, height: 3, borderRadius: 2, background: KIND_STYLE[link.kind].color, flexShrink: 0 }} />
                      <span style={{ flex: 1, textAlign: 'left' }}>{nodeById.get(id)?.name}</span>
                      <span style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>
                        {link.label}{link.metres != null ? ` · ${link.metres} m` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {!raccordes.has(detailNode.id) && !COEUR_IDS.includes(detailNode.id) && (
              <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '6px 8px', marginTop: 8, lineHeight: 1.5 }}>
                <Radio size={11} style={{ verticalAlign: -1 }} /> Ce site n’est pas relié au cœur par la fibre municipale : il est desservi par un opérateur ({CAT_STYLE[detailNode.cat].label}).
              </div>
            )}
          </div>
        )}

        {!detailNode && !detailLink && (
          <div style={{ ...carte, color: '#94a3b8', fontSize: 12, lineHeight: 1.6 }}>
            Cliquez un site ou une liaison pour en afficher le détail.<br />
            Molette : zoom · glisser le fond : déplacement · cadenas : déplacer les sites.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const barre: React.CSSProperties = {
  position: 'absolute', top: 8, left: 8, right: 8, zIndex: 3,
  display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
  background: 'rgba(255,255,255,0.96)', border: '1px solid #e2e8f0', borderRadius: 10,
  padding: '6px 8px', boxShadow: '0 1px 3px rgba(15,23,42,0.07)',
};
const bandeau: React.CSSProperties = {
  position: 'absolute', top: 52, left: 8, right: 8, zIndex: 3,
  background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8,
  padding: '6px 10px', fontSize: 11.5, color: '#475569', lineHeight: 1.5,
};
const legende: React.CSSProperties = {
  position: 'absolute', left: 8, bottom: 8, zIndex: 3, maxWidth: 460,
  background: 'rgba(255,255,255,0.96)', border: '1px solid #e2e8f0', borderRadius: 10, padding: '7px 9px',
};
const champ: React.CSSProperties = {
  border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 9px', fontSize: 12, outline: 'none',
};
const liste: React.CSSProperties = {
  position: 'absolute', top: 30, left: 0, width: 250, zIndex: 5,
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 6px 18px rgba(15,23,42,0.12)',
  overflow: 'hidden',
};
const ligneListe: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '6px 9px',
  border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#0f172a',
};
const ligneLien: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '5px 7px',
  border: '1px solid #f1f5f9', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 11.5, color: '#0f172a',
};
const btnIcone: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 26,
  border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', color: '#475569', cursor: 'pointer',
};
const btnMode: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px',
  border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', color: '#64748b',
  fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
};
const btnModeActif: React.CSSProperties = { ...btnMode, background: '#2563eb', color: '#fff', borderColor: '#2563eb' };
const btnFermer: React.CSSProperties = {
  marginLeft: 'auto', border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', padding: 0,
};
const sep: React.CSSProperties = { width: 1, height: 20, background: '#e2e8f0', margin: '0 2px' };
const puce: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 7px',
  border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', fontSize: 10.5, color: '#475569', cursor: 'pointer',
};
const carte: React.CSSProperties = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 13,
};
const titreCarte: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#0f172a',
};
const caseLigne: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: '#475569', padding: '3px 0', cursor: 'pointer',
};
const dl: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', margin: '10px 0', fontSize: 11.5,
};
const dt: React.CSSProperties = { color: '#94a3b8', margin: 0 };
const dd: React.CSSProperties = { color: '#0f172a', margin: 0, fontWeight: 600 };
