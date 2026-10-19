// Builds the downloadable A4 PDF report, entirely in the browser.
// Loaded lazily (with jsPDF) the first time a report is opened.

import { jsPDF } from "jspdf";
import { autoTable, type CellHookData } from "jspdf-autotable";
import type { SearchResponse } from "./api";
import {
  aggregateConcepts,
  GROUP_LABEL,
  modalityConsensus,
  parseConcepts,
  textModalityMatches,
  type ConceptGroup,
  type ConceptStat,
} from "./concepts";
import { formatReportDate, type ReportMeta } from "./reportInfo";
import type { QueryEntry } from "./types";

export interface ReportOptions {
  entry: QueryEntry;
  response: SearchResponse;
  meta: ReportMeta;
  reportId: string;
  generatedAt: Date;
}

export interface ReportResult {
  blob: Blob;
  pages: number;
}

type RGB = [number, number, number];

const C = {
  ink: [20, 27, 38] as RGB,
  muted: [80, 90, 104] as RGB,
  faint: [128, 138, 151] as RGB,
  primary: [11, 57, 84] as RGB,
  primarySoft: [178, 207, 222] as RGB,
  accent: [14, 138, 124] as RGB,
  rule: [212, 220, 227] as RGB,
  panel: [244, 247, 249] as RGB,
  okBg: [225, 243, 233] as RGB,
  okInk: [22, 110, 62] as RGB,
  genBg: [252, 241, 220] as RGB,
  genInk: [140, 88, 8] as RGB,
  warnInk: [122, 78, 6] as RGB,
};

const GROUP_RGB: Record<ConceptGroup, RGB> = {
  modality: [14, 138, 124],
  region: [106, 85, 212],
  view: [196, 124, 18],
  other: [120, 128, 140],
};

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;
const CONTENT_W = PAGE_W - 2 * M;
const TOP = 22; // content top on continuation pages
const BOTTOM = PAGE_H - 22; // content must end above the footer
const PT = 0.3528; // mm per point

const SOURCE_LABEL: Record<QueryEntry["source"], string> = {
  upload: "Uploaded by user",
  paste: "Pasted from clipboard",
  sample: "ROCOv2 test-split sample",
  neighbour: "Retrieved reference case",
};

const MODALITY_PHRASE: Record<string, string> = {
  C0040405: "computed tomography (CT)",
  C1306645: "plain radiography (X-ray)",
  C0024485: "magnetic resonance imaging (MRI)",
  C0041618: "ultrasonography",
  C0002978: "angiography",
  C0032743: "positron emission tomography (PET)",
};

const REGION_PHRASE: Record<string, string> = {
  C0817096: "chest",
  C0037303: "skull",
  C0000726: "abdomen",
  C0030797: "pelvis",
  C0037949: "spine",
  C0023216: "lower limb",
  C1140618: "upper limb",
  C0006141: "breast",
};

const VIEW_PHRASE: Record<string, string> = {
  C1999039: "anteroposterior (AP) projection",
  C1996865: "posteroanterior (PA) projection",
  C0205129: "sagittal plane",
  C0205106: "transverse plane",
};

// ------------------------------------------------------------------ text

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/[‘’‚′]/g, "'"],
  [/[“”„″]/g, '"'],
  [/[–—−]/g, "-"],
  [/…/g, "..."],
  [/•/g, "-"],
  [/≥/g, ">="],
  [/≤/g, "<="],
  [/μ/g, "µ"],
  [/[   ]/g, " "],
  [/α/g, "alpha"],
  [/β/g, "beta"],
  [/γ/g, "gamma"],
  [/[Δδ]/g, "delta"],
];

/** The standard PDF fonts only cover Latin-1, so map or drop anything outside it. */
export function pdfSafe(input: string | null | undefined): string {
  let s = String(input ?? "").normalize("NFC");
  for (const [re, rep] of REPLACEMENTS) s = s.replace(re, rep);
  s = s.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, (ch) => {
    const stripped = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    return /^[\x20-\x7E\xA0-\xFF]+$/.test(stripped) ? stripped : " ";
  });
  return s.replace(/[ \t]{2,}/g, " ").trim();
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// ------------------------------------------------------------------ images

interface Raster {
  dataUrl: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}

async function rasterize(blob: Blob, maxSide: number, quality: number): Promise<Raster> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  const result = {
    dataUrl: canvas.toDataURL("image/jpeg", quality),
    width,
    height,
    sourceWidth: bitmap.width,
    sourceHeight: bitmap.height,
  };
  bitmap.close();
  return result;
}

const thumbCache = new Map<string, Promise<Raster | null>>();

function loadThumb(url: string): Promise<Raster | null> {
  let p = thumbCache.get(url);
  if (!p) {
    p = fetch(url)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => rasterize(blob, 360, 0.86))
      .catch(() => {
        thumbCache.delete(url); // allow a retry on the next build
        return null;
      });
    thumbCache.set(url, p);
  }
  return p;
}

function fitBox(img: Raster, boxW: number, boxH: number) {
  const s = Math.min(boxW / img.width, boxH / img.height);
  const w = img.width * s;
  const h = img.height * s;
  return { w, h, dx: (boxW - w) / 2, dy: (boxH - h) / 2 };
}

// ------------------------------------------------------------------ analysis text

function topOfGroup(stats: ConceptStat[], group: ConceptGroup): ConceptStat | undefined {
  return stats.filter((s) => s.concept.group === group).sort((a, b) => b.count - a.count || b.weight - a.weight)[0];
}

function buildImpression(response: SearchResponse, stats: ConceptStat[]): string[] {
  const results = response.results;
  const n = results.length;
  const consensus = modalityConsensus(results);
  const agreement = textModalityMatches(response.modality, consensus);
  const mean = n ? results.reduce((s, r) => s + r.score, 0) / n : 0;
  const lines: string[] = [];

  if (consensus) {
    const region = topOfGroup(stats, "region");
    const view = topOfGroup(stats, "view");
    const regionText = region && region.count / n >= 0.5 ? ` of the ${REGION_PHRASE[region.concept.cui] ?? region.concept.label.toLowerCase()}` : "";
    const viewText = view && view.count / n >= 0.5 ? `, ${VIEW_PHRASE[view.concept.cui] ?? view.concept.label}` : "";
    const modality = MODALITY_PHRASE[consensus.concept.cui] ?? consensus.concept.label;
    lines.push(
      `${capitalise(modality)}${regionText}${viewText}, supported by ${consensus.count} of ${n} retrieved reference cases (mean cosine similarity ${mean.toFixed(3)}).`,
    );
  } else {
    lines.push(`No curated modality concepts were available among the ${n} retrieved reference cases.`);
  }

  if (agreement === true) {
    lines.push(`Caption keyword analysis independently indicates ${response.modality}.`);
  } else if (agreement === false) {
    lines.push(
      `Caption keyword analysis suggests ${response.modality}, which disagrees with the concept consensus; manual review is advised.`,
    );
  } else {
    lines.push("Caption keyword analysis was inconclusive.");
  }

  lines.push(
    response.is_dataset_image
      ? "The query image is an exact match to an image in the ROCOv2 reference index; the findings reproduce its published caption."
      : "The query image is not in the reference index; the findings are a machine-generated description and may be inaccurate.",
  );
  return lines;
}

// ------------------------------------------------------------------ PDF

export async function buildReportPdf(opts: ReportOptions): Promise<ReportResult> {
  const { entry, response, meta, reportId, generatedAt } = opts;
  const results = response.results;
  const n = results.length;
  const stats = aggregateConcepts(results);
  const consensus = modalityConsensus(results);
  const agreement = textModalityMatches(response.modality, consensus);
  const top1 = results[0]?.score;
  const mean = n ? results.reduce((s, r) => s + r.score, 0) / n : undefined;
  const dateText = formatReportDate(generatedAt);

  const [queryImg, thumbs] = await Promise.all([
    rasterize(entry.file, 1400, 0.92).catch(() => null),
    meta.includeThumbnails ? Promise.all(results.map((r) => loadThumb(r.image_url))) : Promise.resolve([]),
  ]);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  doc.setProperties({
    title: `Radiology image retrieval report ${reportId}`,
    subject: "Retrieval-based radiology image report (research use only)",
    author: pdfSafe(meta.preparedBy) || "RadRetrieval",
    creator: "RadRetrieval",
    keywords: "radiology, image retrieval, ROCOv2, PubMedCLIP, UMLS",
  });

  let y = 0;

  const font = (style: "normal" | "bold" | "italic", size: number, color: RGB = C.ink, family = "helvetica") => {
    doc.setFont(family, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const lineH = (size: number, factor = 1.35) => size * PT * factor;
  const ensure = (needed: number) => {
    if (y + needed > BOTTOM) {
      doc.addPage();
      y = TOP;
    }
  };
  const truncate = (text: string, width: number) => {
    let t = pdfSafe(text);
    if (doc.getTextWidth(t) <= width) return t;
    while (t.length > 1 && doc.getTextWidth(`${t}...`) > width) t = t.slice(0, -1);
    return `${t}...`;
  };
  const paragraph = (text: string, x: number, width: number, size: number, color: RGB, style: "normal" | "bold" | "italic" = "normal") => {
    font(style, size, color);
    const lines = doc.splitTextToSize(pdfSafe(text), width) as string[];
    doc.text(lines, x, y, { lineHeightFactor: 1.35 });
    y += lines.length * lineH(size);
  };
  const section = (title: string, needed: number) => {
    ensure(needed + 10);
    y += 2;
    doc.setFillColor(...C.accent);
    doc.rect(M, y - 3.1, 1.1, 3.9, "F");
    font("bold", 8.6, C.primary);
    doc.text(title.toUpperCase(), M + 3.4, y, { charSpace: 0.3 });
    doc.setDrawColor(...C.rule);
    doc.setLineWidth(0.25);
    doc.line(M, y + 2.2, PAGE_W - M, y + 2.2);
    y += 7.5;
  };
  const tag = (text: string, xRight: number, baseline: number, bg: RGB, ink: RGB) => {
    font("bold", 6.4, ink);
    const label = pdfSafe(text).toUpperCase();
    const w = doc.getTextWidth(label) + 0.25 * label.length + 4;
    doc.setFillColor(...bg);
    doc.roundedRect(xRight - w, baseline - 3.3, w, 4.7, 1.1, 1.1, "F");
    doc.text(label, xRight - w + 2, baseline, { charSpace: 0.25 });
  };

  // ---------------- Header band
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, PAGE_W, 30, "F");
  doc.setFillColor(...C.accent);
  doc.rect(0, 30, PAGE_W, 1.2, "F");

  const lx = M + 6.5;
  const ly = 15;
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.7);
  doc.circle(lx, ly, 6.2, "S");
  doc.setLineWidth(0.35);
  doc.line(lx, ly - 6.2, lx, ly + 6.2);
  doc.line(lx - 6.2, ly, lx + 6.2, ly);
  doc.setFillColor(255, 255, 255);
  doc.circle(lx, ly, 2, "F");

  font("bold", 16.5, [255, 255, 255]);
  doc.text("RadRetrieval", M + 16.5, 14);
  font("normal", 9.2, C.primarySoft);
  doc.text("Retrieval-Based Radiology Image Report", M + 16.5, 20);

  font("bold", 6.8, C.primarySoft);
  doc.text("REPORT NO.", PAGE_W - M, 10.5, { align: "right", charSpace: 0.3 });
  font("bold", 10.5, [255, 255, 255], "courier");
  doc.text(reportId, PAGE_W - M, 16, { align: "right" });
  font("normal", 8, C.primarySoft);
  doc.text(`Generated ${dateText}`, PAGE_W - M, 21.5, { align: "right" });

  y = 38;
  font("bold", 6.8, C.warnInk);
  doc.text("FOR RESEARCH AND EDUCATIONAL USE ONLY  -  NOT A DIAGNOSTIC REPORT", PAGE_W / 2, y, {
    align: "center",
    charSpace: 0.35,
  });
  y += 7;

  // ---------------- Study information
  section("Study information", 46);
  const info: Array<[string, string]> = [
    ["Patient / case ID", meta.caseId.trim() || "Not provided"],
    ["Prepared by", meta.preparedBy.trim() || "Not provided"],
    ["Image file", entry.name],
    ["Image source", SOURCE_LABEL[entry.source]],
    ["Report date", dateText],
    ["Dataset match", response.is_dataset_image ? "Yes - exact match in ROCOv2 index" : "No - image not in reference index"],
    ["Retrieval", `PubMedCLIP ViT-B/32 + FAISS, k = ${n}`],
    ["Findings source", response.is_dataset_image ? "ROCOv2 reference caption" : "BLIP-ROCO generated caption"],
  ];
  const rowsPerCol = Math.ceil(info.length / 2);
  const colW = CONTENT_W / 2;
  const rowH = 10.4;
  const boxH = rowsPerCol * rowH;
  doc.setDrawColor(...C.rule);
  doc.setLineWidth(0.25);
  doc.roundedRect(M, y, CONTENT_W, boxH, 1.6, 1.6, "S");
  doc.line(M + colW, y + 2, M + colW, y + boxH - 2);
  info.forEach(([label, value], i) => {
    const col = Math.floor(i / rowsPerCol);
    const row = i % rowsPerCol;
    const x = M + col * colW + 4;
    const top = y + row * rowH;
    if (row > 0) {
      doc.setDrawColor(...C.rule);
      doc.line(M + col * colW + 3, top, M + (col + 1) * colW - 3, top);
    }
    font("normal", 6.6, C.faint);
    doc.text(label.toUpperCase(), x, top + 4, { charSpace: 0.2 });
    font("bold", 9.2, C.ink);
    doc.text(truncate(value, colW - 8), x, top + 8.4);
  });
  y += boxH + 4;

  const notes = pdfSafe(meta.notes);
  if (notes) {
    font("normal", 9, C.ink);
    const lines = doc.splitTextToSize(notes, CONTENT_W - 8) as string[];
    const h = 8 + lines.length * lineH(9);
    ensure(h + 4);
    doc.setFillColor(...C.panel);
    doc.setDrawColor(...C.rule);
    doc.roundedRect(M, y, CONTENT_W, h, 1.6, 1.6, "FD");
    font("normal", 6.6, C.faint);
    doc.text("CLINICAL INDICATION / NOTES", M + 4, y + 4.2, { charSpace: 0.2 });
    font("normal", 9, C.ink);
    doc.text(lines, M + 4, y + 8.6, { lineHeightFactor: 1.35 });
    y += h + 4;
  }

  // ---------------- Image and findings
  section("Image and findings", 76);
  const imgSize = 66;
  const top = y;
  doc.setFillColor(0, 0, 0);
  doc.roundedRect(M, top, imgSize, imgSize, 1.6, 1.6, "F");
  if (queryImg) {
    const f = fitBox(queryImg, imgSize - 2, imgSize - 2);
    doc.addImage(queryImg.dataUrl, "JPEG", M + 1 + f.dx, top + 1 + f.dy, f.w, f.h, undefined, "FAST");
  } else {
    font("normal", 8, [180, 180, 180]);
    doc.text("Image unavailable", M + imgSize / 2, top + imgSize / 2, { align: "center" });
  }
  font("normal", 6.8, C.faint);
  doc.text(
    queryImg ? `Query image  -  ${queryImg.sourceWidth} x ${queryImg.sourceHeight} px` : "Query image",
    M,
    top + imgSize + 4,
  );

  const rx = M + imgSize + 7;
  const rw = CONTENT_W - imgSize - 7;
  y = top + 3.2;
  font("bold", 7.6, C.primary);
  doc.text("FINDINGS", rx, y, { charSpace: 0.3 });
  if (response.is_dataset_image) tag("Reference caption - ROCOv2", rx + rw, y, C.okBg, C.okInk);
  else tag("AI-generated caption - BLIP-ROCO", rx + rw, y, C.genBg, C.genInk);
  y += 6;
  paragraph(response.query_caption || "No caption was returned.", rx, rw, 10.6, C.ink);
  y += 4;
  font("bold", 7.6, C.primary);
  doc.text("IMPRESSION", rx, y, { charSpace: 0.3 });
  y += 5.5;
  buildImpression(response, stats).forEach((line, i) => {
    paragraph(line, rx, rw, 9.2, i === 0 ? C.ink : C.muted, i === 0 ? "bold" : "normal");
    y += 1.6;
  });
  y = Math.max(top + imgSize + 9, y + 3);

  // ---------------- Retrieval summary
  section("Retrieval summary", 36);
  const region = topOfGroup(stats, "region");
  const view = topOfGroup(stats, "view");
  const metrics: Array<{ label: string; value: string; sub?: string; color: RGB }> = [
    {
      label: "Modality (concept consensus)",
      value: consensus?.concept.label ?? "Not annotated",
      sub: consensus ? `${consensus.count}/${consensus.total} cases` : undefined,
      color: GROUP_RGB.modality,
    },
    {
      label: "Body region",
      value: region?.concept.label ?? "Not annotated",
      sub: region ? `${region.count}/${n} cases` : undefined,
      color: GROUP_RGB.region,
    },
    {
      label: "View / projection",
      value: view?.concept.label ?? "Not annotated",
      sub: view ? `${view.count}/${n} cases` : undefined,
      color: GROUP_RGB.view,
    },
    {
      label: "Modality (caption keywords)",
      value: response.modality || "Unknown",
      sub: agreement === true ? "agrees" : agreement === false ? "disagrees" : undefined,
      color: C.faint,
    },
    { label: "Top-1 cosine similarity", value: top1 !== undefined ? top1.toFixed(3) : "-", color: C.primary },
    {
      label: "Mean cosine similarity",
      value: mean !== undefined ? mean.toFixed(3) : "-",
      sub: `k = ${n}`,
      color: C.primary,
    },
  ];
  const gap = 4;
  const mW = (CONTENT_W - 2 * gap) / 3;
  const mH = 14.5;
  metrics.forEach((m, i) => {
    const x = M + (i % 3) * (mW + gap);
    const by = y + Math.floor(i / 3) * (mH + 3.5);
    doc.setFillColor(...C.panel);
    doc.setDrawColor(...C.rule);
    doc.roundedRect(x, by, mW, mH, 1.4, 1.4, "FD");
    doc.setFillColor(...m.color);
    doc.rect(x, by + 2.5, 1, mH - 5, "F");
    font("normal", 6.4, C.faint);
    doc.text(m.label.toUpperCase(), x + 4, by + 5, { charSpace: 0.15 });
    font("bold", 11.2, C.ink);
    const value = truncate(m.value, mW - 8);
    doc.text(value, x + 4, by + 11);
    if (m.sub) {
      const vw = doc.getTextWidth(value);
      font("normal", 7.6, m.sub === "disagrees" ? C.genInk : m.sub === "agrees" ? C.okInk : C.muted);
      doc.text(m.sub, x + 4 + vw + 2, by + 11);
    }
  });
  y += 2 * mH + 3.5 + 6;

  const tableBase = {
    margin: { left: M, right: M, top: TOP, bottom: PAGE_H - BOTTOM },
    theme: "plain" as const,
    styles: {
      font: "helvetica",
      fontSize: 8.2,
      textColor: C.ink,
      cellPadding: { top: 2, bottom: 2, left: 2.4, right: 2.4 },
      valign: "middle" as const,
      overflow: "linebreak" as const,
    },
    headStyles: { fillColor: C.primary, textColor: [255, 255, 255] as RGB, fontStyle: "bold" as const, fontSize: 7.4 },
    alternateRowStyles: { fillColor: C.panel },
    showHead: "everyPage" as const,
  };
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // ---------------- Concept profile
  section("Concept profile (UMLS)", 30);
  if (stats.length === 0) {
    paragraph("None of the retrieved reference cases carry curated concepts.", M, CONTENT_W, 8.6, C.muted);
    y += 4;
  } else {
    font("normal", 8, C.muted);
    doc.text(`Curated ROCOv2 concepts carried by the ${n} retrieved reference cases.`, M, y);
    y += 3;
    autoTable(doc, {
      ...tableBase,
      startY: y,
      head: [["Concept", "UMLS canonical name", "CUI", "Category", "Cases", "Share of k"]],
      body: stats.map((s) => [
        s.concept.label,
        s.concept.name,
        s.concept.cui,
        GROUP_LABEL[s.concept.group],
        `${s.count}/${n}`,
        "",
      ]),
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 27, cellPadding: { top: 2, bottom: 2, left: 6, right: 2 } },
        2: { font: "courier", cellWidth: 21 },
        3: { cellWidth: 24 },
        4: { cellWidth: 14, halign: "right" },
        5: { cellWidth: 40 },
      },
      didDrawCell: (d: CellHookData) => {
        if (d.section !== "body") return;
        const s = stats[d.row.index];
        if (d.column.index === 0) {
          doc.setFillColor(...GROUP_RGB[s.concept.group]);
          doc.circle(d.cell.x + 3.2, d.cell.y + d.cell.height / 2, 0.9, "F");
        }
        if (d.column.index === 5) {
          const share = s.count / Math.max(1, n);
          const bx = d.cell.x + 2.4;
          const bw = d.cell.width - 16;
          const by = d.cell.y + d.cell.height / 2 - 1.1;
          doc.setFillColor(...C.rule);
          doc.roundedRect(bx, by, bw, 2.2, 1.1, 1.1, "F");
          doc.setFillColor(...GROUP_RGB[s.concept.group]);
          if (share > 0) doc.roundedRect(bx, by, Math.max(2.2, bw * share), 2.2, 1.1, 1.1, "F");
          font("normal", 7.6, C.muted);
          doc.text(`${Math.round(share * 100)}%`, d.cell.x + d.cell.width - 2.4, by + 1.9, { align: "right" });
        }
      },
    });
    y = finalY() + 8;
  }

  // ---------------- Similar reference cases
  section("Similar reference cases", 40);
  font("normal", 8, C.muted);
  doc.text(
    `${n} nearest neighbours from ROCOv2 (PMC Open Access), ranked by cosine similarity of PubMedCLIP image embeddings.`,
    M,
    y,
  );
  y += 3;
  const withThumbs = meta.includeThumbnails;
  const imgCol = withThumbs ? 1 : -1;
  autoTable(doc, {
    ...tableBase,
    startY: y,
    rowPageBreak: "avoid",
    head: [["#", ...(withThumbs ? ["Image"] : []), "Case", "Similarity", "Reference caption", "Concepts"]],
    body: results.map((r, i) => [
      String(i + 1),
      ...(withThumbs ? [""] : []),
      `${r.ID.replace("ROCOv2_2023_", "")}\n${r.split.toUpperCase()}`,
      r.score.toFixed(3),
      pdfSafe(r.caption) || "-",
      parseConcepts(r.concepts_manual)
        .map((c) => c.label)
        .join(", ") || "-",
    ]),
    bodyStyles: withThumbs ? { minCellHeight: 25 } : undefined,
    columnStyles: withThumbs
      ? {
          0: { cellWidth: 8, halign: "center", fontStyle: "bold" },
          1: { cellWidth: 25 },
          2: { cellWidth: 25, font: "courier", fontSize: 7.4 },
          3: { cellWidth: 17, halign: "center", fontStyle: "bold" },
          5: { cellWidth: 27, fontSize: 7.6 },
        }
      : {
          0: { cellWidth: 8, halign: "center", fontStyle: "bold" },
          1: { cellWidth: 27, font: "courier", fontSize: 7.4 },
          2: { cellWidth: 18, halign: "center", fontStyle: "bold" },
          4: { cellWidth: 30, fontSize: 7.6 },
        },
    didDrawCell: (d: CellHookData) => {
      if (d.section !== "body" || d.column.index !== imgCol) return;
      const size = Math.min(d.cell.width - 3, d.cell.height - 3, 22);
      const x = d.cell.x + (d.cell.width - size) / 2;
      const yy = d.cell.y + (d.cell.height - size) / 2;
      doc.setFillColor(0, 0, 0);
      doc.rect(x, yy, size, size, "F");
      const t = thumbs[d.row.index];
      if (t) {
        const f = fitBox(t, size, size);
        doc.addImage(t.dataUrl, "JPEG", x + f.dx, yy + f.dy, f.w, f.h, `thumb-${d.row.index}`, "FAST");
      } else {
        font("normal", 6, [170, 170, 170]);
        doc.text("n/a", x + size / 2, yy + size / 2 + 1, { align: "center" });
      }
    },
  });
  y = finalY() + 16;

  // ---------------- Sign-off
  ensure(22);
  const sigW = (CONTENT_W - 2 * 8) / 3;
  const sigLabels = ["Prepared by", "Reviewed by (radiologist)", "Date / time"];
  sigLabels.forEach((label, i) => {
    const x = M + i * (sigW + 8);
    if (i === 0 && meta.preparedBy.trim()) {
      font("italic", 10, C.ink);
      doc.text(truncate(meta.preparedBy, sigW), x, y + 6);
    }
    doc.setDrawColor(...C.muted);
    doc.setLineWidth(0.3);
    doc.line(x, y + 8, x + sigW, y + 8);
    font("normal", 7.2, C.faint);
    doc.text(label.toUpperCase(), x, y + 12, { charSpace: 0.2 });
  });

  // ---------------- Running header and footer
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (i > 1) {
      font("bold", 8, C.primary);
      doc.text("RadRetrieval", M, 11);
      font("normal", 8, C.faint);
      doc.text("Retrieval-Based Radiology Image Report", M + 20, 11);
      font("normal", 8, C.primary, "courier");
      doc.text(reportId, PAGE_W - M, 11, { align: "right" });
      doc.setDrawColor(...C.accent);
      doc.setLineWidth(0.5);
      doc.line(M, 14, PAGE_W - M, 14);
    }
    doc.setDrawColor(...C.rule);
    doc.setLineWidth(0.25);
    doc.line(M, PAGE_H - 14, PAGE_W - M, PAGE_H - 14);
    font("normal", 7, C.faint);
    doc.text(`RadRetrieval  -  ${reportId}`, M, PAGE_H - 9.5);
    doc.text("Research use only - not for diagnostic use", PAGE_W / 2, PAGE_H - 9.5, { align: "center" });
    doc.text(`Page ${i} of ${pages}`, PAGE_W - M, PAGE_H - 9.5, { align: "right" });
  }

  return { blob: doc.output("blob"), pages };
}
