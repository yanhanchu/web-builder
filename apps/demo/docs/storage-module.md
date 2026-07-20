# Storage module: S3-compatible multi-file upload (presigned URL flow)

This is a **third independent vertical**, alongside the DB/worker stack and
the auth module. It lives entirely under `src/storage/` (+ a demo UI
component in `src/components/S3UploadPanel.tsx`), split the same way
`src/auth/` is — with one addition: signing now happens in the **Web
Worker** (`src/worker/presign.ts`), which plays the role of a backend
`/api/presign` endpoint, since this app has no real server (see the main
README — the worker *is* the "backend" here).

```
┌───────────────────────────┐
│  UI layer                  │   src/components/S3UploadPanel.tsx
│  (React components)        │   — calls useS3Upload() only, nothing else
└──────────────┬──────────────┘
               │ useS3Upload()
               ▼
┌───────────────────────────┐
│  Bridge / React hook       │   src/storage/useS3Upload.ts
│                             │   — owns the upload queue's React state
└──────┬───────────────┬─────┘
       │                │
       ▼                ▼
┌─────────────┐  ┌──────────────────────┐
│ Data layer    │  │ Logic layer           │
│ src/storage/    │  │ src/storage/           │
│ types.ts        │  │ s3Client.ts            │
│ config.ts       │  │ presign.ts             │
│ - shapes only    │  │ - asks the "backend"   │
│ - kind + bucket  │  │   (worker) for a       │
│   only, no        │  │   presigned URL, then  │
│   credentials      │  │   PUTs straight to it  │
└─────────────┘  └──────────┬───────────┘
                              │ Comlink RPC (api.storagePresignPutUrl)
                              ▼
                 ┌──────────────────────────────┐
                 │ "Backend" (Web Worker)          │
                 │ src/worker/worker.ts             │
                 │  └─▶ src/worker/presign.ts        │
                 │      - SigV4 query-string signing  │
                 │      - THE ONLY PLACE the secret    │
                 │        key is read/used              │
                 └──────────────────────────────┘
```

The UI component never imports `s3Client.ts`, `presign.ts`, or `config.ts`
directly — only `useS3Upload()` from `src/storage/index.ts`. Keep this
boundary, same rule as the auth module.

## How this avoids exposing the secret key

Signing now happens in `src/worker/presign.ts`, which is only ever
imported by `src/worker/worker.ts`. Nothing under `src/storage/` or
`src/components/` imports it. The browser (main thread + everything the
user's devtools can inspect as "the app's logic") only ever sees:

1. a request for a presigned URL for one specific object key, and
2. the resulting `{ url, expiresAt }` — a URL that already has a valid
   SigV4 query-string signature baked in, scoped to that one key, valid
   for **15 minutes** (`DEFAULT_EXPIRES_SECONDS` in `presign.ts`).

**Caveat specific to this template:** because this whole app is still one
Vite client-side bundle (per the README — there's no separate server
process), the `VITE_S3_ACCESS_KEY_ID` / `VITE_S3_SECRET_ACCESS_KEY` env
vars technically still end up inside the *worker's* bundle chunk, which is
still JS served to the browser. A sufficiently determined person could
find it by digging through the worker's compiled output. This is a real
improvement over the old flow (the access key is no longer trivially
visible in the main app bundle or ever transmitted to the main thread),
and it's the correct *shape* for a real backend migration, but it is not
equivalent to a real backend keeping the secret server-side and
unreachable from any browser-shipped code. **Treat this as an in-repo
simulation of the target architecture, not the final secure state.** When
a real backend replaces the worker (see "Migrating to a real backend"
below), move the credentials to that backend's server-only env and this
caveat goes away entirely.

## Why client-side SigV4 still works here (in the worker)

AWS Signature Version 4 is the same algorithm across AWS S3, S2, and
Cloudflare R2 — `src/worker/presign.ts` implements the **query-string**
variant of it (for presigned URLs) once, using only WebCrypto
(`crypto.subtle`), no `aws-sdk` dependency. It resolves the correct
host/path for whichever provider you're pointed at (duplicated from the
old `resolveHostAndPath()` — see the comment in `presign.ts` for why it's
not imported from `s3Client.ts`), then produces a full URL with the
signature embedded in the query string. `src/storage/s3Client.ts` then
performs a plain `PUT` via `XMLHttpRequest` to that URL (XHR instead of
`fetch` only because XHR exposes upload-progress events).

## Required env vars

See `.env.example`. Two different files read different subsets now:

| Var | Read by | Meaning |
|---|---|---|
| `VITE_S3_KIND` | `src/storage/config.ts` (main thread, display only) **and** `src/worker/presign.ts` | `custom` (self-hosted/S2, path-style URLs), `r2` (Cloudflare R2, virtual-hosted URLs), or `aws` (AWS S3). Controls URL shape only — signing is identical. |
| `VITE_S3_BUCKET` | both | Bucket name. |
| `VITE_S3_ENDPOINT` | `src/worker/presign.ts` only | Base URL of the endpoint, e.g. `http://192.168.123.11:9000`. Unused for `kind: aws`. |
| `VITE_S3_REGION` | `src/worker/presign.ts` only | SigV4 region string. S2 accepts `us-east-1` as a safe default even though it's not "in" any AWS region. |
| `VITE_S3_ACCESS_KEY_ID` / `VITE_S3_SECRET_ACCESS_KEY` | `src/worker/presign.ts` **only** | Credentials. See the caveat above — never imported by main-thread code. |
| `VITE_S3_FORCE_PATH_STYLE` | `src/worker/presign.ts` only | Optional override; defaults to path-style for `custom`/`aws`, virtual-hosted for `r2`. |
| `VITE_S3_MAX_FILE_SIZE_MB` | `src/storage/config.ts` (UX only) **and** `src/worker/worker.ts` (authoritative) | Optional max upload size in MB. Unset/0 = no limit. |
| `VITE_S3_ALLOWED_MIME_TYPES` | `src/storage/config.ts` (UX only) **and** `src/worker/worker.ts` (authoritative) | Optional comma-separated content-type allowlist, e.g. `image/*,application/pdf`. Unset/empty = no restriction. |
| `VITE_S3_PRESIGN_EXPIRES_SECONDS` | `src/worker/presign.ts` only | Optional override for presigned URL lifetime. Unset = 900 (15 minutes). |
| `VITE_S3_MULTIPART_THRESHOLD_MB` | `src/storage/config.ts` only | Files at/above this size use the multipart flow instead of a single PUT. Unset = 100. |
| `VITE_S3_MULTIPART_PART_SIZE_MB` | `src/storage/config.ts` only | Size of each part in the multipart flow. Unset = 8; always clamped up to S3's 5MB-per-part minimum. |

## Switching providers later (e.g. to Cloudflare R2)

Still a **config change, not a code change**:

```bash
VITE_S3_KIND=r2
VITE_S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
VITE_S3_REGION=auto
VITE_S3_BUCKET=your-r2-bucket
VITE_S3_ACCESS_KEY_ID=...
VITE_S3_SECRET_ACCESS_KEY=...
```

`resolveHostAndPath()` in `src/worker/presign.ts` is the one place that
branches on `config.kind` to build the right URL shape; everything else
(signing, progress, the hook, the UI) is identical across providers.

## CORS on the S2/self-hosted side

The browser makes the actual `PUT` request directly to the endpoint using
the presigned URL — which means **the bucket/endpoint needs CORS
configured to allow this app's origin** and method `PUT`. Presigned URLs
carry their signature in the query string, so unlike the old header-based
flow you do **not** need to allow `authorization` / `x-amz-content-sha256`
/ `x-amz-date` as request headers — a plain `PUT` with no custom headers is
enough. Without CORS, uploads will fail in the browser console with an
opaque network/CORS error even though the signature itself is correct.
This template does not attempt to configure the S2 server's CORS policy —
that's an out-of-band `mc` / S2 console step.

**If you use multipart uploads** (see below), the browser also makes
direct `POST` (initiate, complete) and `DELETE` (abort) requests to the
endpoint, so the CORS config needs to allow those methods too, not just
`PUT`. A `Content-Type` header is sent on the initiate/complete calls, so
allow that request header as well if your CORS policy is method-scoped
rather than wide open.

**Also for multipart specifically:** your CORS config must set
`Access-Control-Expose-Headers: ETag` (or wider) on the bucket/endpoint.
Browsers hide response headers on cross-origin requests unless the server
explicitly exposes them, so without this, `xhr.getResponseHeader('ETag')`
comes back `null` after a perfectly successful part PUT — and
`uploadObjectMultipart()` treats a missing part ETag as a hard failure
(it can't build a valid `CompleteMultipartUpload` request without one),
aborting the whole upload. The single-PUT path has the same
`getResponseHeader('ETag')` call but doesn't depend on it succeeding, so
this only bites you once you're on the multipart path.

## Flow

1. User drags files onto `S3UploadPanel` or picks them via the file input →
   `addFiles()` (from `useS3Upload()`) pushes `UploadItem`s (`status: 'queued'`)
   into the hook's state. A default object key is generated per file
   (`uploads/<yyyy-mm-dd>/<random>-<sanitized-filename>`) — see
   `defaultKeyFor()` in `useS3Upload.ts` if you want a different key layout.
2. User clicks "Upload all" → `uploadAll()` walks queued/errored items
   sequentially (see the comment there for switching to concurrent uploads),
   calling `uploadObject()` from `s3Client.ts` for each.
3. `uploadObject()` calls `requestPresignedUrl()` (`presign.ts`), which
   calls `api.storagePresignPutUrl(key, contentType, size)` over the
   existing Comlink RPC channel — the same channel used for all the DB
   calls, just a different flat method on the worker's `api` object (see
   [worker-api.md](./worker-api.md)).
4. The worker (`src/worker/worker.ts` → `src/worker/presign.ts`) validates
   the file (size/type, if `VITE_S3_MAX_FILE_SIZE_MB` /
   `VITE_S3_ALLOWED_MIME_TYPES` are set), then signs a query-string SigV4
   URL valid for 15 minutes by default (configurable, see
   `VITE_S3_PRESIGN_EXPIRES_SECONDS` below) and returns
   `{ url, expiresAt, key }`. This is the only place the secret key is
   touched.
5. `uploadObject()` performs a plain `PUT` via XHR straight to that URL,
   reporting progress back through `onProgress`.
6. The hook updates each `UploadItem`'s `status`/`progress`/`error` as it
   goes; the UI just renders whatever state it's handed — it holds no
   upload logic of its own.
7. Canceling an in-flight upload (`removeItem()` while `status: 'uploading'`)
   aborts its `AbortController`, which aborts the underlying XHR.

## Extending this module

- **New key layout / folder structure** → edit `defaultKeyFor()` in
  `useS3Upload.ts`, or let the UI pass an explicit key instead of relying on
  the default (the hook's `addFiles` would need a small signature change to
  accept per-file keys — kept simple here on purpose).
- **Concurrent uploads instead of sequential** → `uploadAll()` in
  `useS3Upload.ts`, swap the `for` loop for `Promise.all(queued.map(uploadOne))`.
- **Migrating to a real backend** (once one exists, replacing the worker
  simulation) → replace the body of `requestPresignedUrl()` in
  `src/storage/presign.ts` with a `fetch('/api/presign', ...)` call to the
  real backend instead of `api.storagePresignPutUrl()`. Nothing else in
  `src/storage/` needs to change — `s3Client.ts`, `useS3Upload.ts`, and the
  UI are already written against "ask something for a presigned URL, then
  PUT to it." Delete `src/worker/presign.ts` and the
  `storagePresignPutUrl` method in `src/worker/worker.ts`, and move
  `VITE_S3_ACCESS_KEY_ID`/`VITE_S3_SECRET_ACCESS_KEY` to the real backend's
  server-only env.
- **New UI** → new components under `src/components/`, calling
  `useS3Upload()` only. Never import `s3Client.ts`, `presign.ts`, or
  `config.ts` directly from a component (same rule as auth's `useAuth()`).

---

## Deferred

Nothing left from the original scope. If upload needs grow, the natural
next steps are: **concurrent part uploads** (the multipart flow below is
deliberately sequential), **resuming a multipart upload across a page
reload** (currently a retry always starts over from part 1, since the
`UploadId` only lives in memory), and a **`key`-prefix allowlist** in
`storagePresignPutUrl()` / the multipart initiate call, for per-user
upload isolation (currently only `contentType`/size are checked, not the
key itself).

### Implemented this round

- **Multipart upload for large files.** Files at/above
  `VITE_S3_MULTIPART_THRESHOLD_MB` (default 100MB) go through
  `uploadObjectMultipart()` in `src/storage/s3Client.ts` instead of a
  single PUT:
  1. `requestMultipartInitiate()` asks the worker for a presigned `POST
     ?uploads` URL; the browser POSTs it and parses the XML response for
     the `UploadId`.
  2. For each `VITE_S3_MULTIPART_PART_SIZE_MB`-sized chunk (default 8MB,
     via `file.slice()`), `requestMultipartPartUrl()` gets a presigned
     `PUT ?partNumber=N&uploadId=...` URL and the chunk is PUT to it,
     same XHR-with-progress mechanics as the single-file path. Parts are
     uploaded **sequentially, not in parallel** — kept simple on purpose,
     see "Deferred" above if you want to speed this up.
  3. Once every part has an ETag, `requestMultipartComplete()` gets a
     presigned `POST ?uploadId=...` URL and the browser POSTs an XML body
     listing every part's number + ETag.
  4. If any step fails or the upload is canceled, a best-effort
     `requestMultipartAbort()` (`DELETE ?uploadId=...`) cleans up the
     in-progress upload so the bucket doesn't accumulate orphaned parts;
     cleanup failure doesn't mask the original error.
  - `src/worker/presign.ts` generalizes the single `createPresignedPutUrl()`
    signer into a shared `signPresignedUrl(config, method, key, extraQuery,
    expiresSeconds)` core, since every multipart action is still the same
    query-string SigV4 signing, just with a different HTTP method and
    action-specific query params. `createMultipartInitiateUrl()` /
    `createMultipartPartUrl()` / `createMultipartCompleteUrl()` /
    `createMultipartAbortUrl()` are thin wrappers around it.
  - The size validation in `createMultipartInitiateUrl()` deliberately
    only checks `contentType`, not `VITE_S3_MAX_FILE_SIZE_MB` — that limit
    exists to cap single-PUT uploads; multipart is exactly how you go
    above it.
  - **Not implemented**: parallel part uploads, resuming after a page
    reload, and part-level retry (a failed part currently fails and aborts
    the whole upload rather than retrying just that part). See "Deferred"
    above.
- **File type / size validation, allowlist.** `src/storage/validation.ts`
  is a small pure module (`validateUpload()`, `mimeTypeMatches()`, plus the
  env parsers) shared by both sides:
  - `src/storage/useS3Upload.ts` (`addFiles()`) runs it client-side for
    instant feedback — a bad file is marked `status: 'error'` before it
    ever reaches the presign RPC.
  - `src/worker/presign.ts` (`createPresignedPutUrl()`) runs the same
    check authoritatively — this is the one that can't be bypassed from
    devtools, since it's the only place with the secret key. It throws
    before signing anything if the file fails validation, and the message
    propagates back through Comlink to the UI (see `requestPresignedUrl()`
    in `src/storage/presign.ts`).
  - Configured via `VITE_S3_MAX_FILE_SIZE_MB` and
    `VITE_S3_ALLOWED_MIME_TYPES` (see the env var table above). Both unset
    by default, i.e. no restriction — opt in per deployment.
  - This checks `contentType`/size only, not `key` prefix — see "Deferred"
    above.
- **Presigned URL expiry tuning.** No longer hardcoded — `presignExpiresSeconds`
  on `WorkerStorageConfig` overrides `DEFAULT_EXPIRES_SECONDS` in
  `src/worker/presign.ts` when `VITE_S3_PRESIGN_EXPIRES_SECONDS` is set.
  Still defaults to 15 minutes if unset.
