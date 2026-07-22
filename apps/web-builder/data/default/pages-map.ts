// 此檔案由 scripts/generate-pages.mjs 自動產生，請勿手動編輯。
// 執行 `npm run pages:generate` 以重新產生。
//
// 這個 app 底下 build-time 產生的靜態頁面清單，由
// src/pages/generated-pages-map.ts 依目前選定的 app 動態讀取。
// 每個 entry 的 Component 是直接 import 進來的（非 code-splitting）。

import type { ComponentType } from 'react';
import { HomePage } from './pages/home';
import { AboutPage } from './pages/about';

export interface GeneratedPageEntry {
  id: string;
  /** 相對於掛載路由的 path 片段，預設等同 id */
  path: string;
  title: string;
  Component: ComponentType;
}

export const generatedPages: GeneratedPageEntry[] = [
  { id: "home", path: "home", title: "首頁", Component: HomePage },
  { id: "about", path: "about", title: "關於", Component: AboutPage },
];

export function getGeneratedPageById(id: string): GeneratedPageEntry | undefined {
  return generatedPages.find((p) => p.id === id);
}
