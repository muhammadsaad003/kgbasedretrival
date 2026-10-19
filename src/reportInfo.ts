// Lightweight report helpers kept apart from report.ts, so the main bundle doesn't pull in jsPDF.

export interface ReportMeta {
  caseId: string;
  preparedBy: string;
  notes: string;
  includeThumbnails: boolean;
}

export const EMPTY_REPORT_META: ReportMeta = { caseId: "", preparedBy: "", notes: "", includeThumbnails: true };

export function makeReportId(d = new Date()): string {
  const p = (v: number) => String(v).padStart(2, "0");
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
  return `RR-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-${rand}`;
}

export function reportFileName(reportId: string): string {
  return `RadRetrieval-Report-${reportId}.pdf`;
}

export function formatReportDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
