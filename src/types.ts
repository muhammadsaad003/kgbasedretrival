import type { SearchResponse } from "./api";

export type EntrySource = "upload" | "paste" | "sample" | "neighbour";

export type EntryStatus = "idle" | "loading" | "done" | "error";

/** One query image and the latest search run for it. */
export interface QueryEntry {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  source: EntrySource;
  k: number;
  status: EntryStatus;
  /** Increments per run so late responses from superseded runs are ignored. */
  runId: number;
  startedAt: number | null;
  elapsedMs?: number;
  response?: SearchResponse;
  error?: string;
}
