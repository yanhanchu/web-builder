import {
  requestPresignedUrl,
  requestMultipartInitiate,
  requestMultipartPartUrl,
  requestMultipartComplete,
  requestMultipartAbort,
} from './presign';
import { StorageError, type UploadResult, type CompletedPart } from './types';

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
 * The UI/hook layer still only calls `uploadObject()` / `uploadObjectMultipart()`
 * below; nothing about the call site changed for the single-PUT path.
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

/**
 * Multipart upload for files at/above the configured threshold — see
 * docs/storage-module.md, "Multipart upload for large files". Kept
 * intentionally simple: parts are uploaded sequentially (not in
 * parallel), and there's no resume across a page reload — a retry starts
 * a brand new multipart upload from part 1. Good enough to get past the
 * single-PUT size ceiling; revisit if you need faster large-file uploads.
 *
 * Flow: initiate (get an UploadId) → PUT each part → complete. Any
 * failure (including cancellation via `options.signal`) triggers a
 * best-effort abort so the bucket doesn't accumulate orphaned parts.
 */
export interface UploadObjectMultipartOptions extends UploadObjectOptions {
  /** Size of each part in bytes. Clamped up to S3's 5MB-per-part minimum. */
  partSizeBytes: number;
}

export async function uploadObjectMultipart(
  key: string,
  file: File,
  options: UploadObjectMultipartOptions,
): Promise<UploadResult> {
  const contentType = file.type || 'application/octet-stream';
  const partSize = Math.max(options.partSizeBytes, 5 * 1024 * 1024);
  const totalParts = Math.max(1, Math.ceil(file.size / partSize));

  const initiate = await requestMultipartInitiate(key, contentType);
  const initiateRes = await xhrRequest('POST', initiate.url, null, {
    signal: options.signal,
    headers: { 'Content-Type': contentType },
  });
  const uploadId = parseXmlTag(initiateRes.responseText, 'UploadId');
  if (!uploadId) {
    throw new StorageError('Multipart initiate did not return an UploadId');
  }

  const completedParts: CompletedPart[] = [];
  let uploadedBytes = 0;

  try {
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, file.size);
      const chunk = file.slice(start, end);
      const bytesBeforeThisPart = uploadedBytes;

      const partUrl = await requestMultipartPartUrl(key, uploadId, partNumber);
      const etag = await xhrPut(partUrl.url, chunk, {
        signal: options.signal,
        onProgress: (loaded) => {
          options.onProgress?.(bytesBeforeThisPart + loaded, file.size);
        },
      });
      if (!etag) {
        throw new StorageError(`Part ${partNumber} upload did not return an ETag`);
      }

      uploadedBytes = end;
      completedParts.push({ partNumber, etag });
      options.onProgress?.(uploadedBytes, file.size);
    }

    const complete = await requestMultipartComplete(key, uploadId);
    const completeRes = await xhrRequest('POST', complete.url, buildCompleteXml(completedParts), {
      signal: options.signal,
      headers: { 'Content-Type': 'application/xml' },
    });

    return {
      key,
      url: initiate.url.split('?')[0], // object URL is the same path as the initiate/part/complete URLs, minus the query string
      etag: parseXmlTag(completeRes.responseText, 'ETag'),
      size: file.size,
    };
  } catch (error) {
    // Best-effort cleanup — a failed or canceled multipart upload otherwise
    // leaves orphaned parts billed on the bucket until a lifecycle rule
    // sweeps them. Cleanup failure doesn't mask the original error.
    try {
      const abortUrl = await requestMultipartAbort(key, uploadId);
      await xhrRequest('DELETE', abortUrl.url, null, {});
    } catch {
      // swallowed on purpose — see comment above
    }
    throw error;
  }
}

function buildCompleteXml(parts: CompletedPart[]): string {
  const body = parts
    .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${escapeXmlText(p.etag)}</ETag></Part>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload>${body}</CompleteMultipartUpload>`;
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** S3's multipart XML responses (`InitiateMultipartUploadResult`,
 * `CompleteMultipartUploadResult`) are simple flat tag lists — a full XML
 * parser is overkill, but `DOMParser` (always available in the browser
 * main thread this file runs in) is more robust than a regex against
 * whitespace/encoding quirks. */
function parseXmlTag(xml: string, tagName: string): string | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return doc.getElementsByTagName(tagName)[0]?.textContent ?? null;
}

/** Performs the PUT via XHR so we can report upload progress
 * (the fetch API has no upload progress event as of this writing).
 * No custom headers are set beyond what the browser sends automatically —
 * the presigned URL's query string already carries the full signature.
 * `body` is a `Blob` rather than specifically a `File` so this also works
 * for multipart chunks (`file.slice()` returns a `Blob`, not a `File`). */
function xhrPut(
  url: string,
  body: Blob,
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

/** Generic XHR request for the non-PUT multipart steps (initiate/complete
 * are POST, abort is DELETE) — no upload-progress reporting needed since
 * these bodies are tiny (an XML request, or nothing). */
function xhrRequest(
  method: string,
  url: string,
  body: string | null,
  options: { signal?: AbortSignal; headers?: Record<string, string> },
): Promise<{ status: number; responseText: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);

    if (options.headers) {
      for (const [name, value] of Object.entries(options.headers)) {
        xhr.setRequestHeader(name, value);
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ status: xhr.status, responseText: xhr.responseText });
      } else {
        reject(new StorageError(`Request failed with status ${xhr.status}: ${xhr.responseText || xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new StorageError('Network error during request'));
    xhr.onabort = () => reject(new StorageError('Upload canceled'));

    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        return;
      }
      options.signal.addEventListener('abort', () => xhr.abort());
    }

    xhr.send(body ?? undefined);
  });
}
