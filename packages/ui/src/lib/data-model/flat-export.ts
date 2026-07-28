// ============================================================
// 攤平（去除 id/kind 外層）JSON <-> DataSource map 轉換 —— route / file / typedData
//
// i18n 的「攤平」是沿著 locale 維度攤平成純值（見 i18n-flat.ts），跟這裡的
// route/file/typedData 是不同語意：這三種 kind 沒有 locale 概念，「攤平」
// 指的是拿掉 DataSource 的 id/kind 外層包裝，只留下 key（= id 去掉 kind 前綴）
// 對應到「剩餘欄位組成的物件」，格式介於「完整 DataSource JSON」與
// 「純值」之間 —— 保留 label/mimeType/target/typeId 等欄位，但不用再重複
// 寫 id 和 kind（key 本身就決定了 id，物件所在的檔案/區塊就決定了 kind）。
//
// 範例（file，攤平後）：
//   {
//     "logo": { "label": "站台 Logo", "url": "https://...", "mimeType": "image/png" },
//     "hero-bg": { "url": "https://..." }
//   }
// 還原回 DataSource 時，key "logo" 會補回 id="file:logo"、kind="file"。
//
// 這個模組跟 i18n-flat.ts 一樣刻意跟 React / UI 無關，方便重用與測試。
// ============================================================

import type {
  DataSource,
  DataSourceKind,
  FileDataSource,
  RouteDataSource,
  TypedDataSource,
} from './schema';

/** 攤平格式覆蓋的 kind：i18n 有自己的一套（見 i18n-flat.ts），不在這裡處理。 */
export type FlatKind = Exclude<DataSourceKind, 'i18n'>;

/** 各 kind 對應的 id 前綴慣例，跟 data-source-manager 的 makeId(prefix) 一致。 */
const ID_PREFIX: Record<FlatKind, string> = {
  route: 'route:',
  file: 'file:',
  typedData: 'typedData:',
};

export function flatKeyToSourceId(kind: FlatKind, key: string): string {
  return `${ID_PREFIX[kind]}${key}`;
}

/** 從 DataSource id 還原回攤平用的 key；id 前綴跟 kind 不對應時回傳 undefined。 */
export function sourceIdToFlatKey(kind: FlatKind, id: string): string | undefined {
  const prefix = ID_PREFIX[kind];
  return id.startsWith(prefix) ? id.slice(prefix.length) : undefined;
}

/** 攤平後的單筆內容：DataSource 扣掉 id/kind 之後剩下的欄位。 */
export type FlatEntry<K extends FlatKind> = Omit<Extract<DataSource, { kind: K }>, 'id' | 'kind'>;

export type FlatRecord<K extends FlatKind> = Record<string, FlatEntry<K>>;

export interface FlatParseIssue {
  key: string;
  reason: string;
}

export interface FlatParseResult<K extends FlatKind> {
  record: FlatRecord<K>;
  issues: FlatParseIssue[];
}

/**
 * 每個 kind 各自的「這個攤平後的物件像不像這個 kind」檢查，只做最基本的必填
 * 欄位型別檢查（寬鬆），細節錯誤（例如 route.target 不是 'page'|'url'）留給
 * 使用者自己核對，這裡的目的是擋掉明顯貼錯格式（例如把 file 的攤平內容
 * 貼到 route 分頁匯入）。
 */
function isValidFlatEntry(kind: FlatKind, v: unknown): v is FlatEntry<FlatKind> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  switch (kind) {
    case 'route':
      return typeof o.value === 'string' && typeof o.noindex === 'boolean';
    case 'file':
      return typeof o.url === 'string';
    case 'typedData':
      return typeof o.typeId === 'string' && !!o.value && typeof o.value === 'object';
  }
}

/**
 * 驗證＋整理任意 JSON 值成指定 kind 的 FlatRecord。
 * 只接受「頂層物件、每個 value 是符合該 kind 最低要求的物件」的形狀；
 * 不符合的 key 記錄進 issues、不中斷整批解析。
 */
export function parseFlatKindJson<K extends FlatKind>(
  kind: K,
  value: unknown,
): FlatParseResult<K> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record: FlatRecord<K> = {};
  const issues: FlatParseIssue[] = [];

  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (isValidFlatEntry(kind, v)) {
      // 同上一個函式的說明：isValidFlatEntry 只把 v 窄化成「三種 kind 各自
      // 攤平格式的聯集」，TS 無法把這個聯集自動對應回呼叫端指定的具體 K，
      // 執行期已經用 isValidFlatEntry(kind, v) 依 kind 驗證過對應欄位，
      // 這裡的轉換是安全的，照 TS 建議先過一次 unknown 再斷言。
      record[key] = v as unknown as FlatEntry<K>;
    } else {
      issues.push({
        key,
        reason: `value 不符合 ${kind} 攤平格式所需的最低欄位`,
      });
    }
  }

  return { record, issues };
}

export interface FlatKindToSourcesOptions {
  existingSources: Record<string, DataSource>;
}

export interface FlatKindToSourcesResult {
  sources: Record<string, DataSource>;
  /** id 已存在但既有資料是別的 kind（例如攤平的 route 資料卻撞到一筆同名的 file）。 */
  kindConflicts: { key: string; existingKind: string }[];
}

/**
 * 把某個 kind 的 FlatRecord 轉回 DataSource map。
 * - key 不存在於 existingSources：直接補回 id/kind 建立新的 DataSource。
 * - key 已存在且 kind 相同：整筆覆蓋（攤平格式沒有 i18n 那種「多語系疊加」
 *   的概念，同一個 key 只有一份資料，語意上就是「用這筆取代舊的」）。
 * - key 已存在但 kind 不同：記錄進 kindConflicts，不寫入結果。
 */
export function flatKindToSources<K extends FlatKind>(
  kind: K,
  record: FlatRecord<K>,
  options: FlatKindToSourcesOptions,
): FlatKindToSourcesResult {
  const { existingSources } = options;
  const sources: Record<string, DataSource> = {};
  const kindConflicts: FlatKindToSourcesResult['kindConflicts'] = [];

  for (const [key, entry] of Object.entries(record)) {
    const id = flatKeyToSourceId(kind, key);
    const existing = existingSources[id];

    if (existing && existing.kind !== kind) {
      kindConflicts.push({ key, existingKind: existing.kind });
      continue;
    }

    sources[id] = { id, kind, ...entry } as unknown as DataSource;
  }

  return { sources, kindConflicts };
}

/**
 * 匯出：把 sources 裡指定 kind 的資料，攤平成「去除 id/kind」的 JSON。
 * key 還原方式跟 flatKindToSources 對稱：source id 去掉該 kind 的前綴。
 */
export function sourcesToFlatKind<K extends FlatKind>(
  sources: Record<string, DataSource>,
  kind: K,
): FlatRecord<K> {
  const record: FlatRecord<K> = {};
  for (const source of Object.values(sources)) {
    if (source.kind !== kind) continue;
    const { id, kind: _kind, ...rest } = source;
    const key = sourceIdToFlatKey(kind, id) ?? id;
    // source 雖然已經被 `source.kind !== kind` 篩過，邏輯上等同 Extract<DataSource, { kind: K }>，
    // 但 TS 沒辦法把「迴圈裡動態比較 source.kind」跟泛型參數 K 的窄化連動起來，
    // rest 型別仍是三種 kind 欄位的聯集，跟 FlatEntry<K> 不夠重疊、不能直接斷言。
    // 這裡的轉換在執行期是安全的（上面的 if 已經保證 kind 匹配），所以照 TS
    // 建議先過一次 unknown 再斷言成目標型別。
    record[key] = rest as unknown as FlatEntry<K>;
  }
  return record;
}

// ------------------------------------------------------------
// 個別 kind 的型別別名，方便呼叫端不用自己組 Extract<...>
// ------------------------------------------------------------

export type FlatRouteRecord = FlatRecord<'route'>;
export type FlatFileRecord = FlatRecord<'file'>;
export type FlatTypedDataRecord = FlatRecord<'typedData'>;

export type { FileDataSource, RouteDataSource, TypedDataSource };