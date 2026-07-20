import type { StorageConfig, StorageProviderKind } from './types';
import { parseAllowedMimeTypes, parseMaxFileSizeBytes, parseSizeMbWithDefault } from './validation';

/**
 * Main-thread storage config. As of the presigned-URL migration (see
 * docs/storage-module.md), this file no longer reads or holds any S3
 * credentials — those live only in `src/worker/worker.ts` /
 * `src/worker/presign.ts` (the simulated "backend"). What's left here is
 * just display/key-layout metadata; actual signing happens behind
 * `api.storagePresignPutUrl()`.
 */
export function loadStorageConfig(): StorageConfig {
  const kind = (import.meta.env.VITE_S3_KIND ?? 'custom') as StorageProviderKind;

  return {
    kind,
    bucket: import.meta.env.VITE_S3_BUCKET ?? '',
    // Display/UX-only copy of the limits the worker enforces for real —
    // see the comment on StorageConfig in ./types.ts.
    maxFileSizeBytes: parseMaxFileSizeBytes(import.meta.env.VITE_S3_MAX_FILE_SIZE_MB),
    allowedMimeTypes: parseAllowedMimeTypes(import.meta.env.VITE_S3_ALLOWED_MIME_TYPES),
    // Multipart tuning — see docs/storage-module.md, "Multipart upload for
    // large files". Defaults: switch to multipart at 100MB, 8MB per part.
    // S3 requires every part except the last to be >= 5MB, so clamp here
    // rather than letting a too-small VITE_S3_MULTIPART_PART_SIZE_MB
    // produce a REST error mid-upload.
    multipartThresholdBytes: parseSizeMbWithDefault(import.meta.env.VITE_S3_MULTIPART_THRESHOLD_MB, 100),
    multipartPartSizeBytes: Math.max(
      5 * 1024 * 1024,
      parseSizeMbWithDefault(import.meta.env.VITE_S3_MULTIPART_PART_SIZE_MB, 8),
    ),
  };
}

/** "Configured" now just means there's a bucket name to show/use for key
 * layout — we can't check for credentials here anymore since the main
 * thread doesn't have them. `useS3Upload()` treats a failed presign call
 * as the real signal that storage isn't set up. */
export function isStorageConfigured(config: StorageConfig): boolean {
  return Boolean(config.bucket);
}
