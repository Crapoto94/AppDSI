import React, { useEffect } from 'react';
import { ReactFlow, Background, Controls, MiniMap, MarkerType, useNodesState, useEdgesState } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { NetworkLink, SiteRef } from './types';

function edgeColor(link: NetworkLink): string {
  if (link.type === 'OPERATEUR') {
    const c: Record<string, string> = { LINKT: '#f97316', RED: '#ef4444', MOJI: '#8b5cf6' };
    return c[link.operator || ''] || '#64748b';
  }
  if (link.type === 'WAN') return '#3b82f6';
  return '#16a34a'; // FIBRE
}

interface Props {
  sites: Map<string, SiteRef>;
  links: NetworkLink[];
}

/**
 * Topologie réseau : chaque site = nœud, chaque lien = arête.
 * Positionnement : projection des coords lat/lng en pixels ; repli grille pour les sites sans coords.
 */
function buildGraph(sites: Map<string, SiteRef>, links: NetworkLink[]): { nodes: Node[]; edges: Edge[] } {
    // Sites apparaissant dans au moins un lien
    const codes = new Set<string>();
    links.forEach(l => { codes.add(l.site_a); codes.add(l.site_b); });
    const codeList = Array.from(codes);

    // Bornes géographiques pour projeter les coords en pixels
    const geo = codeList.map(c => sites.get(c)).filter(s => s && s.lat != null && s.lng != null) as SiteRef[];
    const lats = geo.map(s => s.lat as number);
    const lngs = geo.map(s => s.lng as number);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const W = 900, H = 620;
    const project = (lat: number, lng: number): { x: number; y: number } => {
      const x = maxLng === minLng ? W / 2 : ((lng - minLng) / (maxLng - minLng)) * W;
      const y = maxLat === minLat ? H / 2 : (1 - (lat - minLat) / (maxLat - minLat)) * H; // y inversé
      return { x, y };
    };

    let fallbackIdx = 0;
    const nodes: Node[] = codeList.map(code => {
      const s = sites.get(code);
      const isCore = code === 'S001' || code === 'S064';
      let pos: { x: number; y: number };
      if (s && s.lat != null && s.lng != null) {
        pos = project(s.lat, s.lng);
      } else {
        // repli : grille à droite
        pos = { x: W + 80, y: 40 + (fallbackIdx++) * 70 };
      }
      return {
        id: code,
        position: pos,
        data: { label: `${code}${s ? `\n${(s.nom || '').slice(0, 22)}` : ''}` },
        style: {
          fontSize: 11, fontWeight: 700, borderRadius: 10, padding: 6, width: 130, textAlign: 'center' as const,
          border: `2px solid ${isCore ? '#0f172a' : '#2563eb'}`,
          background: isCore ? '#0f172a' : '#eff6ff',
          color: isCore ? '#fff' : '#1e293b',
          whiteSpace: 'pre-line' as const,
        },
      };
    });

    const edges: Edge[] = links.map(l => {
      const color = edgeColor(l);
      return {
        id: l.id,
        source: l.site_a,
        target: l.site_b,
        label: [l.type === 'OPERATEUR' ? l.operator : l.type, l.capacity].filter(Boolean).join(' '),
        animated: l.type === 'OPERATEUR',
        style: { stroke: color, strokeWidth: l.is_redundant ? 4 : 2, strokeDasharray: l.type === 'FIBRE' ? undefined : '6 4' },
        labelStyle: { fontSize: 10, fontWeight: 700, fill: color },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.85 },
        markerEnd: { type: MarkerType.ArrowClosed, color },
      };
    });

    return { nodes, edges };
}

const NetworkTopology: React.FC<Props> = ({ sites, links }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // (Re)génère le graphe quand les données changent. Le drag des nœuds est ensuite
  // géré par onNodesChange (les positions persistent entre deux changements de données).
  useEffect(() => {
    const g = buildGraph(sites, links);
    setNodes(g.nodes);
    setEdges(g.edges);
  }, [sites, links, setNodes, setEdges]);

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
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
