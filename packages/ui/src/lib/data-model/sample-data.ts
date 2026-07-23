// ============================================================
// 示範資料：對照 packages/ui/src/components/landing1/default.ts
//
// default.ts 目前的做法是：宣告一份 brandData / primaryNav / themeOptions，
// 然後在 header、footer 兩處各自手動 spread 進去 —— 這是「先建好資料，
// 但沒有真正的引用機制」的狀態，資料改了要記得兩處都更新，容易漏改。
//
// 這裡示範同一份資料改用 data-model 的方式管理：brandData / primaryNav /
// themeOptions 各自建成一筆 TypedDataSource（型別資料管理系統裡的紀錄），
// Header 和 Footer 的 props 都用 `{ mode: 'bound', sourceId: ... }` 整格引用
// 同一筆資料 —— 之後要換 LOGO 或調整導覽連結，只要改這一筆，所有引用處
// 都會透過 resolveValue() 自動同步。
// ============================================================

import type { DataSource, ValueNode } from './schema';
import { InMemoryDataStore, resolveValue } from './schema';
import { typeRegistry, componentPropsRegistry } from './from-generated';

// ------------------------------------------------------------
// 從真實生成資料取出 Header / Footer 的 props 型別
// ------------------------------------------------------------

export const headerEntry = componentPropsRegistry['src/components/landing1/header.tsx#Header'];
export const footerEntry = componentPropsRegistry['src/components/landing1/footer.tsx#Footer'];

export const headerPropsType = headerEntry.propsType;
export const footerPropsType = footerEntry.propsType;

export { typeRegistry };

// 複合 typeId 直接對應 component-types.json 裡的 id（生成器已提供，不需自己組）
const BrandDataTypeId = 'src/components/landing1/types.ts#BrandData';
const NavItemTypeId = 'src/components/landing1/types.ts#NavItem';
const NavColumnTypeId = 'src/components/landing1/types.ts#NavColumn';
const ThemeOptionTypeId = 'src/components/landing1/types.ts#ThemeOption';

// ------------------------------------------------------------
// DataSource 清單：模擬「型別資料管理」「i18n 管理」「檔案管理」已經建好的資料
// ------------------------------------------------------------

export const sources: Record<string, DataSource> = {
  // --- i18n（基本型別容器，這裡都是 string） ---
  'i18n:brand.ariaLabel': {
    id: 'i18n:brand.ariaLabel',
    kind: 'i18n',
    label: 'i18n: 品牌連結 aria-label',
    valueType: 'string',
    values: { 'zh-TW': '回到首頁', en: 'OZSV home' },
  },
  'i18n:brand.mark': {
    id: 'i18n:brand.mark',
    kind: 'i18n',
    label: 'i18n: Logo alt text',
    valueType: 'string',
    values: { 'zh-TW': 'OZSV', en: 'OZSV' },
  },
  'i18n:brand.wordmark.lead': {
    id: 'i18n:brand.wordmark.lead',
    kind: 'i18n',
    label: 'i18n: Wordmark 主字',
    valueType: 'string',
    values: { 'zh-TW': 'OZ', en: 'OZ' },
  },
  'i18n:brand.wordmark.accent': {
    id: 'i18n:brand.wordmark.accent',
    kind: 'i18n',
    label: 'i18n: Wordmark 強調字',
    valueType: 'string',
    values: { 'zh-TW': 'SV', en: 'SV' },
  },
  'i18n:nav.product': {
    id: 'i18n:nav.product',
    kind: 'i18n',
    label: 'i18n: 導覽 - 產品',
    valueType: 'string',
    values: { 'zh-TW': '產品', en: 'Product' },
  },
  'i18n:nav.about': {
    id: 'i18n:nav.about',
    kind: 'i18n',
    label: 'i18n: 導覽 - 關於我們',
    valueType: 'string',
    values: { 'zh-TW': '關於我們', en: 'About' },
  },
  'i18n:nav.contact': {
    id: 'i18n:nav.contact',
    kind: 'i18n',
    label: 'i18n: 導覽 - 聯絡我們',
    valueType: 'string',
    values: { 'zh-TW': '聯絡我們', en: 'Contact' },
  },
  'i18n:theme.groupLabel': {
    id: 'i18n:theme.groupLabel',
    kind: 'i18n',
    label: 'i18n: 主題群組標籤',
    valueType: 'string',
    values: { 'zh-TW': '主題', en: 'Theme' },
  },
  'i18n:menu.open': {
    id: 'i18n:menu.open',
    kind: 'i18n',
    label: 'i18n: 開啟選單',
    valueType: 'string',
    values: { 'zh-TW': '開啟選單', en: 'Open menu' },
  },
  'i18n:menu.close': {
    id: 'i18n:menu.close',
    kind: 'i18n',
    label: 'i18n: 關閉選單',
    valueType: 'string',
    values: { 'zh-TW': '關閉選單', en: 'Close menu' },
  },
  'i18n:footer.tagline': {
    id: 'i18n:footer.tagline',
    kind: 'i18n',
    label: 'i18n: Footer 標語',
    valueType: 'string',
    values: {
      'zh-TW': '一起打造更好的軟體。',
      en: 'Building better software, together.',
    },
  },
  'i18n:footer.copyright': {
    id: 'i18n:footer.copyright',
    kind: 'i18n',
    label: 'i18n: 版權宣告',
    valueType: 'string',
    values: {
      'zh-TW': '© 2026 OZSV. 版權所有。',
      en: '© 2026 OZSV. All rights reserved.',
    },
  },

  // --- 檔案 ---
  'file:logo-main': {
    id: 'file:logo-main',
    kind: 'file',
    label: '檔案: 主要 Logo',
    url: 'https://example.com/logo.svg',
    mimeType: 'image/svg+xml',
  },

  // --- 型別資料：BrandData（單筆），Header 與 Footer 共用同一筆 ---
  'typedData:brand:main': {
    id: 'typedData:brand:main',
    kind: 'typedData',
    label: '型別資料: 主品牌 (BrandData)',
    typeId: BrandDataTypeId,
    value: {
      mode: 'object',
      fields: {
        toHome: { mode: 'literal', value: '/' },
        ariaLabel: { mode: 'bound', sourceId: 'i18n:brand.ariaLabel' },
        mark: { mode: 'bound', sourceId: 'i18n:brand.mark' },
        logoSrc: { mode: 'bound', sourceId: 'file:logo-main' },
        wordmark: {
          mode: 'object',
          fields: {
            lead: { mode: 'bound', sourceId: 'i18n:brand.wordmark.lead' },
            accent: { mode: 'bound', sourceId: 'i18n:brand.wordmark.accent' },
          },
        },
      },
    },
  },

  // --- 型別資料：NavItem[]（主導覽，Header 用） ---
  'typedData:nav:primary': {
    id: 'typedData:nav:primary',
    kind: 'typedData',
    label: '型別資料: 主導覽 (NavItem[])',
    typeId: `${NavItemTypeId}[]`,
    value: {
      mode: 'array',
      items: [
        {
          mode: 'object',
          fields: {
            label: { mode: 'bound', sourceId: 'i18n:nav.product' },
            to: { mode: 'literal', value: '/product' },
          },
        },
        {
          mode: 'object',
          fields: {
            label: { mode: 'bound', sourceId: 'i18n:nav.about' },
            to: { mode: 'literal', value: '/about' },
          },
        },
        {
          mode: 'object',
          fields: {
            label: { mode: 'bound', sourceId: 'i18n:nav.contact' },
            to: { mode: 'literal', value: '/contact' },
          },
        },
      ],
    },
  },

  // --- 型別資料：ThemeOption[]（Header 與 ThemeToggle 共用） ---
  'typedData:theme:options': {
    id: 'typedData:theme:options',
    kind: 'typedData',
    label: '型別資料: 主題選項 (ThemeOption[])',
    typeId: `${ThemeOptionTypeId}[]`,
    value: {
      mode: 'array',
      items: [
        {
          mode: 'object',
          fields: {
            value: { mode: 'literal', value: 'light' },
            label: { mode: 'literal', value: 'Light' },
          },
        },
        {
          mode: 'object',
          fields: {
            value: { mode: 'literal', value: 'dark' },
            label: { mode: 'literal', value: 'Dark' },
          },
        },
        {
          mode: 'object',
          fields: {
            value: { mode: 'literal', value: 'system' },
            label: { mode: 'literal', value: 'System' },
          },
        },
      ],
    },
  },

  // --- 型別資料：NavColumn[]（Footer 的分組連結） ---
  'typedData:nav:footerColumns': {
    id: 'typedData:nav:footerColumns',
    kind: 'typedData',
    label: '型別資料: Footer 導覽分組 (NavColumn[])',
    typeId: `${NavColumnTypeId}[]`,
    value: {
      mode: 'array',
      items: [
        {
          mode: 'object',
          fields: {
            title: { mode: 'literal', value: 'Product' },
            items: {
              mode: 'array',
              items: [
                {
                  mode: 'object',
                  fields: {
                    label: { mode: 'literal', value: 'Features' },
                    to: { mode: 'literal', value: '/features' },
                  },
                },
                {
                  mode: 'object',
                  fields: {
                    label: { mode: 'literal', value: 'Pricing' },
                    to: { mode: 'literal', value: '/pricing' },
                  },
                },
              ],
            },
          },
        },
        {
          mode: 'object',
          fields: {
            title: { mode: 'literal', value: 'Company' },
            items: {
              mode: 'array',
              items: [
                {
                  mode: 'object',
                  fields: {
                    label: { mode: 'bound', sourceId: 'i18n:nav.about' },
                    to: { mode: 'literal', value: '/about' },
                  },
                },
                {
                  mode: 'object',
                  fields: {
                    label: { mode: 'bound', sourceId: 'i18n:nav.contact' },
                    to: { mode: 'literal', value: '/contact' },
                  },
                },
              ],
            },
          },
        },
      ],
    },
  },
};

// ------------------------------------------------------------
// 初始 ValueNode：Header / Footer 兩個 component instance 的 props 實際值
//
// 對照 default.ts：header 和 footer 都手動填了一份 brandData —— 這裡兩者
// 都改成 { mode: 'bound', sourceId: 'typedData:brand:main' }，整格引用同一筆。
// ------------------------------------------------------------

export const initialHeaderProps: ValueNode = {
  mode: 'object',
  fields: {
    brand: { mode: 'bound', sourceId: 'typedData:brand:main' },
    primaryNav: { mode: 'bound', sourceId: 'typedData:nav:primary' },
    themeOptions: { mode: 'bound', sourceId: 'typedData:theme:options' },
    themeGroupLabel: { mode: 'bound', sourceId: 'i18n:theme.groupLabel' },
    themeLabel: { mode: 'bound', sourceId: 'i18n:theme.groupLabel' },
    openMenuLabel: { mode: 'bound', sourceId: 'i18n:menu.open' },
    closeMenuLabel: { mode: 'bound', sourceId: 'i18n:menu.close' },
  },
};

export const initialFooterProps: ValueNode = {
  mode: 'object',
  fields: {
    // 同一筆 typedData:brand:main，跟 header 共用 —— 這是整格引用的核心價值
    brand: { mode: 'bound', sourceId: 'typedData:brand:main' },
    tagline: { mode: 'bound', sourceId: 'i18n:footer.tagline' },
    email: { mode: 'literal', value: 'hello@example.com' },
    emailAriaLabel: { mode: 'literal', value: 'Email us at hello@example.com' },
    columns: { mode: 'bound', sourceId: 'typedData:nav:footerColumns' },
    copyright: { mode: 'bound', sourceId: 'i18n:footer.copyright' },
    meta: { mode: 'literal', value: 'Made in Australia' },
  },
};

// ------------------------------------------------------------
// 建立好的 DataStore 實例，供頁面 / 其他模組直接使用
// ------------------------------------------------------------

export function createSampleStore() {
  return new InMemoryDataStore(sources, typeRegistry);
}

// 方便直接拿到「resolve 後的純值 props」，可以直接 spread 給實際的 <Header />/<Footer />
export function resolveHeaderProps(locale: string) {
  const store = createSampleStore();
  return resolveValue(headerPropsType, initialHeaderProps, store, { locale });
}

export function resolveFooterProps(locale: string) {
  const store = createSampleStore();
  return resolveValue(footerPropsType, initialFooterProps, store, { locale });
}
