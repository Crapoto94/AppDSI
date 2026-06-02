import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';

// Aperçu zoomable / déplaçable d'un plan DXF (coordonnées DXF brutes [x,y]).
// Clic = sélection d'un point ; molette = zoom ; glisser = déplacement.

interface RawEntite {
  type: string;
  geojson: any; // Feature en coordonnées DXF [x,y]
  couleur?: string;
  epaisseur?: number;
}

interface Props {
  layers: Record<string, RawEntite[]>;
  selected: Set<string>;
  /** Points déjà calés (en coordonnées DXF) — affichés avec leur n°. */
  picked: { dxfX: number; dxfY: number }[];
  /** Point en cours de saisie (orange). */
  pending: { dxfX: number; dxfY: number } | null;
  onPick: (dxfX: number, dxfY: number) => void;
  height?: number;
}

interface View { scale: number; ox: number; oy: number } // screen = dxf*scale + o (Y inversé)

const DxfCanvas: React.FC<Props> = ({ layers, selected, picked, pending, onPick, height = 320 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | null>(null);
  const [size, setSize] = useState({ w: 400, h: height });
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // Entités visibles aplaties
  const entities = useMemo(() => {
    const out: RawEntite[] = [];
    for (const [calque, ents] of Object.entries(layers)) {
      if (!selected.has(calque)) continue;
      out.push(...ents);
    }
    return out;
  }, [layers, selected]);

  // Bounds des données DXF
  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const walk = (c: any) => {
      if (typeof c[0] === 'number') {
        if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0];
        if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1];
      } else c.forEach(walk);
    };
    for (const e of entities) walk(e.geojson.geometry.coordinates);
    if (!isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  }, [entities]);

  // Mesure du conteneur
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(100, r.width), h: height });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [height]);

  // Vue initiale : ajuster aux bounds
  const fitView = useCallback((): View | null => {
    if (!bounds) return null;
    const pad = 24;
    const dw = bounds.maxX - bounds.minX || 1;
    const dh = bounds.maxY - bounds.minY || 1;
    const scale = Math.min((size.w - pad * 2) / dw, (size.h - pad * 2) / dh);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    return { scale, ox: size.w / 2 - cx * scale, oy: size.h / 2 + cy * scale };
  }, [bounds, size]);

  useEffect(() => { setView(fitView()); }, [fitView]);

  // Conversions
  const toScreen = (x: number, y: number, v: View) => [x * v.scale + v.ox, -y * v.scale + v.oy];
  const toDxf = (sx: number, sy: number, v: View) => [(sx - v.ox) / v.scale, -(sy - v.oy) / v.scale];

  // Rendu
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !view) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr; cv.height = size.h * dpr;
    cv.style.width = size.w + 'px'; cv.style.height = size.h + 'px';
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, size.w, size.h);

    for (const e of entities) {
      const g = e.geojson.geometry;
      ctx.strokeStyle = e.couleur && e.couleur !== '#000000' ? e.couleur : '#64ffda';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 1;
      const drawLine = (pts: number[][]) => {
        ctx.beginPath();
        pts.forEach((p, i) => {
          const [sx, sy] = toScreen(p[0], p[1], view);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      };
      const props = e.geojson.properties || {};
      if (props.type === 'text' && g.type === 'Point') {
        // Étiquette texte (TEXT / MTEXT)
        const [sx, sy] = toScreen(g.coordinates[0], g.coordinates[1], view);
        if (sx < -200 || sy < -200 || sx > size.w + 200 || sy > size.h + 200) continue;
        const fs = Math.max(8, Math.min(22, (props.height || 0) * view.scale || 11));
        ctx.save();
        ctx.translate(sx, sy);
        if (props.rotation) ctx.rotate((-props.rotation * Math.PI) / 180);
        ctx.fillStyle = '#fbbf24';
        ctx.font = `${fs}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(props.text || '', 0, 0);
        ctx.restore();
      } else if (g.type === 'LineString') drawLine(g.coordinates);
      else if (g.type === 'Polygon') { g.coordinates.forEach((ring: number[][]) => { drawLine(ring); ctx.closePath(); ctx.stroke(); }); }
      else if (g.type === 'Point') {
        const [sx, sy] = toScreen(g.coordinates[0], g.coordinates[1], view);
        ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Marqueurs des points calés
    const marker = (x: number, y: number, color: string, label?: string) => {
      const [sx, sy] = toScreen(x, y, view);
      ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      if (label) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, sx, sy - 12);
      }
    };
    picked.forEach((p, i) => marker(p.dxfX, p.dxfY, '#2563eb', `#${i + 1}`));
    if (pending) marker(pending.dxfX, pending.dxfY, '#f59e0b');
  }, [entities, view, size, picked, pending]);

  // Interactions
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!view) return;
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const [dx, dy] = toDxf(mx, my, view);
    const ns = view.scale * factor;
    setView({ scale: ns, ox: mx - dx * ns, oy: my + dy * ns });
  }, [view]);

  const onMouseDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX, y: e.clientY, moved: false }; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current || !view) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.current.moved = true;
    if (drag.current.moved) {
      setView(v => v && ({ ...v, ox: v.ox + dx, oy: v.oy + dy }));
      drag.current.x = e.clientX; drag.current.y = e.clientY;
    }
  };
  const onMouseUp = (e: React.MouseEvent) => {
    if (drag.current && !drag.current.moved && view) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const [dx, dy] = toDxf(e.clientX - rect.left, e.clientY - rect.top, view);
      onPick(dx, dy);
    }
    drag.current = null;
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      {!bounds && (
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b1220', color: '#64748b', fontSize: 12, borderRadius: 8 }}>
          Aucune entité dans les calques sélectionnés
        </div>
      )}
      <canvas
        ref={canvasRef}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { drag.current = null; }}
        style={{ display: bounds ? 'block' : 'none', borderRadius: 8, cursor: 'crosshair', touchAction: 'none' }}
      />
      <div style={{ position: 'absolute', bottom: 6, left: 8, fontSize: 10, color: '#94a3b8', pointerEvents: 'none' }}>
        molette = zoom · glisser = déplacer · clic = point
      </div>
    </div>
  );
};

export default DxfCanvas;
