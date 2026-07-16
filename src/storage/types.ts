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
 */

/** Which flavor of S3-compatible endpoint we're talking to. Only affects
 * how the request URL/host is built (path-style vs virtual-hosted-style),
 * not the signing algorithm, which is identical for all three. */
export type StorageProviderKind = 'custom' | 'r2' | 'aws';

export interface StorageConfig {
  /** Provider flavor — controls URL shape only. */
  kind: StorageProviderKind;
  /** e.g. "http://192.168.123.11:9000" (custom/S2) or
   * "https://<account_id>.r2.cloudflarestorage.com" (R2). Not used for kind: 'aws'. */
  endpoint?: string;
  /** SigV4 region. S2/most self-hosted setups accept "us-east-1" as a default. */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Force path-style URLs (bucket in the path, not the hostname).
   * Required for most self-hosted S2 setups; not used for R2/AWS. */
  forcePathStyle?: boolean;
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
