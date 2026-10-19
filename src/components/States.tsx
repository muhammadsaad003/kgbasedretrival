import { describeConcept, GROUP_LABEL, type ConceptGroup } from "../concepts";
import { useElapsed } from "../hooks";
import { ConceptChip } from "./ui";
import { AlertIcon, CheckIcon, DatabaseIcon, LayersIcon, NetworkIcon, RefreshIcon, SearchIcon, SparkIcon } from "./icons";

const VOCAB: Record<Exclude<ConceptGroup, "other">, string[]> = {
  modality: ["C0040405", "C1306645", "C0024485", "C0041618", "C0002978", "C0032743"],
  region: ["C0817096", "C0037303", "C0000726", "C0030797", "C0037949", "C0023216", "C1140618", "C0006141"],
  view: ["C1999039", "C1996865", "C0205129", "C0205106"],
};

const PIPELINE = [
  { icon: LayersIcon, title: "Embed", text: "PubMedCLIP (ViT-B/32) encodes the image into a normalised vector." },
  { icon: SearchIcon, title: "Retrieve", text: "FAISS inner-product search over 80,080 ROCOv2 images." },
  { icon: SparkIcon, title: "Caption", text: "Ground-truth caption on an exact match, otherwise BLIP-ROCO." },
  { icon: NetworkIcon, title: "Ground in concepts", text: "Neighbours’ UMLS concepts vote on modality, region and view." },
];

// `at` is the fraction of the analysis time at which the step completes.
const ANALYSIS_STEPS = [
  { title: "Image preprocessing", detail: "Decode, convert to RGB and resize for the encoder", at: 0.12 },
  { title: "Feature extraction", detail: "PubMedCLIP ViT-B/32 image embedding", at: 0.34 },
  { title: "Similarity search", detail: "FAISS inner-product search over 80,080 ROCOv2 images", at: 0.58 },
  { title: "Findings generation", detail: "Reference caption on exact match, otherwise BLIP-ROCO", at: 0.8 },
  { title: "Concept grounding", detail: "Pooling UMLS concepts of the nearest reference cases", at: Infinity },
];

/** Animated ECG trace used as a "working" indicator. */
export function EcgTrace({ className = "" }: { className?: string }) {
  const beat = "h22 l4 -5 l4 5 h6 l3 -16 l4 30 l4 -18 l3 4 h8 l5 -6 l5 6 h16";
  const d = `M0 20 ${beat} ${beat} ${beat} ${beat}`;
  return (
    <svg className={`ecg ${className}`} viewBox="0 0 336 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d={d} className="ecg-base" pathLength={100} />
      <path d={d} className="ecg-trace" pathLength={100} />
    </svg>
  );
}

export function EmptyState() {
  return (
    <div className="empty">
      <section className="card hero">
        <EcgTrace className="hero-ecg" />
        <span className="eyebrow">
          <DatabaseIcon size={14} /> ROCOv2 · 80,080 indexed images
        </span>
        <h1 className="hero-title">Find radiology images that look like yours</h1>
        <p className="hero-text">
          Upload a scan or pick a sample. The image is embedded with PubMedCLIP, matched against a FAISS index of ROCOv2,
          and the curated UMLS concepts of its nearest neighbours are pooled into a concept profile.
        </p>
        <ol className="pipeline">
          {PIPELINE.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="pipeline-step">
              <span className="pipeline-icon">
                <Icon size={18} />
              </span>
              <span className="pipeline-num mono">0{i + 1}</span>
              <strong>{title}</strong>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card" aria-labelledby="vocab-title">
        <div className="section-head">
          <h2 id="vocab-title" className="section-title">Concept vocabulary</h2>
          <span className="section-meta">18 curated UMLS concepts in the index</span>
        </div>
        <div className="vocab">
          {(Object.keys(VOCAB) as Array<keyof typeof VOCAB>).map((group) => (
            <div key={group} className="vocab-group">
              <h3 className="profile-group-title">{GROUP_LABEL[group]}</h3>
              <div className="chips">
                {VOCAB[group].map((cui) => (
                  <ConceptChip key={cui} concept={describeConcept(cui)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function LoadingState({ startedAt, expectedMs, k }: { startedAt: number | null; expectedMs?: number; k: number }) {
  const elapsed = useElapsed(startedAt, true);
  const expected = expectedMs ?? 6000;
  const p = elapsed / expected;
  const progress = Math.min(p, 0.97);
  const active = ANALYSIS_STEPS.findIndex((s) => p < s.at);
  const slow = elapsed > expected + 8000;

  return (
    <section className="card analysis-run" role="status" aria-live="polite" aria-label="Analysing image">
      <div className="run-head">
        <div className="run-title">
          <span className="live-dot" aria-hidden="true" />
          <div>
            <h2 className="section-title">Analysing image</h2>
            <p className="section-meta">Retrieving the {k} most similar reference cases</p>
          </div>
        </div>
        <span className="run-time mono">{(elapsed / 1000).toFixed(1)} s</span>
      </div>

      <div className="run-monitor">
        <EcgTrace className="run-ecg" />
        <span className="run-percent mono">{Math.round(progress * 100)}%</span>
      </div>
      <div
        className="run-progress"
        role="progressbar"
        aria-label="Analysis progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <i style={{ width: `${progress * 100}%` }} />
      </div>

      <ol className="run-steps">
        {ANALYSIS_STEPS.map((s, i) => {
          const state = i < active ? "done" : i === active ? "active" : "pending";
          return (
            <li key={s.title} className={`run-step is-${state}`}>
              <span className="run-marker" aria-hidden="true">
                {state === "done" ? <CheckIcon size={13} /> : state === "active" ? <span className="spinner spinner-xs" /> : i + 1}
              </span>
              <span className="run-text">
                <strong>{s.title}</strong>
                <span>{s.detail}</span>
              </span>
              <span className="run-state">{state === "done" ? "Done" : state === "active" ? "Running" : "Queued"}</span>
            </li>
          );
        })}
      </ol>

      {slow && (
        <p className="note">
          Still working. If the Hugging Face Space was asleep, the first request can take a minute or two while the models load.
        </p>
      )}
    </section>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="card error-card" role="alert">
      <span className="error-icon">
        <AlertIcon size={20} />
      </span>
      <div className="error-body">
        <h2 className="section-title">Search failed</h2>
        <p>{message}</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
          <RefreshIcon size={15} /> Try again
        </button>
      </div>
    </section>
  );
}
