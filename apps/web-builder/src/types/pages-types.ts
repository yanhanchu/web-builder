// data/pages.json 的節點型別定義。
// 與 scripts/generate-pages.mjs 讀取的結構完全一致，
// 供 runtime 動態渲染器（DynamicRenderer）使用。

import type { BindingMap } from "./binding-types";

// ---------------------------------------------------------------------------
// 頁面層級的 SEO 設定（PageSeo）
//
// 與 AppSeo（types.ts）共用相同結構，但語意上是「覆蓋 app 層級 SEO 的
// 頁面專屬值」——產生頁面時，可以用 pageSeo 蓋掉 appSeo 的對應欄位，
// 留空的欄位就沿用 app 層級的值。欄位形狀刻意與 AppSeo 對齊，方便
// SeoEditor 元件同時服務 app 層與頁面層。
// ---------------------------------------------------------------------------

export interface PageSeoOpenGraph {
  type: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  url: string;
  siteName: string;
  locale: string;
}

export interface PageSeoTwitter {
  card: string;
  site: string;
  creator: string;
  title: string;
  description: string;
  image: string;
}

export interface PageSeo {
  title: string;
  titleTemplate: string;
  description: string;
  keywords: string[];
  canonicalUrl: string;
  language: string;
  locale: string;
  openGraph: PageSeoOpenGraph;
  twitter: PageSeoTwitter;
}

export function emptyPageSeoOpenGraph(): PageSeoOpenGraph {
  return { type: '', title: '', description: '', image: '', imageAlt: '', url: '', siteName: '', locale: '' };
}

export function emptyPageSeoTwitter(): PageSeoTwitter {
  return { card: '', site: '', creator: '', title: '', description: '', image: '' };
}

export function emptyPageSeo(): PageSeo {
  return {
    title: '',
    titleTemplate: '',
    description: '',
    keywords: [],
    canonicalUrl: '',
    language: '',
    locale: '',
    openGraph: emptyPageSeoOpenGraph(),
    twitter: emptyPageSeoTwitter(),
  };
}

/** 把可能不完整的 PageSeo（例如磁碟舊資料缺少子物件）補齊成完整形狀。 */
export function normalizePageSeo(seo: Partial<PageSeo> | undefined): PageSeo {
  const s = seo ?? {};
  return {
    ...emptyPageSeo(),
    ...s,
    keywords: Array.isArray(s.keywords) ? s.keywords : [],
    openGraph: { ...emptyPageSeoOpenGraph(), ...(s.openGraph ?? {}) },
    twitter: { ...emptyPageSeoTwitter(), ...(s.twitter ?? {}) },
  };
}

export interface ComponentNode {
  /** 對應 data/components.json 的 id（例如 "card-card"） */
  component: string;
  props?: Record<string, unknown>;
  children?: PageNode[];
}

/** 頁面節點：可以是純文字，也可以是一個 component 節點（可遞迴巢狀） */
export type PageNode = string | ComponentNode;

export interface PageDef {
  id: string;
  title: string;
  nodes: PageNode[];
  /**
   * 頁面層級的 SEO 設定（選填）。
   * 留空的欄位沿用 app 層級（AppSeo）的設定；有值的欄位蓋掉 app 層級的值。
   * 形狀與 AppSeo 對齊，方便 SeoEditor 元件同時服務 app 層與頁面層。
   */
  seo?: PageSeo;
  /**
   * 選填的欄位綁定 sidecar：記錄哪些文字節點 / component props 改成動態
   * 從別的資料來源（目前只有 i18n）取值顯示，而不是寫死的字面內容。
   * 刻意獨立於 `nodes` 之外（不混進 `PageNode` / `ComponentNode`），這樣：
   *   - 舊資料（沒有這個欄位）完全相容，viewer/generator 不需要跟著改。
   *   - `nodes` 樹本身的型別維持單純的 `string | ComponentNode`，
   *     不會因為多了一種「動態值」的節點型態而讓所有讀取 nodes 的地方
   *     都要多處理一種 case。
   * path 格式見 `@/types/binding-types` 的說明。
   */
  bindings?: BindingMap;
}

/**
 * data/pages.json 現在以 app 做區隔（跟 i18n 的 I18nData 概念一致）：
 * app -> 該 app 底下的頁面陣列。
 * app 是一個 app / workspace 的概念，pages 的即時預覽、編輯都限定在某個 app 之下。
 */
export type PagesData = Record<string /* app */, PageDef[]>;
