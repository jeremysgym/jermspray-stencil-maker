import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  src: string;
  alt: string;
  /** Called on a horizontal swipe at scale === 1. dir: -1 prev, 1 next. */
  onSwipe?: (dir: -1 | 1) => void;
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const SWIPE_THRESHOLD = 60;

/**
 * Pinch-to-zoom + pan image container.
 * - Two-finger pinch zooms around the gesture midpoint.
 * - Single-finger drag pans when zoomed in; otherwise emits onSwipe.
 * - Double-tap toggles between 1x and 2.5x at the tap location.
 * - Mouse wheel zooms (with Ctrl/⌘ or always — both work).
 */
export function ZoomPanImage({ src, alt, onSwipe }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [t, setT] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const tRef = useRef(t);
  tRef.current = t;

  // Reset transform whenever the image changes.
  useEffect(() => {
    setT({ scale: 1, x: 0, y: 0 });
  }, [src]);

  // --- Gesture state ---
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; scale: number; midX: number; midY: number; tx: number; ty: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const swipeStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTap = useRef<number>(0);

  const clamp = useCallback((next: Transform): Transform => {
    const c = containerRef.current;
    if (!c) return next;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    if (scale === 1) return { scale: 1, x: 0, y: 0 };
    const w = c.clientWidth;
    const h = c.clientHeight;
    const overX = (w * (scale - 1)) / 2;
    const overY = (h * (scale - 1)) / 2;
    return {
      scale,
      x: Math.max(-overX, Math.min(overX, next.x)),
      y: Math.max(-overY, Math.min(overY, next.y)),
    };
  }, []);

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinchStart.current = {
        dist: dist(a, b),
        scale: tRef.current.scale,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        tx: tRef.current.x,
        ty: tRef.current.y,
      };
      panStart.current = null;
      swipeStart.current = null;
    } else if (pointers.current.size === 1) {
      if (tRef.current.scale > 1) {
        panStart.current = { x: e.clientX, y: e.clientY, tx: tRef.current.x, ty: tRef.current.y };
      } else {
        swipeStart.current = { x: e.clientX, y: e.clientY, time: Date.now() };
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = Array.from(pointers.current.values());
      const d = dist(a, b);
      const ratio = d / pinchStart.current.dist;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStart.current.scale * ratio));
      // Keep pinch midpoint anchored.
      const c = containerRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const localMidX = pinchStart.current.midX - cx;
      const localMidY = pinchStart.current.midY - cy;
      const scaleDelta = newScale / pinchStart.current.scale;
      const nx = pinchStart.current.tx - localMidX * (scaleDelta - 1);
      const ny = pinchStart.current.ty - localMidY * (scaleDelta - 1);
      setT(clamp({ scale: newScale, x: nx, y: ny }));
      e.preventDefault();
      return;
    }

    if (pointers.current.size === 1 && panStart.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setT(clamp({ scale: tRef.current.scale, x: panStart.current.tx + dx, y: panStart.current.ty + dy }));
      e.preventDefault();
    }
  };

  const finish = (e: React.PointerEvent) => {
    const wasSwipe = swipeStart.current && pointers.current.size === 1 && tRef.current.scale === 1;
    if (wasSwipe) {
      const dx = e.clientX - swipeStart.current!.x;
      const dy = e.clientY - swipeStart.current!.y;
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        onSwipe?.(dx > 0 ? -1 : 1);
      } else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
        // Tap — check double tap to toggle zoom.
        const now = Date.now();
        if (now - lastTap.current < 300) {
          const c = containerRef.current;
          if (c) {
            const rect = c.getBoundingClientRect();
            if (tRef.current.scale > 1) {
              setT({ scale: 1, x: 0, y: 0 });
            } else {
              const localX = e.clientX - (rect.left + rect.width / 2);
              const localY = e.clientY - (rect.top + rect.height / 2);
              const ns = 2.5;
              setT(clamp({ scale: ns, x: -localX * (ns - 1), y: -localY * (ns - 1) }));
            }
          }
          lastTap.current = 0;
        } else {
          lastTap.current = now;
        }
      }
    }
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      panStart.current = null;
      swipeStart.current = null;
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const c = containerRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const localX = e.clientX - (rect.left + rect.width / 2);
    const localY = e.clientY - (rect.top + rect.height / 2);
    const cur = tRef.current;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cur.scale * factor));
    const scaleDelta = newScale / cur.scale;
    setT(
      clamp({
        scale: newScale,
        x: cur.x - localX * (scaleDelta - 1),
        y: cur.y - localY * (scaleDelta - 1),
      }),
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[60vh] overflow-hidden bg-muted/30 select-none touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onWheel={onWheel}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="absolute inset-0 m-auto max-w-full max-h-full object-contain will-change-transform pointer-events-none"
        style={{
          transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
          transformOrigin: "center center",
          transition: pointers.current.size === 0 ? "transform 120ms ease-out" : "none",
        }}
      />
      {t.scale > 1 && (
        <button
          type="button"
          onClick={() => setT({ scale: 1, x: 0, y: 0 })}
          className="absolute bottom-2 right-2 text-xs px-2 py-1 rounded bg-background/80 border shadow-sm"
        >
          Reset zoom
        </button>
      )}
    </div>
  );
}
