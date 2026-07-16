import { requestPresignedUrl } from './presign';
import { StorageError, type UploadResult } from './types';

/**
 * Logic layer — framework-agnostic (no React).
 *
 * As of the presigned-URL migration (see docs/storage-module.md), this
 * file no longer signs anything itself. `uploadObject()` now:
 *   1. asks the "backend" (worker) for a presigned PUT URL for this key
 *      via `requestPresignedUrl()`
 *   2. PUTs the file straight to that URL — no Authorization header, no
 *      secret key, the signature is already in the URL's query string.
 *
 * The UI/hook layer still only calls `uploadObject()` below; nothing about
 * its call site changed.
 */

export interface UploadObjectOptions {
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

export async function uploadObject(
  key: string,
  file: File,
  options: UploadObjectOptions = {},
): Promise<UploadResult> {
  const contentType = file.type || 'application/octet-stream';
  const presigned = await requestPresignedUrl(key, contentType, file.size);

  if (presigned.expiresAt <= Date.now()) {
    // Defensive check only — in practice the worker just issued this URL,
    // so this should never trip unless expiresSeconds was set to ~0.
    throw new StorageError('Presigned URL already expired before upload could start');
  }

  const etag = await xhrPut(presigned.url, file, options);

  return {
    key,
    url: presigned.url.split('?')[0], // strip the signature query string for display/storage
    etag,
    size: file.size,
  };
}

/** Performs the PUT via XHR so we can report upload progress
 * (the fetch API has no upload progress event as of this writing).
 * No custom headers are set beyond what the browser sends automatically —
 * the presigned URL's query string already carries the full signature. */
function xhrPut(
  url: string,
  body: File,
  options: UploadObjectOptions,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) options.onProgress?.(e.loaded, e.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.getResponseHeader('ETag'));
      } else {
        reject(new StorageError(`Upload failed with status ${xhr.status}: ${xhr.responseText || xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new StorageError('Network error during upload'));
    xhr.onabort = () => reject(new StorageError('Upload canceled'));

    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        return;
      }
      options.signal.addEventListener('abort', () => xhr.abort());
    }

    xhr.send(body);
  });
}
