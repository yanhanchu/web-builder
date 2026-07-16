import { api, ensureDbReady } from '../client';
import { StorageError, type PresignedPutUrl } from './types';

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
export async function requestPresignedUrl(key: string, contentType: string): Promise<PresignedPutUrl> {
  await ensureDbReady(); // worker must be initialized before any RPC call, same as DB calls
  try {
    return await api.storagePresignPutUrl(key, contentType);
  } catch (error) {
    throw new StorageError('Failed to obtain a presigned upload URL', error);
  }
}
