# @workspace/server

**唯一一個 Node（非瀏覽器）端的套件。** 純 Node `crypto` 實作的最小 S3
SigV4 Presigned URL 產生器，不依賴 `aws-sdk` / `@aws-sdk/client-s3`。設計
給「app 自己的 Vite dev server plugin」呼叫，讓密鑰只存在於 Node
process，永遠不進到瀏覽器 bundle。

> 這個套件**不是**一個可以獨立啟動的伺服器（沒有自己的 `listen()`）。
> 它是一組被 import 進 Vite plugin 的 function，由呼叫端（app 的
> `scripts/*.mjs`）決定什麼時候、掛在哪個路徑上執行。

## 這個套件提供什麼

| Export | 路徑 | 提供什麼 |
|---|---|---|
| `@workspace/server/presign` | `src/presign.mjs` | 最底層的 SigV4 簽章：`createPresignedUrl`、`buildObjectKey`、`buildPublicUrl` |
| `@workspace/server/s3-presign-service` | `src/s3-presign-service.mjs` | 上一層的業務邏輯：驗證呼叫端傳入的 storage 設定（`AppSettings.storage`），呼叫 presign.mjs 產生上傳 / 刪除用的 presigned URL |

`s3-presign-service.mjs` **刻意不知道**任何特定 app 的資料要怎麼讀（例如
`data/{app}/app.json` 這種路徑），呼叫端要自己把 storage 設定物件準備好
再傳進來 —— 這樣這個套件才能被不同 app 重複使用，不綁定單一 app 的檔案
配置方式。

## 怎麼引用

只能被 **Node 環境**（Vite plugin、`.mjs` script）import，**絕對不要**在
任何會被打進瀏覽器 bundle 的檔案（`src/**/*.tsx`、一般 `src/**/*.ts`）裡
import 這個套件 —— 密鑰只能活在這裡。

```js
// apps/xxx/scripts/write-s3-presign-plugin.mjs
import { createS3UploadPresign, createS3DeletePresign } from '@workspace/server/s3-presign-service';

export function writeS3PresignPlugin() {
  return {
    name: 'write-s3-presign',
    configureServer(server) {
      // 只在 `vite dev` 掛載；`vite build` 產物不含這段
      server.middlewares.use('/__api/s3-presign', async (req, res) => {
        // 1. app 端自行讀出 data/{app}/app.json 的 storage 設定
        // 2. 呼叫 createS3UploadPresign(storageConfig, { filename, contentType })
        // 3. 回傳 { ok, uploadUrl, publicUrl, key, expiresIn } 給前端
      });
    },
  };
}
```

參考完整實作：[apps/web-builder/scripts/write-s3-presign-plugin.mjs](../../apps/web-builder/scripts/write-s3-presign-plugin.mjs)

前端對應要呼叫這個端點的邏輯在
`@workspace/browser/s3-upload-client`（見
[packages/browser/README.md](../browser/README.md#⚠️-兩套-s3-上傳邏輯不要混用)）。

## 安全性重點

- `secretAccessKey` 只在 Node process 讀取（來自 app 自己的設定檔），
  **絕不**出現在回傳給前端的任何欄位。
- Presigned URL 有時效性（預設 15 分鐘，可由呼叫端的 storage 設定覆寫）。
- 這個套件只應該被掛載在 `vite dev`（`configureServer`），正式 `build`
  產物不應該含有呼叫這個套件的路徑，否則等於把「後端」邏輯打進靜態產物。

## 新增 app 想用這個套件時

1. 在 app 的 `package.json` 加上 `"@workspace/server": "workspace:*"`
2. 準備一份「這個 app 自己的 storage 設定要怎麼讀」的邏輯（例如讀某個
   JSON 檔），**不要**改這個套件本身去配合
3. 寫一個自己 app 底下的 `scripts/write-xxx-plugin.mjs`，import
   `@workspace/server/*`，只在 `configureServer` 掛 middleware
4. 在 `vite.config.ts` 的 `plugins` 陣列加上這個 plugin
