// ============================================================
// 此檔案由 site-generator（apps/site-generator/src/astro-codegen/render-page-astro.ts）
// 自動產生，請勿手動編輯——重新執行產生器即會覆蓋這裡的內容。
//
// 來源頁面：home（首頁）
// 彙總 ["zh-TW","en"] 各語系的 data.ts，供
// `pages/[lang]/index.astro` 的
// `getStaticPaths`（透過 makeGetStaticPaths()）使用。
// ============================================================

import * as zh_TW from "../zh-TW/test/data";
import * as en from "../en/test/data";

export const dataByLang = {
  "zh-TW": zh_TW,
  "en": en,
} as const;
