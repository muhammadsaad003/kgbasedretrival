import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { RetrievedImage } from "../api";
import { GROUP_LABEL, parseConcepts } from "../concepts";
import { ConceptChip, CopyButton, SplitBadge, formatScore } from "./ui";
import { ChevronLeftIcon, ChevronRightIcon, ExternalIcon, SearchIcon, XIcon } from "./icons";

interface Props {
  items: RetrievedImage[];
  index: number;
  rankOf: (id: string) => number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onSearch: (item: RetrievedImage) => void;
  searching: boolean;
}

export function Lightbox({ items, index, rankOf, onIndex, onClose, onSearch, searching }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onIndex(index - 1);
      else if (e.key === "ArrowRight" && hasNext) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, hasPrev, hasNext, onClose, onIndex]);

  // Keep Tab focus inside the dialog.
  const trapTab = (e: ReactKeyboardEvent) => {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!item) return null;
  const concepts = parseConcepts(item.concepts_manual);
  const caption = item.caption?.trim() || "No caption.";

  return (
    <div className="lightbox-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="lightbox"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lb-title"
        onKeyDown={trapTab}
      >
        <div className="lb-media well">
          <img key={item.ID} src={item.image_url} alt={caption} />
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

        <div className="lb-info">
          <div className="lb-top">
            <span className="section-meta">
              Rank #{rankOf(item.ID)} · {index + 1} of {items.length}
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
              <span className="field-hint">cosine</span> <span className="mono">{formatScore(item.score)}</span>
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
            <kbd>←</kbd> <kbd>→</kbd> to browse · <kbd>Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}
