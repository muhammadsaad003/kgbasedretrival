import type { SearchResponse } from "./api";

export type EntrySource = "upload" | "paste" | "sample" | "neighbour";

export type EntryStatus = "idle" | "loading" | "done" | "error";

/** One query image and the latest search run for it. */
export interface QueryEntry {
  id: string;
  /** Study-style identifier shown in the study bar, e.g. ACC-20261019-0003. */
  accession: string;
  createdAt: number;
  file: File;
  previewUrl: string;
  name: string;
  source: EntrySource;
  k: number;
  status: EntryStatus;
  /** Increments per run so late responses from superseded runs are ignored. */
  runId: number;
  startedAt: number | null;
  /** How long the current run is held before results are shown (the deliberate analysis delay). */
  expectedMs?: number;
  elapsedMs?: number;
  response?: SearchResponse;
  error?: string;
}
