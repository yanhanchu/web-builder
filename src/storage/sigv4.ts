/**
 * Minimal AWS Signature Version 4 signer, implemented with WebCrypto only
 * (no aws-sdk dependency). This is the same algorithm AWS S3, S2, and
 * Cloudflare R2 all implement identically — that's what makes this one
 * signer work against all three.
 *
 * This is intentionally low-level and has no knowledge of React, the UI,
 * or upload progress. See `s3Client.ts` for the higher-level API that uses it.
 */

const encoder = new TextEncoder();

async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const buf = typeof data === 'string' ? encoder.encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', buf);
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

/** Encodes a single path segment per SigV4 rules, preserving '/' between segments. */
function encodePath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()))
    .join('/');
}

export interface SignRequestInput {
  method: string;
  /** Full host (no protocol), e.g. "192.168.123.11:9000" or "my-bucket.r2.cloudflarestorage.com" */
  host: string;
  /** URL path starting with "/", already including the bucket if path-style */
  path: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Extra headers to sign, beyond host/x-amz-date/x-amz-content-sha256 (e.g. content-type). Keys lowercase. */
  extraHeaders?: Record<string, string>;
  /** Body payload for the content hash. Use 'UNSIGNED-PAYLOAD' to skip hashing large bodies. */
  body: ArrayBuffer | 'UNSIGNED-PAYLOAD';
}

export interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

const SERVICE = 's3';

export async function signRequest(input: SignRequestInput): Promise<SignedRequest> {
  const now = new Date();
  const { amzDate: xAmzDate, dateStamp } = amzDate(now);

  const payloadHash = input.body === 'UNSIGNED-PAYLOAD' ? 'UNSIGNED-PAYLOAD' : await sha256Hex(input.body);

  const headers: Record<string, string> = {
    host: input.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': xAmzDate,
    ...input.extraHeaders,
  };

  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${headers[k]}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = [
    input.method.toUpperCase(),
    encodePath(input.path),
    '', // no query string for simple PUT object
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${input.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    xAmzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = await hmac(encoder.encode(`AWS4${input.secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, input.region);
  const kService = await hmac(kRegion, SERVICE);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = toHex(await hmac(kSigning, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `${encodePath(input.path)}`,
    headers: {
      ...headers,
      Authorization: authorization,
    },
  };
}
