import { useEffect, useRef, useState } from "react";
import type { SearchResponse } from "../api";
import { useDialog } from "../hooks";
import { formatReportDate, makeReportId, reportFileName, type ReportMeta } from "../reportInfo";
import type { QueryEntry } from "../types";
import { formatBytes } from "./ui";
import { AlertIcon, DownloadIcon, ExternalIcon, FileTextIcon, XIcon } from "./icons";

interface Props {
  entry: QueryEntry;
  response: SearchResponse;
  meta: ReportMeta;
  onMeta: (meta: ReportMeta) => void;
  onClose: () => void;
}

interface BuiltPdf {
  url: string;
  size: number;
  pages: number;
}

const REBUILD_DELAY_MS = 450;

export function ReportDialog({ entry, response, meta, onMeta, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { dialogRef, onKeyDown } = useDialog(onClose, closeRef);
  const [reportId] = useState(() => makeReportId());
  const [generatedAt] = useState(() => new Date());
  const [pdf, setPdf] = useState<BuiltPdf | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const canPreview = navigator.pdfViewerEnabled !== false;
  const n = response.results.length;

  // Rebuild the PDF whenever the inputs change (debounced while typing).
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    const timer = window.setTimeout(
      async () => {
        try {
          const { buildReportPdf } = await import("../report");
          const result = await buildReportPdf({ entry, response, meta, reportId, generatedAt });
          if (cancelled) return;
          const url = URL.createObjectURL(result.blob);
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = url;
          setPdf({ url, size: result.blob.size, pages: result.pages });
          setError(null);
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : "The report could not be built.");
        } finally {
          if (!cancelled) setBusy(false);
        }
      },
      urlRef.current ? REBUILD_DELAY_MS : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [entry, response, meta, reportId, generatedAt]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    },
    [],
  );

  const download = () => {
    if (!pdf) return;
    const a = document.createElement("a");
    a.href = pdf.url;
    a.download = reportFileName(reportId);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const set = <K extends keyof ReportMeta>(key: K, value: ReportMeta[K]) => onMeta({ ...meta, [key]: value });

  return (
    <div className="lightbox-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        onKeyDown={onKeyDown}
      >
        <header className="report-head">
          <span className="report-head-icon">
            <FileTextIcon size={18} />
          </span>
          <div className="report-head-text">
            <h2 id="report-title" className="section-title">
              Radiology retrieval report
            </h2>
            <p className="section-meta">
              <span className="mono">{reportId}</span> · {formatReportDate(generatedAt)}
            </p>
          </div>
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </header>

        <div className="report-body">
          <form className="report-form" onSubmit={(e) => e.preventDefault()}>
            <p className="note">
              Optional details printed on the report. The PDF is built in your browser; nothing you type here is uploaded.
            </p>
            <label className="field">
              <span className="field-label">Patient / case ID</span>
              <input
                type="text"
                value={meta.caseId}
                onChange={(e) => set("caseId", e.target.value)}
                placeholder="e.g. CASE-0142"
                autoComplete="off"
                maxLength={60}
              />
            </label>
            <label className="field">
              <span className="field-label">Prepared by</span>
              <input
                type="text"
                value={meta.preparedBy}
                onChange={(e) => set("preparedBy", e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                maxLength={60}
              />
            </label>
            <label className="field">
              <span className="field-label">Clinical indication / notes</span>
              <textarea
                rows={4}
                value={meta.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="e.g. Chest pain, rule out aortic pathology"
                maxLength={600}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={meta.includeThumbnails}
                onChange={(e) => set("includeThumbnails", e.target.checked)}
              />
              <span>Include thumbnails of the {n} reference cases</span>
            </label>

            <div className="report-contents">
              <h3 className="profile-group-title">Report contents</h3>
              <ol>
                <li>Study information</li>
                <li>Query image, findings and impression</li>
                <li>Retrieval summary</li>
                <li>UMLS concept profile</li>
                <li>{n} similar reference cases</li>
                <li>Method, disclaimer and sign-off</li>
              </ol>
            </div>
          </form>

          <div className="report-preview" aria-busy={busy}>
            {error ? (
              <div className="report-placeholder" role="alert">
                <AlertIcon size={26} />
                <p>{error}</p>
              </div>
            ) : !pdf ? (
              <div className="report-placeholder">
                <span className="spinner" aria-hidden="true" />
                <p>Building report…</p>
              </div>
            ) : canPreview ? (
              <iframe key={pdf.url} title="Report preview" src={`${pdf.url}#view=FitH&navpanes=0`} />
            ) : (
              <div className="report-placeholder">
                <FileTextIcon size={28} />
                <p>This browser can't preview PDFs inline. Download the report or open it in a new tab.</p>
              </div>
            )}
            {busy && pdf && (
              <span className="report-updating" role="status">
                <span className="spinner spinner-sm" aria-hidden="true" /> Updating…
              </span>
            )}
          </div>
        </div>

        <footer className="report-foot">
          <span className="section-meta">
            {pdf ? `A4 PDF · ${pdf.pages} ${pdf.pages === 1 ? "page" : "pages"} · ${formatBytes(pdf.size)}` : "A4 PDF"}
          </span>
          <div className="report-foot-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => pdf && window.open(pdf.url, "_blank", "noopener")}
              disabled={!pdf}
            >
              <ExternalIcon size={16} /> Open in new tab
            </button>
            <button type="button" className="btn btn-primary" onClick={download} disabled={!pdf || busy}>
              <DownloadIcon size={16} /> Download PDF
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
