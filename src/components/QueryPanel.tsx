import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { Sample } from "../samples";
import type { QueryEntry } from "../types";
import { formatBytes } from "./ui";
import { AlertIcon, ImageIcon, RefreshIcon, UploadIcon, XIcon } from "./icons";

const SOURCE_LABEL: Record<QueryEntry["source"], string> = {
  upload: "Uploaded",
  paste: "Pasted",
  sample: "Sample",
  neighbour: "From results",
};

interface Props {
  serverUnreachable: boolean;
  onRecheckServer: () => void;
  current: QueryEntry | null;
  entries: QueryEntry[];
  k: number;
  kOptions: number[];
  onK: (k: number) => void;
  onFile: (file: File) => void;
  onClear: () => void;
  onRetry: () => void;
  samples: Sample[];
  onSample: (s: Sample) => void;
  preparing: string | null;
  onSelectRecent: (id: string) => void;
  notice: string | null;
  onDismissNotice: () => void;
}

export function QueryPanel(props: Props) {
  const { current, entries, k, kOptions, onK, onFile, onClear, onRetry, samples, onSample, preparing } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const busy = current?.status === "loading";

  const browse = () => inputRef.current?.click();

  const onDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  const onDropzoneKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      browse();
    }
  };

  return (
    <div className="panel">
      <section
        className={`card query-card${dragging ? " is-dragging" : ""}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        aria-labelledby="query-title"
      >
        <div className="section-head">
          <h2 id="query-title" className="section-title">Query image</h2>
          {current && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
              <XIcon size={15} /> Clear
            </button>
          )}
        </div>

        {current ? (
          <div className={`preview${busy ? " is-scanning" : ""}`}>
            <div className="well preview-well">
              <img src={current.previewUrl} alt="Query image preview" />
              {busy && <span className="scanline" aria-hidden="true" />}
              {dragging && <div className="drop-overlay">Drop to replace</div>}
            </div>
            <div className="preview-meta">
              <div className="preview-name" title={current.name}>
                {current.name}
              </div>
              <div className="preview-sub">
                {SOURCE_LABEL[current.source]} · {formatBytes(current.file.size)}
              </div>
            </div>
            <div className="preview-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={browse} disabled={busy}>
                <UploadIcon size={15} /> Replace
              </button>
              {(current.status === "error" || current.status === "idle") && (
                <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
                  <RefreshIcon size={15} /> Run again
                </button>
              )}
            </div>
          </div>
        ) : (
          <div
            className={`dropzone${dragging ? " is-active" : ""}`}
            role="button"
            tabIndex={0}
            onClick={browse}
            onKeyDown={onDropzoneKey}
            aria-describedby="dropzone-hint"
          >
            <span className="dropzone-icon">
              <UploadIcon size={22} />
            </span>
            <span className="dropzone-title">Drop a radiology image</span>
            <span id="dropzone-hint" className="dropzone-hint">
              or <span className="link-like">browse files</span> · paste with <kbd>Ctrl</kbd>+<kbd>V</kbd>
            </span>
            <span className="dropzone-formats">JPG, PNG, WebP, BMP · up to 15 MB</span>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />

        <div className="k-control">
          <span id="k-label" className="field-label">
            Neighbours to retrieve <span className="field-hint">k</span>
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="k-label">
            {kOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={k === opt}
                className={k === opt ? "is-selected" : undefined}
                onClick={() => onK(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {props.serverUnreachable && (
          <div className="inline-alert inline-alert-warn" role="status">
            <AlertIcon size={16} />
            <span>Can't reach the retrieval server. It may be waking up; retrying automatically.</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={props.onRecheckServer}>
              Retry
            </button>
          </div>
        )}

        {props.notice && (
          <div className="inline-alert" role="alert">
            <AlertIcon size={16} />
            <span>{props.notice}</span>
            <button type="button" className="icon-btn icon-btn-sm" onClick={props.onDismissNotice} aria-label="Dismiss">
              <XIcon size={14} />
            </button>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="samples-title">
        <div className="section-head">
          <h2 id="samples-title" className="section-title">Try a sample</h2>
          <span className="section-meta">ROCOv2 test split</span>
        </div>
        <div className="samples">
          {samples.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`sample${preparing === s.id ? " is-loading" : ""}`}
              onClick={() => onSample(s)}
              disabled={preparing !== null}
              title={`${s.description} (${s.id})`}
            >
              <span className="well sample-well">
                <img src={s.url} alt="" loading="lazy" decoding="async" />
              </span>
              <span className="sample-label">{s.label}</span>
              <span className="sample-desc">{s.description}</span>
            </button>
          ))}
        </div>
      </section>

      {entries.length > 0 && (
        <section className="card" aria-labelledby="recent-title">
          <div className="section-head">
            <h2 id="recent-title" className="section-title">Recent queries</h2>
            <span className="section-meta">this session</span>
          </div>
          <div className="recent">
            {entries.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`recent-item${current?.id === e.id ? " is-current" : ""}`}
                onClick={() => props.onSelectRecent(e.id)}
                title={`${e.name} · k=${e.k}`}
                aria-current={current?.id === e.id ? "true" : undefined}
              >
                <span className="well recent-well">
                  {e.previewUrl ? <img src={e.previewUrl} alt="" /> : <ImageIcon />}
                </span>
                <span className={`recent-state state-${e.status}`} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
