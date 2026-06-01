import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ReactFlow, Background, Controls, MiniMap, MarkerType, useNodesState, useEdgesState } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { SwitchLink, SiteRef } from './types';

type Scope = 'all' | 'intra' | 'inter';

interface Props {
  sites: Map<string, SiteRef>;
  switchLinks: SwitchLink[];
}

interface SwitchNode { id: number; hostname: string; siteId: string | null; ip: string | null; }

const isPlainSite = (s?: string | null): s is string => !!s && !s.trim().startsWith('{');

const POS_KEY = 'reseau_topo_pos';
type PosStore = Record<string, { x: number; y: number }>;
function loadPos(): PosStore {
  try { return JSON.parse(localStorage.getItem(POS_KEY) || '{}'); } catch { return {}; }
}
function savePos(p: PosStore) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* quota */ }
}

/**
 * Topologie réseau au niveau switch : chaque switch = nœud, chaque lien = arête.
 * Les switchs sont regroupés en clusters autour de la position géographique de leur
 * site ; les positions déplacées par l'utilisateur sont mémorisées (localStorage) et
 * réutilisées. Un filtre permet de n'afficher que les liens intra-site ou inter-sites.
 */
function buildGraph(sites: Map<string, SiteRef>, links: SwitchLink[], scope: Scope, saved: PosStore): { nodes: Node[]; edges: Edge[] } {
  // Switchs uniques (par switch_id)
  const sw = new Map<number, SwitchNode>();
  const add = (id?: number | null, hostname?: string | null, siteId?: string | null, ip?: string | null) => {
    if (id == null) return;
    if (!sw.has(id)) sw.set(id, { id, hostname: hostname || `switch-${id}`, siteId: siteId ?? null, ip: ip ?? null });
  };
  links.forEach(l => {
    add(l.local_switch_id, l.local_hostname, l.local_site_id, l.local_ip);
    add(l.remote_switch_id, l.remote_hostname, l.remote_site_id, l.remote_ip);
  });
  const switches = [...sw.values()];

  // Regroupement par site (codes simples)
  const bySite = new Map<string, SwitchNode[]>();
  const orphans: SwitchNode[] = [];
  switches.forEach(s => {
    if (isPlainSite(s.siteId)) {
      if (!bySite.has(s.siteId)) bySite.set(s.siteId, []);
      bySite.get(s.siteId)!.push(s);
    } else orphans.push(s);
  });

  // Bornes géo
  const geoSites = [...bySite.keys()].map(c => sites.get(c)).filter(s => s && s.lat != null && s.lng != null) as SiteRef[];
  const lats = geoSites.map(s => s.lat as number);
  const lngs = geoSites.map(s => s.lng as number);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const W = 1100, H = 760;
  const project = (lat: number, lng: number) => ({
    x: maxLng === minLng ? W / 2 : ((lng - minLng) / (maxLng - minLng)) * W,
    y: maxLat === minLat ? H / 2 : (1 - (lat - minLat) / (maxLat - minLat)) * H,
  });

  const pos = new Map<number, { x: number; y: number }>();
  let noCoordIdx = 0;
  bySite.forEach((members, code) => {
    const site = sites.get(code);
    let center: { x: number; y: number };
    if (site && site.lat != null && site.lng != null) center = project(site.lat as number, site.lng as number);
    else center = { x: W + 140, y: 60 + (noCoordIdx++) * 150 };
    const n = members.length;
    const radius = n === 1 ? 0 : Math.min(40 + n * 6, 110);
    members.forEach((m, i) => {
      const angle = (i / n) * 2 * Math.PI;
      pos.set(m.id, { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
    });
  });
  orphans.forEach(m => {
    pos.set(m.id, { x: W + 360 + Math.floor(noCoordIdx / 8) * 170, y: 60 + (noCoordIdx % 8) * 80 });
    noCoordIdx++;
  });

  // Filtrage des arêtes selon la portée
  const visLinks = links.filter(l => {
    if (l.local_switch_id == null || l.remote_switch_id == null) return false;
    if (scope === 'intra') return l.is_intra_site;
    if (scope === 'inter') return !l.is_intra_site;
    return true;
  });

  // En mode filtré, ne garder que les switchs reliés par une arête visible
  const visibleIds = new Set<string>();
  visLinks.forEach(l => { visibleIds.add(String(l.local_switch_id)); visibleIds.add(String(l.remote_switch_id)); });
  const shownSwitches = scope === 'all' ? switches : switches.filter(s => visibleIds.has(String(s.id)));

  const nodes: Node[] = shownSwitches.map(s => {
    const orphan = !isPlainSite(s.siteId);
    const p = saved[String(s.id)] || pos.get(s.id) || { x: 0, y: 0 };
    return {
      id: String(s.id),
      position: p,
      data: { label: s.hostname.length > 20 ? s.hostname.slice(0, 19) + '…' : s.hostname },
      style: {
        fontSize: 10, fontWeight: 700, borderRadius: 8, padding: 5, width: 130, textAlign: 'center' as const,
        border: `2px solid ${orphan ? '#0f172a' : '#2563eb'}`,
        background: orphan ? '#0f172a' : '#eff6ff',
        color: orphan ? '#fff' : '#1e293b',
      },
    };
  });

  const edges: Edge[] = visLinks.map(l => {
    const color = l.is_intra_site ? '#6366f1' : '#16a34a';
    return {
      id: String(l.id),
      source: String(l.local_switch_id),
      target: String(l.remote_switch_id),
      style: { stroke: color, strokeWidth: l.is_intra_site ? 1.5 : 2.5, opacity: 0.8 },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    };
  });

  return { nodes, edges };
}

const NetworkTopology: React.FC<Props> = ({ sites, switchLinks }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [scope, setScope] = useState<Scope>('all');
  const posRef = useRef<PosStore>(loadPos());

  useEffect(() => {
    const g = buildGraph(sites, switchLinks, scope, posRef.current);
    setNodes(g.nodes);
    setEdges(g.edges);
  }, [sites, switchLinks, scope, setNodes, setEdges]);

  // Mémorise la position d'un nœud déplacé (persistant entre filtres et rechargements)
  const onNodeDragStop = useCallback((_e: unknown, node: Node) => {
    posRef.current[node.id] = node.position;
    savePos(posRef.current);
  }, []);

  const scopeBtn = (s: Scope, label: string) => (
    <button onClick={() => setScope(s)} style={{
      padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
      border: scope === s ? 'none' : '1px solid #e2e8f0',
      background: scope === s ? '#2563eb' : '#fff', color: scope === s ? '#fff' : '#64748b',
    }}>{label}</button>
  );

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      {/* Filtre portée */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000, display: 'flex', gap: 6, background: 'rgba(255,255,255,.95)', borderRadius: 8, padding: 6, boxShadow: '0 2px 8px rgba(0,0,0,.12)' }}>
        {scopeBtn('all', 'Tous')}
        {scopeBtn('intra', 'Intra-site')}
        {scopeBtn('inter', 'Inter-sites')}
      </div>
      {/* Légende / compteurs */}
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, background: 'rgba(255,255,255,.95)', borderRadius: 8, padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,.12)', fontSize: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 4, color: '#0f172a' }}>{nodes.length} switchs · {edges.length} liens</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#374151' }}>
          <span style={{ width: 16, height: 3, background: '#16a34a', display: 'inline-block' }} /> Inter-sites
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#374151' }}>
          <span style={{ width: 16, height: 3, background: '#6366f1', display: 'inline-block' }} /> Intra-site
        </div>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        fitView
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
};

export default NetworkTopology;
