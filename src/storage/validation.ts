/**
 * Pure validation helpers — no fetch/crypto/React, no secrets.
 *
 * Deliberately shared (imported) by both `src/storage/useS3Upload.ts` (main
 * thread, for instant UI feedback before even asking the worker) and
 * `src/worker/presign.ts` (the authoritative check — see
 * docs/storage-module.md, "File type / size validation, allowlist").
 *
 * This is safe to share, unlike `resolveHostAndPath()` in
 * `src/worker/presign.ts` (which is intentionally duplicated, not
 * imported): this file never touches credentials, so it doesn't matter
 * that it ends up in both the main bundle and the worker bundle.
 */

export interface UploadLimits {
  /** 0 or undefined = no size limit. */
  maxFileSizeBytes?: number;
  /** Empty/undefined = allow any content type. Supports exact types
   * ('application/pdf') and wildcard subtypes ('image/*'). */
  allowedMimeTypes?: string[];
}

/** Matches a content type against an allowlist entry, supporting the
 * `image/*` style wildcard. */
export function mimeTypeMatches(contentType: string, pattern: string): boolean {
  if (pattern === '*' || pattern === '*/*') return true;
  if (pattern.endsWith('/*')) {
    return contentType.split('/')[0] === pattern.slice(0, -2);
  }
  return contentType === pattern;
}

/** Returns an error message if the file violates the given limits, or
 * `null` if it's fine. Used identically on both sides of the RPC call. */
export function validateUpload(
  file: { size: number; contentType: string },
  limits: UploadLimits,
): string | null {
  const { maxFileSizeBytes, allowedMimeTypes } = limits;

  if (maxFileSizeBytes && file.size > maxFileSizeBytes) {
    return `File is too large (${formatBytes(file.size)}); max allowed is ${formatBytes(maxFileSizeBytes)}.`;
  }

  if (allowedMimeTypes && allowedMimeTypes.length > 0) {
    const ok = allowedMimeTypes.some((pattern) => mimeTypeMatches(file.contentType, pattern));
    if (!ok) {
      return `File type "${file.contentType || 'unknown'}" is not allowed. Allowed: ${allowedMimeTypes.join(', ')}.`;
    }
  }

  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/** Parses the `VITE_S3_ALLOWED_MIME_TYPES` env var (comma-separated, e.g.
 * "image/*,application/pdf"). Empty/unset means "no restriction". */
export function parseAllowedMimeTypes(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parses `VITE_S3_MAX_FILE_SIZE_MB` into bytes. Empty/unset/0 means
 * "no limit". */
export function parseMaxFileSizeBytes(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const mb = Number(raw);
  if (!Number.isFinite(mb) || mb <= 0) return undefined;
  return Math.round(mb * 1024 * 1024);
}
