import { datasetImageUrl } from "./api";

export interface Sample {
  id: string;
  label: string;
  description: string;
  url: string;
}

// One test-split image per modality; each was checked against the live API with k up to 24.
const SAMPLES_RAW: Array<[string, string, string]> = [
  ["ROCOv2_2023_test_000001", "CT", "Chest CT, aortic aneurysm"],
  ["ROCOv2_2023_test_000072", "X-ray", "Chest radiograph, post-op"],
  ["ROCOv2_2023_test_000641", "MRI", "Cervical spine, sagittal STIR"],
  ["ROCOv2_2023_test_000221", "Ultrasound", "Renal ultrasound"],
  ["ROCOv2_2023_test_000587", "Angiography", "Coronary angiogram"],
  ["ROCOv2_2023_test_009415", "PET", "Whole-body PET"],
];

export const SAMPLES: Sample[] = SAMPLES_RAW.map(([id, label, description]) => ({
  id,
  label,
  description,
  url: datasetImageUrl(id, "test"),
}));
