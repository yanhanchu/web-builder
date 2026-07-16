# Storage module: S3-compatible multi-file upload

This is a **third independent vertical**, alongside the DB/worker stack and
the auth module. It has nothing to do with PGlite/Drizzle/Comlink or Google
sign-in — it's a plain browser-side client for S3-compatible object storage.
It lives entirely under `src/storage/` (+ a demo UI component in
`src/components/S3UploadPanel.tsx`), split the same way `src/auth/` is:

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
│ config.ts       │  │ sigv4.ts                │
│ - shapes only    │  │ - builds signed PUT     │
│ - env → config   │  │   requests, does the    │
│                  │  │   actual XHR/fetch       │
└─────────────┘  └──────────────────────┘
```

The UI component never imports `s3Client.ts`, `sigv4.ts`, or `config.ts`
directly — only `useS3Upload()` from `src/storage/index.ts`. Keep this
boundary, same rule as the auth module.

## ⚠️ Read this before deploying anywhere but a trusted LAN

**This module signs S3 requests directly in the browser**, using an access
key + secret key that get bundled into client-side JS via Vite's
`VITE_*` env vars. That means:

- Anyone who opens devtools on the deployed site can read the secret key
  out of the built JS bundle.
- This is fine for: local development, an internal tool on a private
  network, a demo against your own S2 instance that only your team can
  reach.
- This is **not fine** for anything public-facing. For a real deployment,
  the standard fix is a tiny backend endpoint that generates a
  **presigned URL** (or presigned POST) per upload using the secret key
  server-side, and hands only that time-limited URL to the browser. This
  app has no backend by design (see the main README), so that step is
  intentionally out of scope here — flag it clearly if a user asks to
  "make this production-ready."

The default `.env.local` in this template points at a specific self-hosted
S2 instance for demo purposes. Treat that key as already-shared/rotatable,
not as a production secret.

## Why client-side SigV4 works here

AWS Signature Version 4 is the same algorithm across AWS S3, S2, and
Cloudflare R2 — `src/storage/sigv4.ts` implements it once, using only
WebCrypto (`crypto.subtle`), no `aws-sdk` dependency. `src/storage/s3Client.ts`
builds the correct host/path for whichever provider you're pointed at, signs
the request, and performs a `PUT` via `XMLHttpRequest` (used instead of
`fetch` only because XHR exposes upload-progress events; the signing logic
does not depend on which transport does the actual send).

## Required env vars

See `.env.example`. All are read once in `src/storage/config.ts` via
`loadStorageConfig()`:

| Var | Meaning |
|---|---|
| `VITE_S3_KIND` | `custom` (self-hosted/S2, path-style URLs), `r2` (Cloudflare R2, virtual-hosted URLs), or `aws` (AWS S3). Controls URL shape only — signing is identical. |
| `VITE_S3_ENDPOINT` | Base URL of the endpoint, e.g. `http://192.168.123.11:9000`. Unused for `kind: aws`. |
| `VITE_S3_REGION` | SigV4 region string. S2 accepts `us-east-1` as a safe default even though it's not "in" any AWS region. |
| `VITE_S3_BUCKET` | Bucket name. |
| `VITE_S3_ACCESS_KEY_ID` / `VITE_S3_SECRET_ACCESS_KEY` | Credentials. See the warning above. |
| `VITE_S3_FORCE_PATH_STYLE` | Optional override; defaults to path-style for `custom`/`aws`, virtual-hosted for `r2`. |

## Switching providers later (e.g. to Cloudflare R2)

This is meant to be a **config change, not a code change**:

```bash
VITE_S3_KIND=r2
VITE_S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
VITE_S3_REGION=auto
VITE_S3_BUCKET=your-r2-bucket
VITE_S3_ACCESS_KEY_ID=...
VITE_S3_SECRET_ACCESS_KEY=...
```

`resolveHostAndPath()` in `s3Client.ts` is the one place that branches on
`config.kind` to build the right URL shape; everything else (signing,
progress, the hook, the UI) is identical across providers.

## CORS on the S2/self-hosted side

Because signing happens in the browser, the browser also makes the actual
`PUT` request directly to the endpoint — which means **the bucket/endpoint
needs CORS configured to allow this app's origin**, methods `PUT`, and at
least the headers this module sends (`content-type`, `x-amz-content-sha256`,
`x-amz-date`, `authorization`). Without CORS, uploads will fail in the
browser console with an opaque network/CORS error even though the signature
itself is correct. This template does not attempt to configure the S2
server's CORS policy — that's an out-of-band `mc` / S2 console step.

## Flow

1. User drags files onto `S3UploadPanel` or picks them via the file input →
   `addFiles()` (from `useS3Upload()`) pushes `UploadItem`s (`status: 'queued'`)
   into the hook's state. A default object key is generated per file
   (`uploads/<yyyy-mm-dd>/<random>-<sanitized-filename>`) — see
   `defaultKeyFor()` in `useS3Upload.ts` if you want a different key layout.
2. User clicks "Upload all" → `uploadAll()` walks queued/errored items
   sequentially (see the comment there for switching to concurrent uploads),
   calling `uploadObject()` from `s3Client.ts` for each.
3. `uploadObject()` resolves the host/path for the configured provider,
   signs the request via `signRequest()` (`sigv4.ts`), and performs the PUT
   via XHR, reporting progress back through `onProgress`.
4. The hook updates each `UploadItem`'s `status`/`progress`/`error` as it
   goes; the UI just renders whatever state it's handed — it holds no
   upload logic of its own.
5. Canceling an in-flight upload (`removeItem()` while `status: 'uploading'`)
   aborts its `AbortController`, which aborts the underlying XHR.

## Extending this module

- **New key layout / folder structure** → edit `defaultKeyFor()` in
  `useS3Upload.ts`, or let the UI pass an explicit key instead of relying on
  the default (the hook's `addFiles` would need a small signature change to
  accept per-file keys — kept simple here on purpose).
- **Concurrent uploads instead of sequential** → `uploadAll()` in
  `useS3Upload.ts`, swap the `for` loop for `Promise.all(queued.map(uploadOne))`.
- **Real presigned-URL flow (once a backend exists)** → replace the body of
  `uploadObject()` in `s3Client.ts` with a call to your backend for a
  presigned URL, then `fetch`/XHR that URL directly. `sigv4.ts` becomes
  unnecessary at that point since the backend does the signing.
- **New UI** → new components under `src/components/`, calling
  `useS3Upload()` only. Never import `s3Client.ts`, `sigv4.ts`, or
  `config.ts` directly from a component (same rule as auth's `useAuth()`).

---

## 📋 交接筆記：遷移到 presigned URL 流程（尚未實作）

> 這一節是規劃筆記，**還沒有動任何 code**。等真的後端就緒後，下一輪再依這份筆記實作。
> 目標：secret key 只存在後端，瀏覽器全程拿不到它；瀏覽器只憑一個有時效、
> 綁定單一 object key 的 URL 直接 PUT 到 S3/S2/R2。

### 為什麼要換

目前 `sigv4.ts` 在瀏覽器端用完整的 access key + secret key 簽名——secret 會被
打包進前端 JS，任何人開 devtools 都看得到（`docs/storage-module.md` 上面的
警告段落已經講過）。等有真後端之後，簽名這一步要整個搬到後端做。

### 目標架構（新增一層，其餘不變）

```
UI (S3UploadPanel.tsx)
   │  useS3Upload()  ← 介面幾乎不變，UI 完全不用改
   ▼
Bridge (useS3Upload.ts)
   │  改叫 requestPresignedUrl() 而不是直接 uploadObject()
   ▼
Logic (s3Client.ts)
   │  向後端要一個 presigned URL，再對那個 URL 做 PUT（不再自己簽名）
   ▼
新增：presign.ts（或直接是後端 API 呼叫）
   │  HTTP 請求 → 後端 /api/presign endpoint
   ▼
後端 / Worker（新專案，不在這個前端 repo 裡）
   │  用 secret key 產生 presigned PUT URL，回傳給前端
   │  這裡才是真正碰到 secret key 的地方
```

**UI 層（`S3UploadPanel.tsx`）跟 hook 的對外介面（`UseS3UploadResult`）
理論上完全不用改** —— 這正是當初把 UI/邏輯/資料分離的用意：換簽名方式只是
換掉 logic 層內部的實作，call site 不變。

### 要動的檔案

| 檔案 | 動作 |
|---|---|
| `src/storage/sigv4.ts` | **整個刪除**（或保留但不再被呼叫）——簽名邏輯搬到後端，前端不再需要 SigV4 實作。 |
| `src/storage/config.ts` | 移除 `accessKeyId` / `secretAccessKey`，改成只存後端 API 的 base URL（例如 `VITE_PRESIGN_API_URL`）。**這是關鍵**：`.env` 裡不能再放 secret key。 |
| `src/storage/types.ts` | `StorageConfig` 拿掉兩個 credential 欄位；可能新增 `PresignRequest` / `PresignResponse` 型別。 |
| `src/storage/s3Client.ts` | `uploadObject()` 內部改為：① 呼叫後端 API 要 presigned URL → ② 對那個 URL 做 `xhrPut()`（`xhrPut()` 這個 function 可以整段留著重用，只是不再自己組 `Authorization` header，因為 URL 本身已經帶簽名的 query string）。 |
| 新增 `src/storage/presign.ts` | 純邏輯：`async function requestPresignedUrl(config, key, contentType)`，呼叫後端 `/api/presign`，回傳 `{ url, expiresAt }`。 |
| `src/storage/useS3Upload.ts` | 幾乎不用改，只是它呼叫的 `uploadObject()` 內部邏輯換了。 |
| `.env.example` / `.env.local` | 拿掉 `VITE_S3_ACCESS_KEY_ID` / `VITE_S3_SECRET_ACCESS_KEY`，改成 `VITE_PRESIGN_API_URL=https://your-backend/api/presign`。 |
| `docs/storage-module.md` | 更新這份文件本身，把「⚠️ 瀏覽器簽名」警告段落整段換成新流程說明。 |

### 後端（或 Web Worker，看你怎麼取捨）需要做的事

不在這個前端 repo 範圍內，但下次規劃後端時要包含：

1. 一個 endpoint，例如 `POST /api/presign`，輸入 `{ bucket, key, contentType }`
   （bucket 可以後端固定寫死，不用讓前端指定，安全性更好）
2. 後端用 AWS SDK（或任何 S3-compatible SDK）產生一個有時效的 presigned PUT URL
   （例如效期 5-15 分鐘），只對這一個 key 有效
3. 回傳 `{ url, expiresAt }` 給前端
4. 前端直接對這個 `url` 做 `PUT`，不需要額外 header（presigned URL 已經把簽名放進 query string 裡）
5. **後端這端要驗證/限制 key 的命名規則**（例如強制 prefix `uploads/`），避免有人亂
   要求覆寫任意路徑的檔案
6. CORS 一樣要開，但這次是 S3/S2 對「presigned URL 的來源」開放 PUT，
   跟現在的設定基本一樣

### 需要決定的事（下次開始前先問使用者）

- 後端要用什麼實作？（Node/Express、Cloudflare Worker、其他）—— 會影響
  presign SDK 選擇（`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
  在 Node 很直接；Cloudflare Worker 上可能要手刻 SigV4 或找 worker-relative 套件）
- presigned URL 的效期？(建議 5-15 分鐘，太長增加洩漏窗口，太短使用者網路慢會失敗)
- 要不要在後端順便做檔案類型/大小的驗證/白名單？（目前前端完全沒做這層限制）
- multipart upload（大檔案分段上傳）要不要一起做？如果檔案可能超過 100MB，
  單一 PUT 的 presigned URL 就不夠用了，需要 presigned multipart upload 流程
  （更複雜，通常會是下下一輪的範圍）

