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
export type StorageProviderKind = 'custom' | 'r2' | 'aws';

export interface StorageConfig {
  /** Provider flavor — controls URL shape only. Kept here for display /
   * key-layout purposes; the main thread never uses this to build a host
   * itself anymore (the worker/backend does, when presigning). */
  kind: StorageProviderKind;
  bucket: string;
}

/** Response shape for the simulated `POST /api/presign` call.
 * See `src/storage/presign.ts` and `src/worker/presign.ts`. */
export interface PresignedPutUrl {
  url: string;
  /** Epoch ms when the URL stops being valid (15 minutes from issuance by default). */
  expiresAt: number;
  key: string;
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

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'canceled';

export interface UploadResult {
  key: string;
  url: string;
  etag: string | null;
  size: number;
}

export class StorageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}
