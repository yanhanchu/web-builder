/**
 * Data layer — shapes only. No fetch/crypto logic lives in this file.
 *
 * This module is written against the S3 *protocol* (Signature V4 + REST),
 * which is implemented identically by:
 *   - AWS S3
 *   - S2 / any "S3-compatible" self-hosted endpoint (what this app is
 *     configured for by default — see src/storage/config.ts)
 *   - Cloudflare R2 (S3-compatible API)
 *
 * Swapping providers is a *config* change (endpoint/region/style), never a
 * code change — see config.ts and docs/storage-module.md.
 *
 * NOTE: as of the presigned-URL migration (see docs/storage-module.md),
 * this main-thread `StorageConfig` no longer carries any S3 credentials.
 * Signing now happens in `src/worker/presign.ts` (the "backend"), which
 * has its own separate `WorkerStorageConfig` that includes the secret key.
 */

/** Which flavor of S3-compatible endpoint we're talking to. Only affects
 * how the request URL/host is built (path-style vs virtual-hosted-style),
 * not the signing algorithm, which is identical for all three. */
export type StorageProviderKind = "custom" | "r2" | "aws";

export interface StorageConfig {
  /** Provider flavor — controls URL shape only. Kept here for display /
   * key-layout purposes; the main thread never uses this to build a host
   * itself anymore (the worker/backend does, when presigning). */
  kind: StorageProviderKind;
  bucket: string;
  /** Client-side copy of the same limits enforced (authoritatively) by the
   * worker in `storagePresignPutUrl()` — see `src/storage/validation.ts`.
   * Used only for instant UI feedback in `useS3Upload.addFiles()`, so a
   * bad file never even reaches the presign RPC. Not a security boundary:
   * it's plain JS in the main bundle and can be bypassed, which is exactly
   * why the worker re-checks the same limits before signing. */
  maxFileSizeBytes?: number;
  multipartThresholdBytes?: number;
  multipartPartSizeBytes?: number;
  allowedMimeTypes?: string[];
}

/** Response shape for the simulated `POST /api/presign` call.
 * See `src/storage/presign.ts` and `src/worker/presign.ts`. */
export interface PresignedPutUrl {
  url: string;
  /** Epoch ms when the URL stops being valid (15 minutes from issuance by default). */
  expiresAt: number;
  key: string;
}

/** Response shape for each multipart presign step (initiate/part/complete/abort).
 * See `src/worker/presign.ts`'s `signPresignedUrl()` — every step returns just
 * a signed URL + its expiry; any extra data (e.g. `UploadId`) is parsed from
 * the actual S3 XML response body by the caller in `s3Client.ts`, not carried
 * here. */
export interface PresignedMultipartUrl {
  url: string;
  /** Epoch ms when the URL stops being valid. */
  expiresAt: number;
}

/** One successfully-uploaded part in a multipart upload, as required by S3's
 * `CompleteMultipartUpload` XML body (`<Part><PartNumber>/<ETag>`).
 * `partNumber` is 1-based, per the S3 API. */
export interface CompletedPart {
  partNumber: number;
  etag: string;
}

/** One file the UI wants uploaded. Purely descriptive — no File object logic beyond holding a reference. */
export interface UploadItem {
  id: string;
  file: File;
  key: string;
  status: UploadStatus;
  progress: number;
  error?: string;
}

export type UploadStatus =
  | "queued"
  | "uploading"
  | "done"
  | "error"
  | "canceled";

export interface UploadResult {
  key: string;
  url: string;
  etag: string | null;
  size: number;
}

export class StorageError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "StorageError";
    console.error(cause);
  }
}
