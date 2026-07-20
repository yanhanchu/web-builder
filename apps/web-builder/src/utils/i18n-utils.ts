// i18n 管理頁面：型別定義與 flatten / unflatten 工具函式

/** 單一 app 底下、單一語系的翻譯資料（key -> value，value 一律是字串） */
export type FlatDict = Record<string, string>;

/** 任意巢狀 JSON（value 可以是字串或再往下巢狀的物件） */
export interface NestedDict {
  [key: string]: string | NestedDict;
}

/** 一個 app 底下，各語系代碼對應到的翻譯資料（永遠以 flatten 後的形式存放） */
export type AppLocales = Record<string /* locale */, FlatDict>;

/** 整份 i18n 資料：app -> locale -> flat dict */
export type I18nData = Record<string /* app */, AppLocales>;

/**
 * 一個 key 可以標記的值類型。純粹是 metadata 標記，不影響目前 value 欄位的編輯 UI
 * （value 欄位維持既有的純文字輸入，僅匯出/匯入/寫檔時會帶上這個型別資訊）。
 */
export const VALUE_TYPES = [
  'string',
  'number',
  'boolean',
  'date',
  'multiline',
  'email',
  'url',
  'phone',
  'color',
  'file',
  'markdown',
] as const;

export type ValueType = (typeof VALUE_TYPES)[number];

export const DEFAULT_VALUE_TYPE: ValueType = 'string';

/** 一個 app 底下，每個 key 對應的型別標記（key -> type），跨語系共用同一份 */
export type KeyTypeMap = Record<string /* key */, ValueType>;

/** 整份 i18n key-type 標記資料：app -> key -> type */
export type I18nMetaData = Record<string /* app */, KeyTypeMap>;

const NESTED_KEY_SEP = '.';

/**
 * 把巢狀 JSON 攤平成 `{ "a.b.c": "value" }` 的形式。
 * 若某個 leaf 不是 string（例如 number/boolean/null），會轉成字串保留內容。
 */
export function flatten(obj: NestedDict, prefix = ''): FlatDict {
  const result: FlatDict = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}${NESTED_KEY_SEP}${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value as NestedDict, fullKey));
    } else {
      result[fullKey] = value === null || value === undefined ? '' : String(value);
    }
  }
  return result;
}

/**
 * 把 flatten 過的 `{ "a.b.c": "value" }` 還原成巢狀 JSON。
 *
 * 有個邊界情況要特別處理：同時存在 `"home"`（純字串）與 `"home.title"`
 * （巢狀路徑）這種「同一個 key 既是葉節點、又是其他 key 的前綴」的情況。
 * 原本的寫法會在走訪到 `"home.title"` 時，直接把 `"home"` 的字串值蓋成
 * `{}` 繼續往下建，導致 `"home"` 自己的值整個消失、卻沒有任何警告——
 * 是名副其實的「資料不見了」。這裡改成：一旦偵測到這種衝突，
 * 該 key 本身的值改用 `"__self__"` 這個保留欄位掛在同一個節點下
 * （`{ "home": { "__self__": "Homepage", "title": "Hello" } }`），
 * 而不是直接互相覆蓋、憑空遺失資料。
 */
export function unflatten(flat: FlatDict): NestedDict {
  const result: NestedDict = {};
  // 先按 key 長度（分段數）由短到長處理，確保「短 key（可能是葉節點）」
  // 一定比「以它為前綴的長 key」先寫入，避免處理順序不同造成結果不一致。
  const entries = Object.entries(flat).sort(
    (a, b) => a[0].split(NESTED_KEY_SEP).length - b[0].split(NESTED_KEY_SEP).length
  );
  for (const [flatKey, value] of entries) {
    const parts = flatKey.split(NESTED_KEY_SEP).filter(Boolean);
    if (parts.length === 0) continue;
    let cursor: NestedDict = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const existing = cursor[part];
      if (existing === undefined) {
        cursor[part] = {};
      } else if (typeof existing === 'string') {
        // 這個路徑上已經有一個字串值了（表示某個較短的 key 直接等於這一段），
        // 把它保留在 __self__ 底下，而不是直接蓋掉遺失。
        cursor[part] = { __self__: existing };
      }
      cursor = cursor[part] as NestedDict;
    }
    const lastKey = parts[parts.length - 1];
    const existingLeaf = cursor[lastKey];
    if (existingLeaf !== undefined && typeof existingLeaf === 'object') {
      // 這個 key 本身也已經被更長的 key 當作巢狀節點用過了，
      // 把它的值掛在 __self__ 底下，避免蓋掉子節點的資料。
      (existingLeaf as NestedDict).__self__ = value;
    } else {
      cursor[lastKey] = value;
    }
  }
  return result;
}

/** 判斷一份 JSON 是否「已經是攤平的」（所有 value 都是 primitive，沒有巢狀物件） */
export function isFlatJson(obj: Record<string, unknown>): boolean {
  return Object.values(obj).every(
    (v) => v === null || typeof v !== 'object' || Array.isArray(v)
  );
}

/** 匯入任意格式（recursive 或 flatten）的 JSON，一律轉成內部使用的 flatten 形式 */
export function importJsonToFlat(raw: unknown): FlatDict {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('JSON 根節點必須是物件');
  }
  const obj = raw as Record<string, unknown>;
  if (isFlatJson(obj)) {
    const flat: FlatDict = {};
    for (const [k, v] of Object.entries(obj)) {
      flat[k] = v === null || v === undefined ? '' : String(v);
    }
    return flat;
  }
  return flatten(obj as NestedDict);
}

/**
 * 巢狀/攤平模式（沿用既有 flat/nested 選擇）與是否額外包含 metadata（目前僅有每個 key 的 type）
 * 是彼此獨立的兩個維度：
 * - `includeMetadata: false`（預設）：格式與原本完全相同，純粹是 value 的 flat 或 nested JSON。
 * - `includeMetadata: true`：外層包一層 `{ meta: { [key]: { type } }, data: <flat 或 nested 的 value> }`。
 */
export type ExportFormat = 'flat' | 'nested';

export interface ExportOptions {
  format: ExportFormat;
  includeMetadata?: boolean;
  /** includeMetadata 為 true 時，每個 key 對應的型別標記；未提供的 key 視為預設 string */
  keyTypes?: KeyTypeMap;
}

/** 含 metadata 匯出格式的檔案結構 */
export interface MetaExportShape {
  meta: Record<string, { type: ValueType }>;
  data: NestedDict | FlatDict;
}

/** 判斷一份 parse 完的 JSON 是否符合「含 metadata」的匯出格式（有 meta + data 兩個欄位） */
export function isMetaExportShape(obj: Record<string, unknown>): obj is Record<string, unknown> & {
  meta: unknown;
  data: unknown;
} {
  return (
    'meta' in obj &&
    'data' in obj &&
    obj.meta !== null &&
    typeof obj.meta === 'object' &&
    !Array.isArray(obj.meta) &&
    obj.data !== null &&
    typeof obj.data === 'object'
  );
}

/** 匯出時依需求輸出 flatten 或 recursive(nested) 的 JSON 字串；可選擇是否包含 key 的 type metadata */
export function exportFlatToJson(flat: FlatDict, options: ExportFormat | ExportOptions): string {
  const opts: ExportOptions = typeof options === 'string' ? { format: options } : options;
  const valueData = opts.format === 'flat' ? sortKeys(flat) : unflatten(flat);

  if (!opts.includeMetadata) {
    return JSON.stringify(valueData, null, 2);
  }

  const meta: Record<string, { type: ValueType }> = {};
  for (const key of Object.keys(flat).sort()) {
    meta[key] = { type: opts.keyTypes?.[key] ?? DEFAULT_VALUE_TYPE };
  }
  const shaped: MetaExportShape = { meta, data: valueData };
  return JSON.stringify(shaped, null, 2);
}

/**
 * 匯入任意格式的 JSON，自動判斷是否為「含 metadata」格式：
 * - 含 metadata：從 `data` 欄位還原 flat 值，並回傳 `meta` 內每個 key 的型別（找不到則預設 string）。
 * - 不含 metadata：與既有 `importJsonToFlat` 行為相同，keyTypes 回傳空物件。
 */
export function importJsonToFlatWithMeta(raw: unknown): { flat: FlatDict; keyTypes: KeyTypeMap } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('JSON 根節點必須是物件');
  }
  const obj = raw as Record<string, unknown>;

  if (isMetaExportShape(obj)) {
    const flat = importJsonToFlat(obj.data);
    const keyTypes: KeyTypeMap = {};
    const metaObj = obj.meta as Record<string, unknown>;
    for (const [key, entry] of Object.entries(metaObj)) {
      const type =
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? (entry as { type?: unknown }).type
          : undefined;
      keyTypes[key] =
        typeof type === 'string' && (VALUE_TYPES as readonly string[]).includes(type)
          ? (type as ValueType)
          : DEFAULT_VALUE_TYPE;
    }
    return { flat, keyTypes };
  }

  return { flat: importJsonToFlat(obj), keyTypes: {} };
}

function sortKeys(flat: FlatDict): FlatDict {
  const sorted: FlatDict = {};
  for (const key of Object.keys(flat).sort()) {
    sorted[key] = flat[key];
  }
  return sorted;
}

/** 所有 app 底下出現過的 key 聯集（用來組表格的列） */
export function collectAllKeys(appLocales: AppLocales): string[] {
  const keySet = new Set<string>();
  for (const dict of Object.values(appLocales)) {
    for (const key of Object.keys(dict)) keySet.add(key);
  }
  return Array.from(keySet).sort();
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 把多個 { filename, content } 打包成單一 zip 並下載 */
export async function downloadFilesAsZip(
  zipFilename: string,
  files: Array<{ filename: string; content: string }>
) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const { filename, content } of files) {
    zip.file(filename, content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
