import type { ReactNode } from "react";
import type { FileDataSource } from "@workspace/ui/lib/data-model/schema";

/** 由 app 層注入，用來在每筆 file 資料列標題列（刪除鈕左側）顯示同步狀態 UI。 */
export type FileRowSyncSlot = (file: FileDataSource) => ReactNode;

/**
 * 由 app 層注入，用來在展開的 FileFields 詳細資訊區塊顯示「所有已同步節點」
 * 清單（每個節點目前落地的 url）。跟 FileRowSyncSlot 分開，是因為標題列只
 * 需要精簡的狀態小藥丸，詳細資訊區塊則需要完整列出每個節點的 url。
 */
export type FileDetailSyncSlot = (file: FileDataSource) => ReactNode;

/** 供「路由 → 選擇頁面」下拉選單使用的最小頁面資訊。 */
export interface PageOption {
  id: string;
  name: string;
}

/**
 * 把 FileDataSource.url 轉成瀏覽器可直接當 <img src> 用的網址。
 * url 不一定是一般 http(s) 網址，也可能是 `opfs://appName/fileName` 這種假 scheme，
 * 實際解析由 app 層提供。不提供時，圖片預覽會把 url 原樣當 <img src>。
 */
export type FilePreviewUrlResolver = (url: string) => Promise<string> | string;
