import React, { useRef, useState, useCallback, useEffect } from 'react';

export interface CanvasItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

interface Props {
  items: CanvasItem[];
  onChange: (items: CanvasItem[]) => void;
  disabled?: boolean;
  containerWidth?: (w: number) => void; // callback to report width
  children: (item: CanvasItem, index: number, containerW: number) => React.ReactNode;
}

const SNAP = 20;        // snap grid in pixels
const MIN_W = 160;
const MIN_H = 80;

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const HANDLE_CURSORS: Record<Handle, string> = {
  n: 'n-resize', s: 's-resize', e: 'e-resize', w: 'w-resize',
  ne: 'ne-resize', nw: 'nw-resize', se: 'se-resize', sw: 'sw-resize',
};

const snap = (v: number) => Math.round(v / SNAP) * SNAP;

export default function CanvasGrid({ items, onChange, disabled, containerWidth: onContainerWidth, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(1200);
  const [dragging, setDragging] = useState<{ idx: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [resizing, setResizing] = useState<{ idx: number; handle: Handle; startX: number; startY: number; orig: CanvasItem } | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      setCw(w);
      onContainerWidth?.(w);
    });
    ro.observe(containerRef.current);
    const w = containerRef.current.clientWidth;
    setCw(w);
    onContainerWidth?.(w);
    return () => ro.disconnect();
  }, []);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent, idx: number) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const it = itemsRef.current[idx];
    setDragging({ idx, startX: e.clientX, startY: e.clientY, origX: it.x, origY: it.y });
  }, [disabled]);

  // ── Resize ────────────────────────────────────────────────────────────────
  const onResizeStart = useCallback((e: React.MouseEvent, idx: number, handle: Handle) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setResizing({ idx, handle, startX: e.clientX, startY: e.clientY, orig: { ...itemsRef.current[idx] } });
  }, [disabled]);

  // ── Mouse move / up ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!dragging && !resizing) return;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - (dragging || resizing)!.startX;
      const dy = e.clientY - (dragging || resizing)!.startY;

      if (dragging) {
        const newX = Math.max(0, dragging.origX + dx);
        const newY = Math.max(0, dragging.origY + dy);
        const cur = itemsRef.current[dragging.idx];
        if (newX === cur.x && newY === cur.y) return;
        onChange(itemsRef.current.map((it, i) =>
          i === dragging.idx ? { ...it, x: newX, y: newY } : it
        ));
      }

      if (resizing) {
        const { orig, handle } = resizing;
        const minW = orig.minW ?? MIN_W;
        const minH = orig.minH ?? MIN_H;
        let { x, y, w, h } = orig;
        if (handle.includes('e')) w = Math.max(minW, orig.w + dx);
        if (handle.includes('s')) h = Math.max(minH, orig.h + dy);
        if (handle.includes('w')) { const nw = Math.max(minW, orig.w - dx); x = orig.x + (orig.w - nw); w = nw; }
        if (handle.includes('n')) { const nh = Math.max(minH, orig.h - dy); y = orig.y + (orig.h - nh); h = nh; }
        const cur = itemsRef.current[resizing.idx];
        if (x === cur.x && y === cur.y && w === cur.w && h === cur.h) return;
        onChange(itemsRef.current.map((it, i) =>
          i === resizing.idx ? { ...it, x, y, w, h } : it
        ));
      }
    };

    const onUp = () => {
      // Snap to grid on release
      if (dragging) {
        const idx = dragging.idx;
        onChange(itemsRef.current.map((it, i) =>
          i === idx ? { ...it, x: snap(it.x), y: snap(it.y) } : it
        ));
      }
      if (resizing) {
        const idx = resizing.idx;
        onChange(itemsRef.current.map((it, i) =>
          i === idx ? { ...it, x: snap(it.x), y: snap(it.y), w: snap(it.w), h: snap(it.h) } : it
        ));
      }
      setDragging(null);
      setResizing(null);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragging, resizing, onChange]);

  const canvasHeight = items.reduce((m, it) => Math.max(m, it.y + it.h), 0) + 60;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: canvasHeight,
        // Dot grid background
        backgroundImage: `radial-gradient(circle, #cbd5e1 1px, transparent 1px)`,
        backgroundSize: `${SNAP}px ${SNAP}px`,
        borderRadius: 8,
      }}
    >
      {items.map((item, idx) => (
        <CanvasItemWrapper
          key={item.i}
          item={item}
          disabled={disabled}
          isDragging={dragging?.idx === idx}
          isResizing={resizing?.idx === idx}
          onDragStart={e => onDragStart(e, idx)}
          onResizeStart={(e, h) => onResizeStart(e, idx, h)}
          containerW={cw}
          onFitWidth={() => {
            onChange(itemsRef.current.map((it, i) => i === idx ? { ...it, x: 0, w: snap(cw) } : it));
          }}
          onFitHeight={() => {
            const maxH = Math.max(...itemsRef.current.map(it => it.y + it.h));
            onChange(itemsRef.current.map((it, i) => i === idx ? { ...it, y: 0, h: snap(maxH) } : it));
          }}
          onFitBoth={() => {
            const maxH = Math.max(...itemsRef.current.map(it => it.y + it.h));
            onChange(itemsRef.current.map((it, i) => i === idx ? { ...it, x: 0, y: 0, w: snap(cw), h: snap(maxH) } : it));
          }}
        >
          {children(item, idx, cw)}
        </CanvasItemWrapper>
      ))}
    </div>
  );
}

// ── Item wrapper ─────────────────────────────────────────────────────────────
interface WrapperProps {
  item: CanvasItem;
  disabled?: boolean;
  isDragging: boolean;
  isResizing: boolean;
  containerW: number;
  onDragStart: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent, handle: Handle) => void;
  onFitWidth: () => void;
  onFitHeight: () => void;
  onFitBoth: () => void;
  children: React.ReactNode;
}

function CanvasItemWrapper({
  item, disabled, isDragging, isResizing,
  onDragStart, onResizeStart, onFitWidth, onFitHeight, onFitBoth,
  children,
}: WrapperProps) {
  const [hovered, setHovered] = useState(false);
  const active = isDragging || isResizing;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        left: item.x, top: item.y, width: item.w, height: item.h,
        boxSizing: 'border-box',
        outline: active ? '2px solid #3b82f6' : hovered && !disabled ? '1px solid #93c5fd' : 'none',
        borderRadius: 10,
        zIndex: active ? 50 : 1,
        transition: active ? 'none' : 'outline .1s',
      }}
    >
      {/* Drag area = full widget */}
      <div
        onMouseDown={disabled ? undefined : onDragStart}
        style={{ width: '100%', height: '100%', cursor: disabled ? 'default' : 'grab' }}
      >
        {children}
      </div>

      {/* Fit buttons — top-right corner on hover */}
      {!disabled && hovered && !active && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: -28, right: 0,
            display: 'flex', gap: 3, zIndex: 60,
          }}
        >
          {[
            { label: '↔', title: 'Pleine largeur', action: onFitWidth },
            { label: '↕', title: 'Pleine hauteur', action: onFitHeight },
            { label: '⛶', title: 'Plein écran', action: onFitBoth },
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.action}
              title={btn.title}
              style={{
                border: 'none', borderRadius: 4, padding: '2px 6px',
                background: '#1e293b', color: 'white', fontSize: 11,
                cursor: 'pointer', lineHeight: 1.4,
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}

      {/* Resize handles */}
      {!disabled && hovered && !active && (
        <>
          {(['n','s','e','w','ne','nw','se','sw'] as Handle[]).map(h => (
            <ResizeHandle key={h} handle={h} onMouseDown={e => onResizeStart(e, h)} />
          ))}
        </>
      )}
    </div>
  );
}

function ResizeHandle({ handle, onMouseDown }: { handle: Handle; onMouseDown: (e: React.MouseEvent) => void }) {
  const isCorner = handle.length === 2;
  const S = 10;
  const style: React.CSSProperties = {
    position: 'absolute',
    width: isCorner ? S : handle === 'n' || handle === 's' ? 'calc(100% - 20px)' : S,
    height: isCorner ? S : handle === 'e' || handle === 'w' ? 'calc(100% - 20px)' : S,
    background: '#3b82f6',
    borderRadius: 2,
    cursor: HANDLE_CURSORS[handle],
    zIndex: 10,
    opacity: 0.8,
    ...(handle.includes('n') ? { top: -S / 2 } : {}),
    ...(handle.includes('s') ? { bottom: -S / 2 } : {}),
    ...(handle.includes('e') ? { right: -S / 2 } : {}),
    ...(handle.includes('w') ? { left: -S / 2 } : {}),
    ...(handle === 'n' || handle === 's' ? { left: '10px' } : {}),
    ...(handle === 'e' || handle === 'w' ? { top: '10px' } : {}),
  };

  return (
    <div
      style={style}
      onMouseDown={e => { e.stopPropagation(); onMouseDown(e); }}
    />
  );
}
