// Radiology-style image viewer: pan, wheel zoom, window/level drag, invert, rotate, flip,
// with DICOM-viewer-like corner overlays. View state is controlled so two viewers can be synced.

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  ContrastIcon,
  FlipIcon,
  HandIcon,
  InvertIcon,
  MaximizeIcon,
  RefreshIcon,
  RotateIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "./icons";

export type ViewerTool = "pan" | "wl";

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  /** CSS brightness / contrast in percent; the browser analogue of window level / width. */
  brightness: number;
  contrast: number;
  invert: boolean;
  rotate: number;
  flipH: boolean;
}

export const DEFAULT_VIEW: ViewState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  brightness: 100,
  contrast: 100,
  invert: false,
  rotate: 0,
  flipH: false,
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Zoom by `factor`, keeping the point (cx, cy) — relative to the stage centre — fixed on screen. */
export function zoomAround(v: ViewState, factor: number, cx = 0, cy = 0): ViewState {
  const zoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const r = zoom / v.zoom;
  return { ...v, zoom, panX: cx - (cx - v.panX) * r, panY: cy - (cy - v.panY) * r };
}

export function resetGeometry(v: ViewState): ViewState {
  return { ...v, zoom: 1, panX: 0, panY: 0 };
}

interface ImageViewerProps {
  src: string;
  alt: string;
  view: ViewState;
  onView: Dispatch<SetStateAction<ViewState>>;
  tool: ViewerTool;
  label?: string;
  topLeft?: string[];
  topRight?: string[];
  scanning?: boolean;
  children?: ReactNode;
}

export function ImageViewer({ src, alt, view, onView, tool, label, topLeft, topRight, scanning, children }: ImageViewerProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; start: ViewState; mode: ViewerTool } | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => setNatural(null), [src]);

  // React registers wheel listeners as passive, so attach one natively to be able to stop page scroll.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      onView((v) => zoomAround(v, Math.exp(-e.deltaY * 0.0015), cx, cy));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onView]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    // Middle button or Shift temporarily switches to the other tool, as in most PACS viewers.
    const alt = e.button === 1 || e.shiftKey;
    const mode: ViewerTool = alt ? (tool === "pan" ? "wl" : "pan") : tool;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: view, mode };
    setDragging(true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.mode === "pan") {
      onView({ ...d.start, panX: d.start.panX + dx, panY: d.start.panY + dy });
    } else {
      onView({
        ...d.start,
        contrast: Math.round(clamp(d.start.contrast + dx * 0.6, 20, 400)),
        brightness: Math.round(clamp(d.start.brightness - dy * 0.6, 20, 300)),
      });
    }
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  };

  const transform = `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom}) rotate(${view.rotate}deg) scaleX(${view.flipH ? -1 : 1})`;
  const filter = `brightness(${view.brightness}%) contrast(${view.contrast}%)${view.invert ? " invert(1)" : ""}`;
  const flags = [view.invert && "INV", view.flipH && "FLIP H"].filter(Boolean).join(" · ");

  return (
    <div
      ref={stageRef}
      className={`viewer-stage tool-${tool}${dragging ? " is-dragging" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onView(DEFAULT_VIEW)}
      onAuxClick={(e) => e.preventDefault()}
      role="img"
      aria-label={alt}
    >
      <img
        key={src}
        src={src}
        alt=""
        draggable={false}
        style={{ transform, filter }}
        onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
      />
      {scanning && <span className="scanline" aria-hidden="true" />}
      <span className="viewer-frame" aria-hidden="true" />
      <div className="viewer-overlay" aria-hidden="true">
        <div className="ov ov-tl">
          {label && <b>{label}</b>}
          {topLeft?.map((l, i) => <span key={i}>{l}</span>)}
        </div>
        <div className="ov ov-tr">{topRight?.map((l, i) => <span key={i}>{l}</span>)}</div>
        <div className="ov ov-bl">
          <span>
            W/L {view.contrast} / {view.brightness}
          </span>
          <span>Zoom {view.zoom.toFixed(2)}×</span>
        </div>
        <div className="ov ov-br">
          {natural && (
            <span>
              {natural.w} × {natural.h}
            </span>
          )}
          <span>
            Rot {view.rotate}°{flags ? ` · ${flags}` : ""}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

interface ToolbarProps {
  view: ViewState;
  onView: Dispatch<SetStateAction<ViewState>>;
  tool: ViewerTool;
  onTool: (t: ViewerTool) => void;
  onFullscreen?: () => void;
  children?: ReactNode;
}

export function ViewerToolbar({ view, onView, tool, onTool, onFullscreen, children }: ToolbarProps) {
  return (
    <div className="viewer-toolbar" role="toolbar" aria-label="Image tools">
      <ToolButton label="Pan (drag)" pressed={tool === "pan"} onClick={() => onTool("pan")}>
        <HandIcon size={16} />
      </ToolButton>
      <ToolButton
        label="Window / level (drag: ← → contrast, ↑ ↓ brightness)"
        pressed={tool === "wl"}
        onClick={() => onTool("wl")}
      >
        <ContrastIcon size={16} />
      </ToolButton>
      <span className="vt-sep" aria-hidden="true" />
      <ToolButton label="Zoom in" onClick={() => onView((v) => zoomAround(v, 1.25))}>
        <ZoomInIcon size={16} />
      </ToolButton>
      <ToolButton label="Zoom out" onClick={() => onView((v) => zoomAround(v, 0.8))}>
        <ZoomOutIcon size={16} />
      </ToolButton>
      <ToolButton label="Invert" pressed={view.invert} onClick={() => onView((v) => ({ ...v, invert: !v.invert }))}>
        <InvertIcon size={16} />
      </ToolButton>
      <ToolButton label="Rotate 90°" onClick={() => onView((v) => ({ ...v, rotate: (v.rotate + 90) % 360 }))}>
        <RotateIcon size={16} />
      </ToolButton>
      <ToolButton label="Flip horizontally" pressed={view.flipH} onClick={() => onView((v) => ({ ...v, flipH: !v.flipH }))}>
        <FlipIcon size={16} />
      </ToolButton>
      <ToolButton label="Reset view (or double-click the image)" onClick={() => onView(DEFAULT_VIEW)}>
        <RefreshIcon size={16} />
      </ToolButton>
      {children}
      {onFullscreen && (
        <ToolButton label="Full screen" onClick={onFullscreen}>
          <MaximizeIcon size={16} />
        </ToolButton>
      )}
    </div>
  );
}

export function ToolButton({
  label,
  pressed,
  onClick,
  children,
  text,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
  text?: string;
}) {
  return (
    <button
      type="button"
      className={`vt-btn${pressed ? " is-on" : ""}${text ? " has-text" : ""}`}
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
    >
      {children}
      {text && <span>{text}</span>}
    </button>
  );
}

/** Query image viewer with its own view state and a full-screen toggle. */
export function QueryViewer({
  src,
  name,
  topRight,
  scanning,
  children,
}: {
  src: string;
  name: string;
  topRight?: string[];
  scanning?: boolean;
  children?: ReactNode;
}) {
  const [view, setView] = useState(DEFAULT_VIEW);
  const [tool, setTool] = useState<ViewerTool>("pan");
  const panelRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    const el = panelRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  };

  return (
    <div ref={panelRef} className="viewer-panel">
      <ImageViewer
        src={src}
        alt="Query image"
        view={view}
        onView={setView}
        tool={tool}
        label="QUERY"
        topLeft={[name]}
        topRight={topRight}
        scanning={scanning}
      >
        {children}
      </ImageViewer>
      <ViewerToolbar view={view} onView={setView} tool={tool} onTool={setTool} onFullscreen={toggleFullscreen} />
    </div>
  );
}
