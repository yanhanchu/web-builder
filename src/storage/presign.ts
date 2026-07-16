import { api, ensureDbReady } from '../client';
import { StorageError, type PresignedPutUrl, type PresignedMultipartUrl } from './types';

/**
 * Logic-layer bridge to the simulated backend's presign endpoint.
 *
 * In a real deployment this would be a plain HTTP call to
 * `POST /api/presign` on a real backend. In this app the "backend" is the
 * Web Worker (see README), so this just calls `api.storagePresignPutUrl()`
 * over the existing Comlink RPC channel instead of `fetch()`. The shape of
 * this function (async, takes key + contentType, returns
 * `{ url, expiresAt }`) is intentionally what a real HTTP version would
 * look like too — swapping this body for a `fetch('/api/presign', ...)`
 * call later should not require changing any caller.
 */
export async function requestPresignedUrl(
  key: string,
  contentType: string,
  size: number,
): Promise<PresignedPutUrl> {
  await ensureDbReady(); // worker must be initialized before any RPC call, same as DB calls
  try {
    return await api.storagePresignPutUrl(key, contentType, size);
  } catch (error) {
    // Re-throws the worker's validation message (e.g. "File is too large...")
    // as-is when present, so the UI can show something actionable instead of
    // a generic failure — see validateUpload() in src/storage/validation.ts.
    const message = error instanceof Error ? error.message : 'Failed to obtain a presigned upload URL';
    throw new StorageError(message, error);
  }
}

/**
 * Multipart bridge functions — see docs/storage-module.md, "Multipart
 * upload for large files". Same shape/error-handling pattern as
 * `requestPresignedUrl()` above; `uploadObjectMultipart()` in
 * `s3Client.ts` is the only caller.
 */

async function callPresignRpc<T>(fallbackMessage: string, fn: () => Promise<T>): Promise<T> {
  await ensureDbReady();
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : fallbackMessage;
    throw new StorageError(message, error);
  }
}

export function requestMultipartInitiate(key: string, contentType: string): Promise<PresignedMultipartUrl> {
  return callPresignRpc('Failed to start multipart upload', () =>
    api.storagePresignMultipartInitiate(key, contentType),
  );
}

export function requestMultipartPartUrl(
  key: string,
  uploadId: string,
  partNumber: number,
): Promise<PresignedMultipartUrl> {
  return callPresignRpc('Failed to obtain a presigned URL for this part', () =>
    api.storagePresignMultipartPart(key, uploadId, partNumber),
  );
}

export function requestMultipartComplete(key: string, uploadId: string): Promise<PresignedMultipartUrl> {
  return callPresignRpc('Failed to finalize multipart upload', () =>
    api.storagePresignMultipartComplete(key, uploadId),
  );
}

export function requestMultipartAbort(key: string, uploadId: string): Promise<PresignedMultipartUrl> {
  return callPresignRpc('Failed to abort multipart upload', () =>
    api.storagePresignMultipartAbort(key, uploadId),
  );
}
