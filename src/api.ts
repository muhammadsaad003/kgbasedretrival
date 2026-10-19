// Client for the FastAPI retrieval backend (see the Hugging Face Space `saad003/rad-retrieval-api`).

const DEFAULT_API_URL = "https://saad003-rad-retrieval-api.hf.space";

export const API_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");

export const IMAGE_BASE_URL = "https://huggingface.co/datasets/saad003/images04/resolve/main";

/** Generous timeout: a sleeping Space has to boot and load CLIP + BLIP before answering. */
const SEARCH_TIMEOUT_MS = 180_000;
const HEALTH_TIMEOUT_MS = 15_000;

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/** Formats both the browser (for the preview) and PIL (on the backend) can read. */
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/bmp", "image/gif"];
const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp|bmp|gif)$/i;

/** Returns an error message, or null when the file can be uploaded. */
export function validateImageFile(file: File): string | null {
  const typeOk = file.type ? ACCEPTED_TYPES.includes(file.type) : ACCEPTED_EXTENSIONS.test(file.name);
  if (!typeOk) {
    return `“${file.name}” is not a supported image. Use JPG, PNG, WebP, BMP or GIF (DICOM is not supported).`;
  }
  if (file.size === 0) return `“${file.name}” is empty.`;
  if (file.size > MAX_UPLOAD_BYTES) {
    return `“${file.name}” is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`;
  }
  return null;
}

export interface RetrievedImage {
  ID: string;
  split: string;
  caption: string;
  concepts_manual: string | null;
  /** Inner product of L2-normalised PubMedCLIP embeddings, i.e. cosine similarity. */
  score: number;
  image_url: string;
}

export interface SearchResponse {
  query_caption: string;
  /** Keyword rule applied to the caption on the backend. */
  modality: string;
  /** Present in the payload, but produced by `generate_random_scores()` on the backend, so not shown. */
  scores?: Record<string, number>;
  results: RetrievedImage[];
  /** True when the upload matched an indexed image (cosine > 0.9999): caption is the ROCOv2 ground truth. */
  is_dataset_image: boolean;
}

export class ApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function searchByImage(
  file: Blob,
  k: number,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const form = new FormData();
  form.append("file", file, file instanceof File ? file.name : "query.jpg");

  let res: Response;
  try {
    res = await fetch(`${API_URL}/search_by_image?k=${encodeURIComponent(k)}`, {
      method: "POST",
      body: form,
      signal: withTimeout(signal, SEARCH_TIMEOUT_MS),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiError("The request timed out. The Space may still be starting — try again in a minute.");
    }
    throw new ApiError("Could not reach the retrieval API. Check your connection; the Space may be restarting.");
  }

  if (!res.ok) {
    if (res.status === 500) {
      throw new ApiError(
        "The backend failed on this request (HTTP 500). Known causes: the file could not be decoded as an image, " +
          "or one of the retrieved neighbours has no concept annotations (common for PET/CT). Try a smaller k or another image.",
        500,
      );
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new ApiError("The Space is starting up or temporarily unavailable. Try again shortly.", res.status);
    }
    throw new ApiError(`The API responded with HTTP ${res.status}.`, res.status);
  }

  let data: SearchResponse;
  try {
    data = (await res.json()) as SearchResponse;
  } catch {
    throw new ApiError("The API returned a response that is not JSON. The Space may be starting up.");
  }
  if (!data || !Array.isArray(data.results)) {
    throw new ApiError("The API response is missing the results list.");
  }
  return data;
}

export async function checkHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/`, { signal: withTimeout(signal, HEALTH_TIMEOUT_MS) });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    return body?.status === "ok";
  } catch {
    return false;
  }
}

/** Download a dataset image so it can be re-submitted as a query. Bytes are kept as-is so exact matching still works. */
export async function fetchImageAsFile(url: string, name: string, signal?: AbortSignal): Promise<File> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new ApiError(`Could not download the image (HTTP ${res.status}).`, res.status);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

export function datasetImageUrl(id: string, split: string): string {
  return `${IMAGE_BASE_URL}/${split}/${id}.jpg`;
}
