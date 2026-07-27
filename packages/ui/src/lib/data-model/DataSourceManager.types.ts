import type { ReactNode } from "react";
import type { FileDataSource } from "./schema";

/**
 * 由 app 層提供、用來在每筆 file 資料列標題列（刪除鈕左側）注入同步狀態 UI。
 * packages/ui 不能反向依賴 apps/web-builder，所以這裡只定義形狀，
 * 實際的同步狀態渲染由 data-manager 頁面透過 prop 傳入。
 */
export type FileRowSyncSlot = (file: FileDataSource) => ReactNode;

/**
 * 把 FileDataSource.url 轉成瀏覽器可以直接拿來當 <img src> 用的網址。
 *
 * 背景：url 欄位不一定是一般 http(s) 網址，也可能是 `opfs://appName/fileName`
 * 這種指向瀏覽器 OPFS 內容的假 scheme（見 apps/web-builder/src/lib/opfs.ts）。
 * OPFS 的讀取、blob: URL 產生邏輯都在 apps/web-builder 裡，packages/ui
 * 不能反向依賴它，所以用跟 FileRowSyncSlot 一樣的注入模式：
 * 這裡只定義形狀，實際實作由 data-manager 頁面傳入。
 *
 * 不提供的話，圖片預覽會直接把 url 原樣當 <img src>（一般 http(s) 網址
 * 沒問題，opfs:// 網址則會顯示不出來）。
 */
export type FilePreviewUrlResolver = (url: string) => Promise<string> | string;
