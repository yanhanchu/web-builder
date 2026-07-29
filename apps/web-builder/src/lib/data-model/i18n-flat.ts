// ============================================================
// 扁平單語系 i18n JSON <-> DataSource map 轉換
//
// 外部常見的 i18n 檔案（例如 next-intl / react-i18next 的 en.json）長這樣：
//   { "home.title": "test", "home.visitor.amount": 100, "home.banner.show": false }
// 也就是「單一 locale、key 攤平成點分字串、value 是基本型別」的物件，
// 跟系統內部的 I18nDataSource（一筆資料含多個 locale 的值）是不同形狀，
// 所以需要一層雙向轉換，讓匯入/匯出可以直接對接一般 i18n 工具鏈的檔案格式。
//
// 這個模組刻意跟 React / import-modal 的 UI 無關，方便之後在別的地方
// （例如 CLI、匯出腳本）重用，也方便單獨測試。
// ============================================================

import type { DataSource, I18nDataSource, I18nPrimitiveValue, PrimitiveType } from './schema';

export interface FlatI18nRecord {
  [key: string]: I18nPrimitiveValue;
}

export interface FlatI18nParseIssue {
  key: string;
  reason: string;
}

export interface FlatI18nParseResult {
  /** key -> value，僅包含通過驗證的項目 */
  record: FlatI18nRecord;
  /** 被略過的 key 與原因（例如 value 是 object/array/null） */
  issues: FlatI18nParseIssue[];
}

/** i18n DataSource id 的慣例前綴，跟既有「新增 i18n」（makeId('i18n')）與 sample-data 用的規則一致。 */
const I18N_ID_PREFIX = 'i18n:';

export function i18nKeyToSourceId(key: string): string {
  return `${I18N_ID_PREFIX}${key}`;
}

/** 從 DataSource id 還原回攤平 i18n 用的 key；非 "i18n:" 開頭的 id 回傳 undefined。 */
export function sourceIdToI18nKey(id: string): string | undefined {
  return id.startsWith(I18N_ID_PREFIX) ? id.slice(I18N_ID_PREFIX.length) : undefined;
}

function inferPrimitiveType(value: I18nPrimitiveValue): PrimitiveType {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

/**
 * 驗證＋攤平任意 JSON 值成 FlatI18nRecord。
 * 只接受「頂層物件、每個 value 是 string/number/boolean」的形狀 —— 這正是
 * 一般 i18n 工具鏈（next-intl、react-i18next 等）輸出的單語系檔案格式。
 * 巢狀物件（例如 `{ "home": { "title": "..." } }`）不在這裡處理：多數常見
 * i18n 檔案本來就已經是攤平的點分 key，若使用者貼上巢狀結構，視為格式不符，
 * 讓上層提示錯誤，而不是自作主張幫忙攤平（避免猜錯分隔規則）。
 */
export function parseFlatI18nJson(value: unknown): FlatI18nParseResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record: FlatI18nRecord = {};
  const issues: FlatI18nParseIssue[] = [];

  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      record[key] = v;
    } else {
      issues.push({
        key,
        reason:
          v === null
            ? 'value 為 null，僅支援 string/number/boolean'
            : Array.isArray(v)
              ? 'value 為陣列，僅支援 string/number/boolean'
              : 'value 為巢狀物件，僅支援攤平後的 string/number/boolean',
      });
    }
  }

  return { record, issues };
}

export interface FlatI18nToSourcesOptions {
  /** 這批資料要寫入哪個 locale，例如 "en"。 */
  locale: string;
  /** 現有的 sources map，用來判斷某個 key 是否已存在、以及保留其他 locale 的既有值。 */
  existingSources: Record<string, DataSource>;
}

export interface FlatI18nToSourcesResult {
  /** 轉換後的 i18n DataSource map（key 為 source id），可直接併入 sources 使用。 */
  sources: Record<string, I18nDataSource>;
  /**
   * 型別衝突：同一個 key 在 existingSources 裡已經是 i18n 且 valueType 不同
   * （例如既有是 string，這次匯入卻是 number）。這種情況該筆會被略過、
   * 不寫入結果，避免把單一 i18n 詞條混進兩種型別的值。
   */
  typeConflicts: { key: string; existingType: PrimitiveType; incomingType: PrimitiveType }[];
  /**
   * id 衝突：同一個 key 對應的 source id 已存在，但既有資料不是 i18n
   * （例如是 file/route/typedData）。這種情況也會被略過。
   */
  kindConflicts: { key: string; existingKind: string }[];
}

/**
 * 把「單一 locale 的攤平 i18n record」轉成 I18nDataSource map。
 * - key 不存在於 existingSources：建立新的 I18nDataSource，valueType 依 value 型別推斷。
 * - key 已存在且是 i18n、valueType 相同：沿用既有的 label / 其他 locale 的值，
 *   只覆蓋這個 locale 的 value（讓「先匯入 en.json 再匯入 ja.json」可以疊加，
 *   而不會讓後匯入的檔案把前面 locale 的值洗掉）。
 * - key 已存在但型別衝突或 kind 不是 i18n：記錄進對應的 conflicts 清單，不寫入結果，
 *   交由呼叫端（UI）決定要不要提示使用者。
 */
export function flatI18nToSources(
  record: FlatI18nRecord,
  options: FlatI18nToSourcesOptions,
): FlatI18nToSourcesResult {
  const { locale, existingSources } = options;
  const sources: Record<string, I18nDataSource> = {};
  const typeConflicts: FlatI18nToSourcesResult['typeConflicts'] = [];
  const kindConflicts: FlatI18nToSourcesResult['kindConflicts'] = [];

  for (const [key, value] of Object.entries(record)) {
    const id = i18nKeyToSourceId(key);
    const incomingType = inferPrimitiveType(value);
    const existing = existingSources[id];

    if (!existing) {
      sources[id] = {
        id,
        kind: 'i18n',
        label: key,
        valueType: incomingType,
        values: { [locale]: value },
      };
      continue;
    }

    if (existing.kind !== 'i18n') {
      kindConflicts.push({ key, existingKind: existing.kind });
      continue;
    }

    if (existing.valueType !== incomingType) {
      typeConflicts.push({
        key,
        existingType: existing.valueType,
        incomingType,
      });
      continue;
    }

    sources[id] = {
      ...existing,
      values: { ...existing.values, [locale]: value },
    };
  }

  return { sources, typeConflicts, kindConflicts };
}

/**
 * 匯出：把 sources 裡所有 i18n 資料，依指定 locale 攤平成單語系 JSON（例如 en.json）。
 * - key 還原方式跟 flatI18nToSources 對稱：source id 去掉 "i18n:" 前綴。
 * - 該 locale 沒有值的詞條會被略過（該語系尚未翻譯，匯出檔裡就不會出現這個 key，
 *   避免寫入 undefined 或猜一個預設值誤導使用者）。
 */
export function sourcesToFlatI18n(
  sources: Record<string, DataSource>,
  locale: string,
): FlatI18nRecord {
  const record: FlatI18nRecord = {};
  for (const source of Object.values(sources)) {
    if (source.kind !== 'i18n') continue;
    const value = source.values[locale];
    if (value === undefined) continue;
    const key = sourceIdToI18nKey(source.id) ?? source.id;
    record[key] = value;
  }
  return record;
}