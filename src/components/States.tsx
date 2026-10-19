import { describeConcept, GROUP_LABEL, type ConceptGroup } from "../concepts";
import { useElapsed } from "../hooks";
import { ConceptChip } from "./ui";
import { AlertIcon, DatabaseIcon, LayersIcon, NetworkIcon, RefreshIcon, SearchIcon, SparkIcon } from "./icons";

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

export function EmptyState() {
  return (
    <div className="empty">
      <section className="card hero">
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

      <dl className="stat-strip">
        <div>
          <dt>Indexed images</dt>
          <dd className="mono">80,080</dd>
        </div>
        <div>
          <dt>Train / valid / test</dt>
          <dd className="mono">60,163 / 9,945 / 9,972</dd>
        </div>
        <div>
          <dt>Models</dt>
          <dd>PubMedCLIP · BLIP-ROCO</dd>
        </div>
      </dl>
    </div>
  );
}

export function LoadingState({ startedAt }: { startedAt: number | null }) {
  const elapsed = useElapsed(startedAt, true);
  const slow = elapsed > 10_000;
  return (
    <section className="card loading" role="status" aria-live="polite">
      <div className="loading-head">
        <span className="spinner" aria-hidden="true" />
        <div>
          <h2 className="section-title">Searching the index…</h2>
          <p className="section-meta mono">{(elapsed / 1000).toFixed(1)} s</p>
        </div>
      </div>
      <ol className="loading-steps">
        <li>Encode with PubMedCLIP</li>
        <li>Nearest-neighbour search in FAISS</li>
        <li>Caption: dataset ground truth or BLIP</li>
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
