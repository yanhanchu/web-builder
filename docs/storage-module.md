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
   calls `api.storagePresignPutUrl(key, contentType)` over the existing
   Comlink RPC channel — the same channel used for all the DB calls, just
   a different flat method on the worker's `api` object (see
   [worker-api.md](./worker-api.md)).
4. The worker (`src/worker/worker.ts` → `src/worker/presign.ts`) signs a
   query-string SigV4 URL valid for 15 minutes and returns
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

## Deferred / out of scope for this round

These were flagged in the original handoff note and intentionally **not**
implemented in this pass, per explicit instruction to keep this round
focused on the presigned-URL flow itself. Left here as English notes for
whoever picks this up next:

- **Multipart upload for large files.** A single presigned PUT URL only
  covers a normal single-request upload. If files may exceed roughly
  100MB, a presigned *multipart* upload flow is needed instead (separate
  `CreateMultipartUpload` / per-part presigned URLs / `CompleteMultipartUpload`
  calls). Meaningfully more complex than this round's scope — treat as a
  follow-up.
- **File type / size validation, allowlist.** Neither the frontend nor the
  worker "backend" currently enforce any restriction on what can be
  uploaded (no MIME allowlist, no max-size check, no extension check).
  `storagePresignPutUrl()` in `src/worker/worker.ts` is the natural place
  to add this later — validate `key` prefix and `contentType`/size before
  calling `createPresignedPutUrl()`, and reject with an error the UI can
  surface.
- **Presigned URL expiry tuning.** Currently hardcoded to 15 minutes
  (`DEFAULT_EXPIRES_SECONDS` in `src/worker/presign.ts`). Fine as a
  starting point; revisit if real-world upload times (slow networks, large
  files) start exceeding it.
