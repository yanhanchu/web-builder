/**
 * Backend-side presigned URL generation, simulated inside the Web Worker.
 *
 * In this app the "backend" is `src/worker/worker.ts` (see the main
 * README — there's no real server, the worker plays that role). This file
 * is the worker-only counterpart of the deprecated `src/storage/sigv4.ts`:
 * it implements SigV4 **query-string** signing (presigned URL), not
 * header-based signing. The important property is that the S3 secret key
 * only ever lives here, inside the worker module, and is never sent to or
 * read by the main thread / UI bundle.
 *
 * This mirrors exactly what a real backend would do in
 * `POST /api/presign` — see docs/storage-module.md for the full writeup.
 */

import { validateUpload, type UploadLimits } from './validation';

const encoder = new TextEncoder();

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return toHex(digest);
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function amzDate(date: Date) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()))
    .join('/');
}

/** RFC 3986 encoding for query string components, per SigV4 canonical query rules. */
function encodeQueryComponent(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

export interface WorkerStorageConfig extends UploadLimits {
  kind: 'custom' | 'r2' | 'aws';
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  /** Overrides DEFAULT_EXPIRES_SECONDS below when set — see
   * VITE_S3_PRESIGN_EXPIRES_SECONDS in .env.example / docs/storage-module.md. */
  presignExpiresSeconds?: number;
}

/** Same URL-shape logic as the old `resolveHostAndPath()` in s3Client.ts —
 * duplicated here (not imported) because this file must never be reachable
 * from the main thread bundle. Keep both in sync if the URL shape changes. */
function resolveHostAndPath(config: WorkerStorageConfig, key: string): { host: string; path: string; origin: string } {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');

  if (config.kind === 'aws') {
    const host = `${config.bucket}.s3.${config.region}.amazonaws.com`;
    return { host, path: `/${encodedKey}`, origin: `https://${host}` };
  }

  if (!config.endpoint) {
    throw new Error('Storage endpoint is not configured for this provider kind.');
  }

  const endpointUrl = new URL(config.endpoint);

  if (config.forcePathStyle) {
    return {
      host: endpointUrl.host,
      path: `/${config.bucket}/${encodedKey}`,
      origin: endpointUrl.origin,
    };
  }

  const host = `${config.bucket}.${endpointUrl.host}`;
  return { host, path: `/${encodedKey}`, origin: `${endpointUrl.protocol}//${host}` };
}

export interface PresignedPutUrl {
  url: string;
  expiresAt: number;
  key: string;
}

const SERVICE = 's3';
const DEFAULT_EXPIRES_SECONDS = 15 * 60; // 15 minutes — see docs/storage-module.md

/**
 * Core SigV4 query-string signer, generalized over HTTP method and extra
 * query params (S3 uses query params as the "action" for multipart calls:
 * `?uploads`, `?partNumber=N&uploadId=X`, `?uploadId=X`). Every query
 * param — auth-related or not — must be part of the signed canonical
 * query string, so callers pass their action params in via `extraQuery`
 * rather than appending them to the returned URL afterwards.
 *
 * Shared by `createPresignedPutUrl()` (single-shot upload) and the
 * multipart functions below it. All of them stay UNSIGNED-PAYLOAD /
 * SignedHeaders=host, same as before — nothing about the security
 * properties described in docs/storage-module.md changes.
 */
async function signPresignedUrl(
  config: WorkerStorageConfig,
  method: string,
  key: string,
  extraQuery: Record<string, string>,
  expiresSeconds: number,
): Promise<{ url: string; expiresAt: number }> {
  const { host, path, origin } = resolveHostAndPath(config, key);
  const now = new Date();
  const { amzDate: xAmzDate, dateStamp } = amzDate(now);
  const credentialScope = `${dateStamp}/${config.region}/${SERVICE}/aws4_request`;
  const credential = `${config.accessKeyId}/${credentialScope}`;

  const queryParams: Record<string, string> = {
    ...extraQuery,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': xAmzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeQueryComponent(k)}=${encodeQueryComponent(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';

  // UNSIGNED-PAYLOAD throughout: for the single PUT and per-part PUTs we
  // don't have the bytes yet at presign time; for POST (init/complete) and
  // DELETE (abort) there's no meaningful body to hash either — S3 accepts
  // UNSIGNED-PAYLOAD for all of these presigned-URL cases.
  const canonicalRequest = [
    method,
    encodePath(path),
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    xAmzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = await hmac(encoder.encode(`AWS4${config.secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, config.region);
  const kService = await hmac(kRegion, SERVICE);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = toHex(await hmac(kSigning, stringToSign));

  const finalQuery = `${canonicalQueryString}&X-Amz-Signature=${signature}`;
  const url = `${origin}${encodePath(path)}?${finalQuery}`;

  return { url, expiresAt: now.getTime() + expiresSeconds * 1000 };
}

/**
 * Produces a presigned PUT URL for a single object key, valid for
 * `expiresSeconds` (default 15 minutes). Query-string SigV4, so the
 * browser needs no extra headers (no Authorization header, no secret) —
 * it just PUTs the file straight to the returned URL.
 */
export async function createPresignedPutUrl(
  config: WorkerStorageConfig,
  key: string,
  contentType: string,
  size: number,
  expiresSeconds: number = config.presignExpiresSeconds ?? DEFAULT_EXPIRES_SECONDS,
): Promise<PresignedPutUrl> {
  // Authoritative validation — see docs/storage-module.md, "File type /
  // size validation, allowlist". This is the one check that can't be
  // bypassed from devtools, since the secret key (and thus the ability to
  // actually sign a URL) never leaves this module. The main thread does
  // the same check in useS3Upload.addFiles() only for instant UX feedback.
  const validationError = validateUpload({ size, contentType }, config);
  if (validationError) {
    throw new Error(validationError);
  }

  // contentType participates in validation above but is not part of the
  // SigV4 signature for a presigned PUT URL (SignedHeaders=host only).
  const { url, expiresAt } = await signPresignedUrl(config, 'PUT', key, {}, expiresSeconds);
  return { url, expiresAt, key };
}

/* ------------------------------------------------------------------ *
 * Multipart upload — see docs/storage-module.md, "Multipart upload for
 * large files". Kept intentionally simple: sequential parts, no resume
 * across page reloads, no concurrency tuning. Each step just asks this
 * module for one presigned URL for one S3 multipart action; the browser
 * (src/storage/s3Client.ts) does the actual HTTP calls and XML
 * parsing, same division of labor as the single-PUT flow.
 * ------------------------------------------------------------------ */

export interface PresignedMultipartUrl {
  url: string;
  expiresAt: number;
}

/** `?uploads` — presigned POST that starts a multipart upload. The
 * response body (parsed by the browser) contains the `UploadId` every
 * later step needs. Only content-type is validated here — size isn't
 * known/limited yet (that's the point of multipart: bypassing the
 * single-PUT size ceiling), so `VITE_S3_MAX_FILE_SIZE_MB` deliberately
 * doesn't apply to this path. */
export async function createMultipartInitiateUrl(
  config: WorkerStorageConfig,
  key: string,
  contentType: string,
  expiresSeconds: number = config.presignExpiresSeconds ?? DEFAULT_EXPIRES_SECONDS,
): Promise<PresignedMultipartUrl> {
  const validationError = validateUpload(
    { size: 0, contentType },
    { allowedMimeTypes: config.allowedMimeTypes },
  );
  if (validationError) {
    throw new Error(validationError);
  }
  return signPresignedUrl(config, 'POST', key, { uploads: '' }, expiresSeconds);
}

/** `?partNumber=N&uploadId=X` — presigned PUT for one part's bytes.
 * `partNumber` is 1-based, per the S3 API. */
export async function createMultipartPartUrl(
  config: WorkerStorageConfig,
  key: string,
  uploadId: string,
  partNumber: number,
  expiresSeconds: number = config.presignExpiresSeconds ?? DEFAULT_EXPIRES_SECONDS,
): Promise<PresignedMultipartUrl> {
  return signPresignedUrl(
    config,
    'PUT',
    key,
    { partNumber: String(partNumber), uploadId },
    expiresSeconds,
  );
}

/** `?uploadId=X` (POST) — presigned request to finalize the upload. The
 * browser POSTs an XML body listing every part's number + ETag. */
export async function createMultipartCompleteUrl(
  config: WorkerStorageConfig,
  key: string,
  uploadId: string,
  expiresSeconds: number = config.presignExpiresSeconds ?? DEFAULT_EXPIRES_SECONDS,
): Promise<PresignedMultipartUrl> {
  return signPresignedUrl(config, 'POST', key, { uploadId }, expiresSeconds);
}

/** `?uploadId=X` (DELETE) — presigned request to cancel/clean up an
 * in-progress multipart upload (a failed or user-canceled upload
 * otherwise leaves orphaned parts billed on the bucket until a lifecycle
 * rule sweeps them). Best-effort: `s3Client.ts` calls this on error/abort
 * but doesn't fail the whole operation if the cleanup call itself fails. */
export async function createMultipartAbortUrl(
  config: WorkerStorageConfig,
  key: string,
  uploadId: string,
  expiresSeconds: number = config.presignExpiresSeconds ?? DEFAULT_EXPIRES_SECONDS,
): Promise<PresignedMultipartUrl> {
  return signPresignedUrl(config, 'DELETE', key, { uploadId }, expiresSeconds);
}
