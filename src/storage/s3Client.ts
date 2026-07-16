import { signRequest } from './sigv4';
import { StorageError, type StorageConfig, type UploadResult } from './types';

/**
 * Logic layer — framework-agnostic (no React). Knows how to turn a
 * (config, key, file) into a signed PUT request and perform it, with
 * upload progress reported via XHR (fetch has no upload-progress event).
 *
 * The UI/hook layer never touches signing, hosts, or URLs directly —
 * it only calls `uploadObject()` below.
 */

/** Builds the {host, path} pair for a given provider kind. This is the
 * only part of the module that differs between S2/custom, R2, and AWS. */
function resolveHostAndPath(config: StorageConfig, key: string): { host: string; path: string; origin: string } {
  const encodedKey = key
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  if (config.kind === 'aws') {
    const host = `${config.bucket}.s3.${config.region}.amazonaws.com`;
    return { host, path: `/${encodedKey}`, origin: `https://${host}` };
  }

  if (!config.endpoint) {
    throw new StorageError('Storage endpoint is not configured for this provider kind.');
  }

  const endpointUrl = new URL(config.endpoint);

  if (config.forcePathStyle) {
    // e.g. http://192.168.123.11:9000/app.base/my/key.png
    return {
      host: endpointUrl.host,
      path: `/${config.bucket}/${encodedKey}`,
      origin: endpointUrl.origin,
    };
  }

  // virtual-hosted style, e.g. https://app.base.<account>.r2.cloudflarestorage.com/my/key.png
  const host = `${config.bucket}.${endpointUrl.host}`;
  return { host, path: `/${encodedKey}`, origin: `${endpointUrl.protocol}//${host}` };
}

export interface UploadObjectOptions {
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

export async function uploadObject(
  config: StorageConfig,
  key: string,
  file: File,
  options: UploadObjectOptions = {},
): Promise<UploadResult> {
  const { host, path, origin } = resolveHostAndPath(config, key);

  const arrayBuffer = await file.arrayBuffer();

  const { headers } = await signRequest({
    method: 'PUT',
    host,
    path,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    extraHeaders: {
      'content-type': file.type || 'application/octet-stream',
    },
    body: arrayBuffer,
  });

  const fullUrl = `${origin}${path}`;

  const etag = await xhrPut(fullUrl, headers, arrayBuffer, options);

  return {
    key,
    url: fullUrl,
    etag,
    size: file.size,
  };
}

/** Performs the signed PUT via XHR so we can report upload progress
 * (the fetch API has no upload progress event as of this writing). */
function xhrPut(
  url: string,
  headers: Record<string, string>,
  body: ArrayBuffer,
  options: UploadObjectOptions,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);

    for (const [k, v] of Object.entries(headers)) {
      // 'host' is a forbidden header name to set manually in browsers;
      // the browser sets it automatically from the URL and will reject
      // an explicit override, so skip it here (it's still part of the
      // signature — only the *sending* of the header is browser-managed).
      if (k.toLowerCase() === 'host') continue;
      xhr.setRequestHeader(k, v);
    }

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
