import type { Concept } from "../concepts";
import { useCopy } from "../hooks";
import { CheckIcon, CopyIcon } from "./icons";

export function ConceptChip({ concept, count, title }: { concept: Concept; count?: number; title?: string }) {
  return (
    <span className={`chip chip-${concept.group}`} title={title ?? `${concept.name} (${concept.cui})`}>
      <span className="chip-dot" aria-hidden="true" />
      {concept.label}
      {count !== undefined && <span className="chip-count">{count}</span>}
    </span>
  );
}

export function SplitBadge({ split }: { split: string }) {
  return <span className={`split split-${split}`}>{split}</span>;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const { copied, copy } = useCopy();
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(text)} disabled={!text}>
      {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}

export function formatScore(score: number | undefined): string {
  return typeof score === "number" && Number.isFinite(score) ? score.toFixed(3) : "—";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSeconds(ms: number | undefined): string {
  return typeof ms === "number" ? `${(ms / 1000).toFixed(1)} s` : "—";
}
