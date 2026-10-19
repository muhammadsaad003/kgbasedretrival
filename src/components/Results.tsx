import { useState } from "react";
import type { RetrievedImage } from "../api";
import { aggregateConcepts, parseConcepts } from "../concepts";
import { ConceptChip, SplitBadge, formatScore } from "./ui";
import { ImageIcon } from "./icons";

interface Props {
  results: RetrievedImage[];
  visible: RetrievedImage[];
  filter: string | null;
  onFilter: (cui: string | null) => void;
  onOpen: (index: number) => void;
}

export function Results({ results, visible, filter, onFilter, onOpen }: Props) {
  const stats = aggregateConcepts(results);
  const rankOf = new Map(results.map((r, i) => [r.ID, i + 1]));

  return (
    <section className="results" aria-labelledby="results-title">
      <div className="results-head">
        <h2 id="results-title" className="results-title">
          {results.length} similar {results.length === 1 ? "image" : "images"}
        </h2>
      </div>

      {stats.length > 0 && (
        <div className="filters" role="toolbar" aria-label="Filter results by concept">
          <button
            type="button"
            className={`filter${filter === null ? " is-selected" : ""}`}
            aria-pressed={filter === null}
            onClick={() => onFilter(null)}
          >
            All <span className="chip-count">{results.length}</span>
          </button>
          {stats.map((s) => (
            <button
              key={s.concept.cui}
              type="button"
              className={`filter filter-${s.concept.group}${filter === s.concept.cui ? " is-selected" : ""}`}
              aria-pressed={filter === s.concept.cui}
              onClick={() => onFilter(filter === s.concept.cui ? null : s.concept.cui)}
              title={`${s.concept.name} (${s.concept.cui})`}
            >
              <span className="chip-dot" aria-hidden="true" />
              {s.concept.label} <span className="chip-count">{s.count}</span>
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="card empty-filter">No neighbours carry this concept.</div>
      ) : (
        <ul className="grid">
          {visible.map((r, i) => (
            <li key={r.ID}>
              <ResultCard item={r} rank={rankOf.get(r.ID) ?? i + 1} onOpen={() => onOpen(i)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ResultCard({ item, rank, onOpen }: { item: RetrievedImage; rank: number; onOpen: () => void }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const concepts = parseConcepts(item.concepts_manual);
  const caption = item.caption?.trim() || "No caption.";

  return (
    <button type="button" className="result" onClick={onOpen} aria-label={`Rank ${rank}, similarity ${formatScore(item.score)}: ${caption}`}>
      <span className={`well result-well is-${state}`}>
        {state === "failed" ? (
          <span className="img-fallback">
            <ImageIcon size={22} />
            Image unavailable
          </span>
        ) : (
          <img
            src={item.image_url}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => setState("loaded")}
            onError={() => setState("failed")}
          />
        )}
        <span className="rank">#{rank}</span>
        <SplitBadge split={item.split} />
      </span>
      <span className="result-body">
        <span className="result-score">
          <span className="mono">{formatScore(item.score)}</span>
          <span className="result-id mono">{item.ID.replace("ROCOv2_2023_", "")}</span>
        </span>
        <span className="result-caption">{caption}</span>
        {concepts.length > 0 && (
          <span className="chips">
            {concepts.map((c) => (
              <ConceptChip key={c.cui} concept={c} />
            ))}
          </span>
        )}
      </span>
    </button>
  );
}

export function ResultsSkeleton({ count }: { count: number }) {
  return (
    <section className="results" aria-hidden="true">
      <div className="results-head">
        <div className="skel skel-title" />
      </div>
      <ul className="grid">
        {Array.from({ length: Math.min(count, 12) }, (_, i) => (
          <li key={i}>
            <div className="result is-skeleton">
              <span className="well result-well skel" />
              <span className="result-body">
                <span className="skel skel-line short" />
                <span className="skel skel-line" />
                <span className="skel skel-line" />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
