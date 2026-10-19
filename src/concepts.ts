// UMLS concepts used in ROCOv2's manually curated annotations (`concepts_manual`).
// Canonical names are from ROCOv2's cui_mapping.csv (Zenodo record 10821435).
// These 18 CUIs are every concept present in radiology_metadata.csv.

import type { RetrievedImage } from "./api";

export type ConceptGroup = "modality" | "region" | "view" | "other";

export interface Concept {
  cui: string;
  /** Canonical UMLS name as published with ROCOv2. */
  name: string;
  /** Short label for chips. */
  label: string;
  group: ConceptGroup;
}

const TABLE: Array<[string, string, string, ConceptGroup]> = [
  ["C0040405", "X-Ray Computed Tomography", "CT", "modality"],
  ["C1306645", "Plain x-ray", "X-ray", "modality"],
  ["C0024485", "Magnetic Resonance Imaging", "MRI", "modality"],
  ["C0041618", "Ultrasonography", "Ultrasound", "modality"],
  ["C0002978", "angiogram", "Angiography", "modality"],
  ["C0032743", "Positron-Emission Tomography", "PET", "modality"],
  ["C0817096", "Chest", "Chest", "region"],
  ["C0037303", "Bone structure of cranium", "Skull", "region"],
  ["C0000726", "Abdomen", "Abdomen", "region"],
  ["C0030797", "Pelvis", "Pelvis", "region"],
  ["C0037949", "Vertebral column", "Spine", "region"],
  ["C0023216", "Lower Extremity", "Lower limb", "region"],
  ["C1140618", "Upper Extremity", "Upper limb", "region"],
  ["C0006141", "Breast", "Breast", "region"],
  ["C1999039", "Anterior-Posterior", "AP view", "view"],
  ["C1996865", "Postero-Anterior", "PA view", "view"],
  ["C0205129", "Sagittal", "Sagittal", "view"],
  ["C0205106", "Transverse - anatomical location", "Transverse", "view"],
];

const CONCEPTS = new Map<string, Concept>(
  TABLE.map(([cui, name, label, group]) => [cui, { cui, name, label, group }]),
);

export const GROUP_LABEL: Record<ConceptGroup, string> = {
  modality: "Modality",
  region: "Body region",
  view: "View",
  other: "Other",
};

const GROUP_ORDER: Record<ConceptGroup, number> = { modality: 0, region: 1, view: 2, other: 3 };

export function describeConcept(cui: string): Concept {
  return CONCEPTS.get(cui) ?? { cui, name: cui, label: cui, group: "other" };
}

export function parseConcepts(raw: string | null | undefined): Concept[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: Concept[] = [];
  for (const part of String(raw).split(/[;,\s]+/)) {
    const cui = part.trim().toUpperCase();
    if (!/^C\d{7}$/.test(cui) || seen.has(cui)) continue;
    seen.add(cui);
    out.push(describeConcept(cui));
  }
  return out.sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group]);
}

export interface ConceptStat {
  concept: Concept;
  count: number;
  /** Sum of similarity scores of the neighbours carrying this concept. */
  weight: number;
}

export function aggregateConcepts(results: RetrievedImage[]): ConceptStat[] {
  const stats = new Map<string, ConceptStat>();
  for (const r of results) {
    for (const c of parseConcepts(r.concepts_manual)) {
      const s = stats.get(c.cui) ?? { concept: c, count: 0, weight: 0 };
      s.count += 1;
      s.weight += r.score;
      stats.set(c.cui, s);
    }
  }
  return [...stats.values()].sort(
    (a, b) =>
      GROUP_ORDER[a.concept.group] - GROUP_ORDER[b.concept.group] || b.count - a.count || b.weight - a.weight,
  );
}

export interface ModalityConsensus {
  concept: Concept;
  count: number;
  total: number;
}

/** Similarity-weighted vote over the modality concepts of the retrieved neighbours. */
export function modalityConsensus(results: RetrievedImage[]): ModalityConsensus | null {
  const modal = aggregateConcepts(results).filter((s) => s.concept.group === "modality");
  if (modal.length === 0) return null;
  const best = modal.reduce((a, b) => (b.weight > a.weight ? b : a));
  return { concept: best.concept, count: best.count, total: results.length };
}

// Labels returned by the backend's caption keyword rule, mapped onto modality CUIs for comparison.
const TEXT_MODALITY_TO_CUI: Record<string, string> = {
  CT: "C0040405",
  "X-ray": "C1306645",
  MRI: "C0024485",
  Ultrasound: "C0041618",
  "Nuclear medicine / PET": "C0032743",
};

export function textModalityMatches(textModality: string, consensus: ModalityConsensus | null): boolean | null {
  if (!consensus || !textModality || textModality === "Unknown") return null;
  const cui = TEXT_MODALITY_TO_CUI[textModality];
  if (!cui) return null;
  return cui === consensus.concept.cui;
}
