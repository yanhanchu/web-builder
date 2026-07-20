// 此檔案由 scripts/generate-pages.mjs 自動產生，請勿手動編輯。
// 執行 `npm run pages:generate` 以重新產生。
//
// 提供路由（App.tsx）與任何導覽 UI 使用的靜態頁面清單。
// 每個 entry 的 Component 是直接 import 進來的（非 code-splitting）；
// 若之後想跟文件頁一樣做成 lazy load，可比照 component-map.ts 改成
// `() => import('./generated/xxx')` 並在路由端用 React.lazy 包裝。

import type { ComponentType } from 'react';
import { HomePage } from './generated/home';
import { AboutPage } from './generated/about';

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
