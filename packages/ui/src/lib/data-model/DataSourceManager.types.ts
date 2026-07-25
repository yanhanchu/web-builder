import type { ReactNode } from "react";
import type { FileDataSource } from "./schema";

/**
 * 由 app 層提供、用來在每筆 file 資料列標題列（刪除鈕左側）注入同步狀態 UI。
 * packages/ui 不能反向依賴 apps/web-builder，所以這裡只定義形狀，
 * 實際的同步狀態渲染由 data-manager 頁面透過 prop 傳入。
 */
export type FileRowSyncSlot = (file: FileDataSource) => ReactNode;
