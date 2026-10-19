import { useEffect, useRef, useState } from "react";
import type { RetrievedImage } from "../api";
import { GROUP_LABEL, parseConcepts } from "../concepts";
import { useDialog } from "../hooks";
import { ConceptChip, CopyButton, SplitBadge, formatScore } from "./ui";
import { DEFAULT_VIEW, ImageViewer, ToolButton, ViewerToolbar, resetGeometry, zoomAround, type ViewerTool } from "./Viewer";
import { ChevronLeftIcon, ChevronRightIcon, ColumnsIcon, ExternalIcon, SearchIcon, XIcon } from "./icons";

interface Props {
  items: RetrievedImage[];
  index: number;
  rankOf: (id: string) => number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onSearch: (item: RetrievedImage) => void;
  searching: boolean;
  queryUrl: string;
  queryName: string;
  compare: boolean;
  onCompare: (on: boolean) => void;
}

export function Lightbox(props: Props) {
  const { items, index, rankOf, onIndex, onClose, onSearch, searching, queryUrl, queryName, compare, onCompare } = props;
  const closeRef = useRef<HTMLButtonElement>(null);
  const { dialogRef, onKeyDown } = useDialog(onClose, closeRef);
  // One view state drives both panes in compare mode, so windowing and zoom stay in sync.
  const [view, setView] = useState(DEFAULT_VIEW);
  const [tool, setTool] = useState<ViewerTool>("pan");
  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  // Keep window/level when browsing, but recentre each new image.
  useEffect(() => setView(resetGeometry), [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "arrowleft" && hasPrev) onIndex(index - 1);
      else if (key === "arrowright" && hasNext) onIndex(index + 1);
      else if (key === "c") onCompare(!compare);
      else if (key === "i") setView((v) => ({ ...v, invert: !v.invert }));
      else if (key === "r") setView((v) => ({ ...v, rotate: (v.rotate + 90) % 360 }));
      else if (key === "0") setView(DEFAULT_VIEW);
      else if (key === "+" || key === "=") setView((v) => zoomAround(v, 1.25));
      else if (key === "-") setView((v) => zoomAround(v, 0.8));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, hasPrev, hasNext, onIndex, compare, onCompare]);

  if (!item) return null;
  const concepts = parseConcepts(item.concepts_manual);
  const caption = item.caption?.trim() || "No caption.";
  const rank = rankOf(item.ID);

  return (
    <div className="lightbox-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className={`lightbox${compare ? " is-compare" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lb-title"
        onKeyDown={onKeyDown}
      >
        <div className="lb-media">
          <ViewerToolbar view={view} onView={setView} tool={tool} onTool={setTool}>
            <span className="vt-sep" aria-hidden="true" />
            <ToolButton label="Compare with query (C)" pressed={compare} onClick={() => onCompare(!compare)} text="Compare">
              <ColumnsIcon size={16} />
            </ToolButton>
          </ViewerToolbar>

          <div className="lb-stage">
            {compare && (
              <div className="lb-pane">
                <ImageViewer
                  src={queryUrl}
                  alt="Query image"
                  view={view}
                  onView={setView}
                  tool={tool}
                  label="QUERY"
                  topLeft={[queryName]}
                />
              </div>
            )}
            <div className="lb-pane">
              <ImageViewer
                src={item.image_url}
                alt={caption}
                view={view}
                onView={setView}
                tool={tool}
                label={`REF #${rank}`}
                topLeft={[item.ID]}
                topRight={[item.split.toUpperCase(), `SIM ${formatScore(item.score)}`]}
              />
            </div>
            <button
              type="button"
              className="lb-nav lb-prev"
              onClick={() => onIndex(index - 1)}
              disabled={!hasPrev}
              aria-label="Previous image"
            >
              <ChevronLeftIcon size={22} />
            </button>
            <button
              type="button"
              className="lb-nav lb-next"
              onClick={() => onIndex(index + 1)}
              disabled={!hasNext}
              aria-label="Next image"
            >
              <ChevronRightIcon size={22} />
            </button>
          </div>
        </div>

        <div className="lb-info">
          <div className="lb-top">
            <span className="section-meta">
              Rank #{rank} · {index + 1} of {items.length}
            </span>
            <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <XIcon />
            </button>
          </div>

          <h2 id="lb-title" className="lb-title mono">
            {item.ID}
          </h2>

          <div className="lb-meta">
            <SplitBadge split={item.split} />
            <span className="lb-score">
              <span className="field-hint">similarity</span> <span className="mono">{formatScore(item.score)}</span>
            </span>
          </div>

          <p className="lb-caption">{caption}</p>

          <div className="lb-concepts">
            <h3 className="subsection-title">Curated concepts</h3>
            {concepts.length === 0 ? (
              <p className="note">No curated concepts for this image.</p>
            ) : (
              <ul>
                {concepts.map((c) => (
                  <li key={c.cui}>
                    <ConceptChip concept={c} />
                    <span className="lb-concept-name">{c.name}</span>
                    <span className="lb-concept-meta mono">
                      {GROUP_LABEL[c.group]} · {c.cui}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="lb-actions">
            <button type="button" className="btn btn-primary" onClick={() => onSearch(item)} disabled={searching}>
              <SearchIcon size={16} /> {searching ? "Preparing…" : "Search with this image"}
            </button>
            <a className="btn btn-secondary" href={item.image_url} target="_blank" rel="noreferrer">
              <ExternalIcon size={16} /> Original
            </a>
            <CopyButton text={caption} label="Copy caption" />
          </div>
          <p className="lb-hint">
            <kbd>←</kbd> <kbd>→</kbd> browse · <kbd>C</kbd> compare · <kbd>I</kbd> invert · <kbd>R</kbd> rotate ·{" "}
            <kbd>0</kbd> reset · scroll to zoom · <kbd>Shift</kbd>+drag for window/level · <kbd>Esc</kbd> close
          </p>
        </div>
      </div>
    </div>
  );
}
