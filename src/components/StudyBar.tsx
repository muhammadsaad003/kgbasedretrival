import { aggregateConcepts, modalityConsensus } from "../concepts";
import { formatReportDate } from "../reportInfo";
import type { EntryStatus, QueryEntry } from "../types";
import { ActivityIcon } from "./icons";

const STATUS: Record<EntryStatus, { label: string; tone: string }> = {
  loading: { label: "Analysing", tone: "warn" },
  done: { label: "Complete", tone: "ok" },
  error: { label: "Failed", tone: "danger" },
  idle: { label: "Interrupted", tone: "danger" },
};

/** Patient-banner style strip summarising the current study, as in PACS viewers. */
export function StudyBar({ entry }: { entry: QueryEntry }) {
  const results = entry.status === "done" ? entry.response?.results ?? [] : [];
  const stats = aggregateConcepts(results);
  const consensus = modalityConsensus(results);
  const region = stats.find((s) => s.concept.group === "region");
  const view = stats.find((s) => s.concept.group === "view");
  const blank = entry.status === "loading" ? "…" : "—";
  const status = STATUS[entry.status];

  const items: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: "Accession", value: entry.accession, mono: true },
    { label: "Image", value: entry.name, mono: true },
    { label: "Modality", value: consensus?.concept.label ?? blank },
    { label: "Region", value: region?.concept.label ?? blank },
    { label: "View", value: view?.concept.label ?? blank },
    { label: "Neighbours", value: `k = ${entry.k}` },
    { label: "Acquired", value: formatReportDate(new Date(entry.createdAt)) },
  ];

  return (
    <section className="study-bar" aria-label="Current study">
      <span className="study-icon" aria-hidden="true">
        <ActivityIcon size={18} />
      </span>
      <dl className="study-items">
        {items.map((it) => (
          <div key={it.label} className="study-item">
            <dt>{it.label}</dt>
            <dd className={it.mono ? "mono" : undefined} title={it.value}>
              {it.value}
            </dd>
          </div>
        ))}
      </dl>
      <span className={`study-status tone-${status.tone}`} role="status">
        <span className="study-status-dot" aria-hidden="true" />
        {status.label}
      </span>
    </section>
  );
}
