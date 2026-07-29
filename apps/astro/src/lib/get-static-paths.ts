// ============================================================
// get-static-paths —— 給 site-generator 產出的 `pages/[lang]/{page}.astro`
// 共用的 `getStaticPaths` 工廠函式。
//
// 此檔案由 site-generator（apps/web-builder/scripts/site-generator/astro-codegen/render-page-astro.ts
// 的 renderGetStaticPathsLibFile()）自動產生，請勿手動編輯——重新執行產生器
// 即會覆蓋這裡的內容。
//
// 背景：Astro 的動態路由規則要求每個 `.astro` 檔案自己 export 一個
// `getStaticPaths` 函式（這是 Astro 編譯器寫死的規則，不是慣例，沒有像
// SvelteKit `+page.ts` 那種「同目錄檔案自動被框架抓走」的機制），所以
// 沒辦法讓 `.astro` 檔案完全不出現這個 export。
//
// 這裡把「怎麼從 `{ [lang]: data }` 物件產生 getStaticPaths 回傳值」這段
// 純邏輯（跟任何一個頁面的實際內容都無關）抽成共用函式，每個生成頁面只
// 需要：
//
//   export const getStaticPaths = makeGetStaticPaths(dataByLang);
//
// 一行就完成，不用在每個 `.astro` 裡重複寫 `Object.keys(...).map(...)`
// 那段迴圈邏輯。
// ============================================================

export function makeGetStaticPaths<T extends Record<string, unknown>>(dataByLang: T) {
  return function getStaticPaths() {
    return (Object.keys(dataByLang) as (keyof T)[]).map((lang) => ({
      params: { lang },
      props: { data: dataByLang[lang] },
    }));
  };
}
