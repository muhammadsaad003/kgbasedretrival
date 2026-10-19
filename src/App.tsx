import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_URL, ApiError, fetchImageAsFile, searchByImage, validateImageFile, type RetrievedImage } from "./api";
import { parseConcepts } from "./concepts";
import { useApiStatus, useTheme } from "./hooks";
import { EMPTY_REPORT_META, type ReportMeta } from "./reportInfo";
import { SAMPLES, type Sample } from "./samples";
import type { EntrySource, QueryEntry } from "./types";
import { Analysis } from "./components/Analysis";
import { Header } from "./components/Header";
import { Lightbox } from "./components/Lightbox";
import { QueryPanel } from "./components/QueryPanel";
import { ReportDialog } from "./components/ReportDialog";
import { Results, ResultsSkeleton } from "./components/Results";
import { EmptyState, ErrorState, LoadingState } from "./components/States";
import { StudyBar } from "./components/StudyBar";

const K_OPTIONS = [5, 10, 15, 20, 24];
const DEFAULT_K = 5;
const MAX_HISTORY = 8;

// Results are deliberately held for a random 5–10 s so the analysis pipeline is visible
// (the max leaves headroom for rendering). Set both to 0 to show results as soon as the API answers.
const RESULT_DELAY_MIN_MS = 5000;
const RESULT_DELAY_MAX_MS = 9500;

let nextEntryId = 0;
let nextRunId = 0;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function makeAccession(seq: number, d = new Date()): string {
  const p = (v: number, n = 2) => String(v).padStart(n, "0");
  return `ACC-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(seq, 4)}`;
}

export default function App() {
  const { theme, cycle } = useTheme();
  const api = useApiStatus();
  const { markOnline, markOffline } = api;

  const [entries, setEntries] = useState<QueryEntry[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [k, setK] = useState(DEFAULT_K);
  const [filter, setFilter] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  // Kept here so the details typed into the report form survive closing and reopening it.
  const [reportMeta, setReportMeta] = useState<ReportMeta>(EMPTY_REPORT_META);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const current = entries.find((e) => e.id === currentId) ?? null;

  // Release preview object URLs once their entries fall out of history.
  const liveUrls = useRef(new Set<string>());
  useEffect(() => {
    const live = new Set(entries.map((e) => e.previewUrl));
    for (const url of liveUrls.current) if (!live.has(url)) URL.revokeObjectURL(url);
    liveUrls.current = live;
  }, [entries]);

  const patchRun = (id: string, runId: number, patch: Partial<QueryEntry>) =>
    setEntries((es) => es.map((e) => (e.id === id && e.runId === runId ? { ...e, ...patch } : e)));

  const runSearch = useCallback(
    async (entry: QueryEntry, kValue: number) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const runId = ++nextRunId;
      const startedAt = Date.now();
      const expectedMs = RESULT_DELAY_MIN_MS + Math.random() * (RESULT_DELAY_MAX_MS - RESULT_DELAY_MIN_MS);

      setEntries((es) =>
        es.map((e) =>
          e.id === entry.id
            ? { ...e, k: kValue, runId, status: "loading", startedAt, expectedMs, response: undefined, error: undefined }
            : e,
        ),
      );
      setFilter(null);
      setHighlight(null);
      setLightbox(null);
      setReportOpen(false);

      try {
        // Errors surface immediately; successful results wait out the analysis delay.
        const [response] = await Promise.all([
          searchByImage(entry.file, kValue, ctrl.signal),
          wait(expectedMs, ctrl.signal),
        ]);
        patchRun(entry.id, runId, { status: "done", response, elapsedMs: Date.now() - startedAt });
        markOnline();
      } catch (err) {
        if (ctrl.signal.aborted) {
          patchRun(entry.id, runId, { status: "idle" });
          return;
        }
        const message = err instanceof Error ? err.message : "Unexpected error.";
        patchRun(entry.id, runId, { status: "error", error: message, elapsedMs: Date.now() - startedAt });
        // An HTTP status means the server answered; anything else means it was unreachable.
        if (err instanceof ApiError && err.status) markOnline();
        else markOffline();
      }
    },
    [markOnline, markOffline],
  );

  // Read k through a ref: a sample download can finish after the user has changed k.
  const kRef = useRef(k);
  useEffect(() => {
    kRef.current = k;
  }, [k]);

  const addQuery = useCallback(
    (file: File, name: string, source: EntrySource) => {
      const problem = validateImageFile(file);
      if (problem) {
        setNotice(problem);
        return;
      }
      setNotice(null);
      const kValue = kRef.current;
      const seq = ++nextEntryId;
      const entry: QueryEntry = {
        id: `q${seq}`,
        accession: makeAccession(seq),
        createdAt: Date.now(),
        file,
        previewUrl: URL.createObjectURL(file),
        name,
        source,
        k: kValue,
        status: "idle",
        runId: 0,
        startedAt: null,
      };
      setEntries((es) => [entry, ...es].slice(0, MAX_HISTORY));
      setCurrentId(entry.id);
      // A new image is a new case: keep the author, drop case-specific details.
      setReportMeta((m) => ({ ...m, caseId: "", notes: "" }));
      runSearch(entry, kValue);
    },
    [runSearch],
  );

  // Downloading a sample/neighbour image takes a moment; a newer user action must win over it.
  const prepareRef = useRef<AbortController | null>(null);
  const cancelPreparing = useCallback(() => {
    prepareRef.current?.abort();
    prepareRef.current = null;
    setPreparing(null);
  }, []);

  const addFromUrl = useCallback(
    async (url: string, id: string, source: EntrySource) => {
      prepareRef.current?.abort();
      const ctrl = new AbortController();
      prepareRef.current = ctrl;
      setPreparing(id);
      try {
        const file = await fetchImageAsFile(url, `${id}.jpg`, ctrl.signal);
        if (!ctrl.signal.aborted) addQuery(file, id, source);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setNotice(err instanceof Error ? `Could not load ${id}: ${err.message}` : `Could not load ${id}.`);
      } finally {
        if (prepareRef.current === ctrl) {
          prepareRef.current = null;
          setPreparing(null);
        }
      }
    },
    [addQuery],
  );

  const onUpload = (file: File) => {
    cancelPreparing();
    addQuery(file, file.name || "Uploaded image", "upload");
  };

  const onSample = (s: Sample) => addFromUrl(s.url, s.id, "sample");

  const onSearchNeighbour = (item: RetrievedImage) => {
    setLightbox(null);
    addFromUrl(item.image_url, item.ID, "neighbour");
  };

  const onK = (value: number) => {
    setK(value);
    // While a sample is downloading, the current query is about to be replaced; it will pick up the new k.
    if (current && current.k !== value && !prepareRef.current) runSearch(current, value);
  };

  const onRetry = () => current && runSearch(current, k);

  const onClear = () => {
    cancelPreparing();
    abortRef.current?.abort();
    setCurrentId(null);
    setLightbox(null);
    setFilter(null);
  };

  const onSelectRecent = (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    cancelPreparing();
    setCurrentId(id);
    setK(entry.k);
    setFilter(null);
    setLightbox(null);
    setReportOpen(false);
    if (entry.status === "idle") runSearch(entry, entry.k);
  };

  // Paste an image from the clipboard anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === "file" && i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      cancelPreparing();
      addQuery(file, file.name && file.name !== "image.png" ? file.name : "Pasted image", "paste");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addQuery, cancelPreparing]);

  const results = current?.status === "done" ? current.response?.results ?? [] : [];
  const visible = useMemo(
    () => (filter ? results.filter((r) => parseConcepts(r.concepts_manual).some((c) => c.cui === filter)) : results),
    [results, filter],
  );
  const rankOf = useCallback(
    (id: string) => results.findIndex((r) => r.ID === id) + 1,
    [results],
  );
  const closeLightbox = useCallback(() => setLightbox(null), []);
  const closeReport = useCallback(() => setReportOpen(false), []);
  const openResult = (index: number, withCompare = false) => {
    setCompare(withCompare);
    setLightbox(index);
  };

  return (
    <div className="app">
      <a className="skip-link" href="#content">
        Skip to results
      </a>
      <Header theme={theme} onCycleTheme={cycle} />

      <main className="layout">
        {current && <StudyBar entry={current} />}
        <aside className="sidebar" aria-label="Query">
          <QueryPanel
            serverUnreachable={api.status === "offline"}
            onRecheckServer={api.recheck}
            current={current}
            entries={entries}
            k={k}
            kOptions={K_OPTIONS}
            onK={onK}
            onFile={onUpload}
            onClear={onClear}
            onRetry={onRetry}
            samples={SAMPLES}
            onSample={onSample}
            preparing={preparing}
            onSelectRecent={onSelectRecent}
            notice={notice}
            onDismissNotice={() => setNotice(null)}
          />
        </aside>

        <section id="content" className="content" aria-label="Results">
          {!current && <EmptyState />}
          {current?.status === "loading" && (
            <>
              <LoadingState startedAt={current.startedAt} expectedMs={current.expectedMs} k={current.k} />
              <ResultsSkeleton count={current.k} />
            </>
          )}
          {current?.status === "error" && <ErrorState message={current.error ?? "Unknown error."} onRetry={onRetry} />}
          {current?.status === "idle" && (
            <ErrorState message="This search was interrupted before it finished." onRetry={onRetry} />
          )}
          {current?.status === "done" && current.response && (
            <>
              <Analysis
                response={current.response}
                elapsedMs={current.elapsedMs}
                onReport={() => setReportOpen(true)}
                filter={filter}
                onFilter={setFilter}
                onHighlight={setHighlight}
              />
              <Results
                results={results}
                visible={visible}
                filter={filter}
                onFilter={setFilter}
                highlight={highlight}
                onHighlight={setHighlight}
                onOpen={openResult}
              />
            </>
          )}
        </section>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <p>
            <strong>Research prototype — not for clinical use.</strong> Images and captions from ROCOv2 (PMC Open Access
            subset, CC BY-NC-SA 4.0). Retrieval: PubMedCLIP + FAISS. Captioning: BLIP-ROCO.
          </p>
          <p className="mono footer-api" title="Backend base URL">
            {API_URL}
          </p>
        </div>
      </footer>

      {lightbox !== null && visible[lightbox] && (
        <Lightbox
          items={visible}
          index={lightbox}
          rankOf={rankOf}
          onIndex={setLightbox}
          onClose={closeLightbox}
          onSearch={onSearchNeighbour}
          searching={preparing !== null}
          queryUrl={current?.previewUrl ?? ""}
          queryName={current?.name ?? ""}
          compare={compare}
          onCompare={setCompare}
        />
      )}

      {reportOpen && current?.status === "done" && current.response && (
        <ReportDialog
          entry={current}
          response={current.response}
          meta={reportMeta}
          onMeta={setReportMeta}
          onClose={closeReport}
        />
      )}
    </div>
  );
}
