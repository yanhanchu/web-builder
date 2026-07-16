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

import { validateUpload, type UploadLimits } from '../storage/validation';

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
  const { host, path, origin } = resolveHostAndPath(config, key);
  const now = new Date();
  const { amzDate: xAmzDate, dateStamp } = amzDate(now);
  const credentialScope = `${dateStamp}/${config.region}/${SERVICE}/aws4_request`;
  const credential = `${config.accessKeyId}/${credentialScope}`;

  // Query params that participate in the signature (must be sorted before signing).
  const queryParams: Record<string, string> = {
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

  // Presigned URLs use UNSIGNED-PAYLOAD — the body isn't hashed since we
  // don't have it yet at presign time (the browser hasn't read the file).
  const canonicalRequest = [
    'PUT',
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

  return {
    url,
    expiresAt: now.getTime() + expiresSeconds * 1000,
    key,
  };
}
