import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { writeBackPlugin } from "../../packages/ui/scripts/write-back-plugin.mjs";
import { writeI18nPlugin } from "./scripts/write-i18n-plugin.mjs";
import { writePagesPlugin } from "./scripts/write-pages-plugin.mjs";
import { writeAppsPlugin } from "./scripts/write-apps-plugin.mjs";
import { writeRoutesPlugin } from "./scripts/write-routes-plugin.mjs";
import { writeThemePlugin } from "./scripts/write-theme-plugin.mjs";
import { writeFilesPlugin } from "./scripts/write-files-plugin.mjs";
import { writeS3PresignPlugin } from "./scripts/write-s3-presign-plugin.mjs";

// https://vite.dev/config/
export default defineConfig({
  // writeBackPlugin() 來自 @workspace/ui 套件（packages/ui/scripts/write-back-plugin.mjs）：
  // 組件 / 函式的「就地編輯、寫回原始碼」屬於文件生成套件自己的能力，實作留在
  // packages/ui 底下；但實際跑起來的 Vite dev server 是這個 app（web-builder），
  // 所以 middleware 仍在這裡掛載——套件只跟著它操作的檔案（src/components/**、
  // src/functions/**）走，不代表「哪個 vite.config 掛載它」要跟著搬。
  // writeI18nPlugin() 只在 `vite dev` 掛載，讓 /i18n 頁面可以把翻譯資料寫入 data/{app}/i18n/ 目錄。
  // writePagesPlugin() 同樣只在 dev 掛載，讓 /live/edit 頁面可以把編輯好的 pages 寫回 data/{app}/pages.json。
  // writeAppsPlugin() 同樣只在 dev 掛載，讓 /admin、/app 頁面管理 app 本身
  // （新增 / 刪除 / 重新命名 / 設定欄位），並同步聚合檔案。
  // writeRoutesPlugin() 同樣只在 dev 掛載，讓 /routes 頁面可以把編輯好的路由設定
  // 寫回 data/{app}/routes.json，或從磁碟讀回覆蓋 localStorage。
  // writeThemePlugin() 同樣只在 dev 掛載，讓 /theme 頁面可以把編輯好的主題設定
  // 寫回 data/theme.json（全域共用一份，不分 app），或從磁碟讀回覆蓋前端狀態。
  // writeFilesPlugin() 同樣只在 dev 掛載，讓 /files 頁面可以把上傳的檔案本體
  // 透過 /__api/upload-file 寫入 public/uploads/{app}/，模擬後端本機檔案上傳 API。
  // writeS3PresignPlugin() 同樣只在 dev 掛載，讓 /files 頁面在 app 設定為
  // 's3' provider 時，可以透過 /__api/s3-presign 取得 presigned URL 與檔名，
  // 前端再直接 PUT 上傳至 S3 / R2 等 S3 相容節點。純 SigV4 簽章邏輯已抽到
  // @workspace/server 套件（packages/server），這裡的 plugin 只負責讀本 app
  // 的 storage 設定並轉呼叫該套件。
  plugins: [
    react(),
    tailwindcss(),
    writeBackPlugin(),
    writeI18nPlugin(),
    writePagesPlugin(),
    writeAppsPlugin(),
    writeRoutesPlugin(),
    writeThemePlugin(),
    writeFilesPlugin(),
    writeS3PresignPlugin(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@workspace/ui": path.resolve(__dirname, "../../packages/ui/src"),
      "@workspace/browser": path.resolve(__dirname, "../../packages/browser/src"),
      "@workspace/server": path.resolve(__dirname, "../../packages/server/src"),
    },
  },
});
