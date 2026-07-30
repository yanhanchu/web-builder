// ============================================================
// 資料管理核心 —— FieldType / ValueNode / DataSource / resolveValue
//
// 這個模組是「型別無關、框架無關」的資料層，跟 packages/ui 現有的
// component 生成流程（scripts/generate-docs.mjs、data/*.json）是純消費關係：
// 不會、也不需要修改生成流程本身，只是在它輸出的資料上疊一層可綁定的抽象。
//
// 設計背景見專案內討論紀錄，摘要如下：
// - i18n / 檔案 / 型別資料 / 路由，本質上都是「值的來源」，統一成 DataSource。
// - component props、頁面設定、全站設定，本質上都是「值 或 對某個 DataSource
//   的引用」，統一成 ValueNode，且遞迴結構跟 FieldType 同構。
// - 無法從 TS 型別字串判斷語意（一個 string 到底是不是 i18n 文案、是不是檔案路徑），
//   所以不在 FieldType 裡武斷分類，改用可替換的 BindingPolicy 決定候選綁定種類，
//   目前用「無法判定就全部開放」的寬鬆策略。
// - 型別 id 一律使用生成器提供的複合 id（`{filePath}#{TypeName}`），
//   對應 ComponentTypeDoc.id / ComponentDoc.id，避免不同檔案同名型別互相覆蓋
//   （這個專案的生成器已經採用這個格式，不需要額外轉換）。
// ============================================================

// ------------------------------------------------------------
// 1. FieldType —— 型別定義（遞迴）
// ------------------------------------------------------------

export type PrimitiveType = "string" | "number" | "boolean" | "date";

// hint 是弱線索（例如由欄位名稱/description 關鍵字推得），用來讓 BindingPolicy
// 排序或過濾候選，但不強制限制可綁定種類 —— 無法判定時就是全部開放。
export type FieldHint = "text" | "url-like" | "unknown";

export type FieldType =
  | { kind: "primitive"; type: PrimitiveType; hint?: FieldHint }
  | { kind: "ref"; typeId: string } // typeId 為生成器提供的複合 id，例如 "src/components/landing1/types.ts#BrandData"
  | { kind: "array"; item: FieldType }
  | { kind: "object"; fields: Record<string, FieldType> }
  | { kind: "slot" }; // ReactNode / children，不可綁定，交由「插入子組件」機制處理

// ------------------------------------------------------------
// 2. ValueNode —— 實際值（跟著 FieldType 同構遞迴）
// ------------------------------------------------------------

export type ValueNode = LiteralNode | BoundNode | ArrayNode | ObjectNode;

export interface LiteralNode {
  mode: "literal";
  value: string | number | boolean | null;
}

export interface BoundNode {
  mode: "bound";
  sourceId: string;
  path?: string[];
}

export interface ArrayNode {
  mode: "array";
  items: ValueNode[];
}

export interface ObjectNode {
  mode: "object";
  fields: Record<string, ValueNode>;
}

// ------------------------------------------------------------
// 3. DataSource —— 統一的資料來源節點
// ------------------------------------------------------------

export type DataSourceKind = "i18n" | "file" | "typedData" | "route";

export interface DataSourceMetaBase {
  id: string;
  kind: DataSourceKind;
  label?: string;
}

// i18n 是「基本型別的容器」，不只是文字：一筆 i18n 資料可以是 string/number/boolean，
// 不同 locale 各自存一份對應型別的值。
export type I18nPrimitiveValue = string | number | boolean;

export interface I18nDataSource extends DataSourceMetaBase {
  kind: "i18n";
  valueType: PrimitiveType;
  values: Record<string, I18nPrimitiveValue>; // locale -> value
}

export interface FileDataSource extends DataSourceMetaBase {
  kind: "file";
  url: string;
  mimeType?: string;
  /** 顯示用標題（例如圖片說明的第一行），跟 label 分開：label 是「管理介面」用的識別名稱，caption 是「內容」本身的一部分，之後可能被實際渲染到頁面上（例如圖片 alt / 圖說）。 */
  caption?: string;
  /** 較長的說明文字，例如圖片的詳細描述、檔案用途備註。 */
  description?: string;
  /** 檔案大小（bytes）。上傳成功時由 upload-client 自動填入；手動輸入 url 的情況允許留空。 */
  size?: number;
  /** 上傳日期時間（ISO 8601 字串）。上傳成功時自動填入；手動輸入 url 的情況允許留空，純資訊顯示、不可手動編輯。 */
  uploadedAt?: string;
  /**
   * 原始檔名（含副檔名），上傳成功時自動填入。之後每次重新同步到其他
   * 節點（例如補上新啟用的目的地、或手動點「全部同步」）都會沿用這個
   * 檔名，確保 S3 相容節點產生的 key 一律保留副檔名，不會因為改用
   * label／id 當檔名而遺失副檔名。手動輸入 url 的情況允許留空。
   */
  fileName?: string;
  /**
   * 圖片焦點 X 座標，0~1（0 = 最左，1 = 最右）。只對可預覽的圖片有意義，
   * 用來決定裁切／縮圖顯示時的 object-position，讓畫面重要主體不會在
   * 裁切後被切掉。不設定時預設置中（0.5）。
   */
  focusX?: number;
  /** 圖片焦點 Y 座標，0~1（0 = 最上，1 = 最下），意義同 focusX。 */
  focusY?: number;
  /**
   * 偏好的上傳目的地 id（對應上傳目的地設定裡的 UploadDest.id）。
   *
   * 一個檔案可以同時自動送到「每一個」已啟用的上傳目的地（見
   * upload-client.ts 的 uploadFileToAllEnabledDests），但 `url` 欄位
   * 只能存一個網址、也只有一個網址會被「之後使用這筆資料的地方」
   * （頁面渲染、匯出攤平資料…）實際引用。這個欄位就是用來決定「上傳／
   * 更新之後，`url` 該對齊哪一個目的地」：
   *   - 未設定（undefined）時，退回預設規則：本機優先、其次 S3、都沒有
   *     就用 OPFS 網址（見 uploadFileToAllEnabledDests 的 primary 說明）。
   *   - 設定了但那次上傳這個目的地失敗（或該目的地當下未啟用），一樣
   *     退回同一套預設規則，不會讓整筆上傳因此失敗。
   *   - 只有在「已啟用的目的地數量 > 1」時，管理介面才會顯示讓使用者
   *     選擇這個欄位的下拉選單（只有一個目的地時沒有選擇的意義，見
   *     fields/file-fields.tsx 的 PreferredDestSelect）。
   */
  preferredDestId?: string;
}

/**
 * A route can resolve to either an internal page (by its page id) or an
 * external/absolute URL. `target` decides which field is authoritative:
 * - "page"  → `pageId` references a page from Page management; `value` is
 *             derived from that page's route.
 * - "url"   → `value` holds an arbitrary URL string (external link, etc.)
 */
export type RouteTarget = "page" | "url";

export interface RouteDataSource extends DataSourceMetaBase {
  kind: "route";
  target: RouteTarget;
  /** When target is "page", the id of the page this route points to. */
  pageId?: string;
  /** The resolved path/URL. For "page" targets this mirrors the page's route; for "url" targets it is a free-form URL. */
  value: string;
  /** Whether to block search-engine indexing for this route (emits noindex). */
  noindex: boolean;
}

export interface TypedDataSource extends DataSourceMetaBase {
  kind: "typedData";
  // 對應某個具名 FieldType 的複合 id；若是陣列型資料（例如「一整組導覽連結」），
  // 慣例上用 "<refTypeId>[]" 表示，見 matchesRefType()。
  typeId: string;
  value: ValueNode; // 型別資料本身也是一棵遞迴值樹（可以內含 bound 到 i18n/file）
}

export type DataSource =
  I18nDataSource | FileDataSource | RouteDataSource | TypedDataSource;

// ------------------------------------------------------------
// 4. DataStore —— 查表介面
// ------------------------------------------------------------

export interface DataStore {
  getSource(id: string): DataSource | undefined;
  getTypeDef(typeId: string): FieldType | undefined;
  listSourcesByKind(kind: DataSourceKind): DataSource[];
}

export class InMemoryDataStore implements DataStore {
  private sources: Record<string, DataSource>;
  private types: Record<string, FieldType>;

  constructor(
    sources: Record<string, DataSource>,
    types: Record<string, FieldType>,
  ) {
    this.sources = sources;
    this.types = types;
  }

  getSource(id: string): DataSource | undefined {
    return this.sources[id];
  }

  getTypeDef(typeId: string): FieldType | undefined {
    return this.types[typeId];
  }

  listSourcesByKind(kind: DataSourceKind): DataSource[] {
    return Object.values(this.sources).filter((s) => s.kind === kind);
  }
}

// ------------------------------------------------------------
// 5. Resolver —— 照著 FieldType 走訪 ValueNode，解出最終純值
// ------------------------------------------------------------

export interface ResolveContext {
  locale: string;
  /**
   * 當前站台的預設語系。只有在解析 `kind: "route", target: "page"` 的綁定
   * 值時才用到：locale !== defaultLocale 時，會在 route path 前面加上
   * `/${locale}` 前綴（跟 resolve-route.ts resolveRoute() 對頁面本身路由
   * 套用的前綴規則一致，見該檔案 withLocalePrefix()）。
   *
   * 可選：省略時視同「不知道 defaultLocale」，route 值原樣輸出、不加前綴
   * （沿用改動前的行為）——避免這個欄位變成所有呼叫點的必填負擔，只有真的
   * 需要「route 值也要跟著 locale 走」的呼叫端（目前是 site-generator 產生
   * 頁面資料檔案那條路徑）才需要提供。
   */
  defaultLocale?: string;
}

export function resolveValue(
  type: FieldType,
  node: ValueNode,
  store: DataStore,
  ctx: ResolveContext,
): unknown {
  // 綁定節點：不論 type 是什麼，先解出 source 的根值，再依 path 挖下去
  if (node.mode === "bound") {
    const source = store.getSource(node.sourceId);
    if (!source) return `⚠️ unknown source: ${node.sourceId}`;

    let raw = resolveSourceRoot(source, store, ctx);

    if (node.path) {
      for (const key of node.path) {
        raw = (raw as any)?.[key];
      }
    }
    return raw;
  }

  if (node.mode === "literal") {
    return node.value;
  }

  if (type.kind === "ref") {
    const realType = store.getTypeDef(type.typeId);
    if (!realType) return `⚠️ unknown type: ${type.typeId}`;
    return resolveValue(realType, node, store, ctx);
  }

  if (node.mode === "array" && type.kind === "array") {
    return node.items.map((item) => resolveValue(type.item, item, store, ctx));
  }

  if (node.mode === "object" && type.kind === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(type.fields)) {
      const fieldType = type.fields[key];
      const fieldNode = node.fields[key];
      if (fieldNode) {
        result[key] = resolveValue(fieldType, fieldNode, store, ctx);
      }
    }
    return result;
  }

  return `⚠️ type/node mismatch: ${type.kind} vs ${node.mode}`;
}

// typedData source 的 typeId 遵循「一整組資料用 `<單筆複合id>[]` 表示」的慣例
// （見下面 fieldTypeForTypedDataTypeId／matchesRefType 的註解），但 typeRegistry
// （from-generated.ts 自動產生）只會註冊單筆型別本身的複合 id，從未額外註冊帶
// "[]" 後綴的陣列版本。之前這裡直接 store.getTypeDef(typeId) 查，對陣列型
// typedData 一律會落空（回傳 undefined -> "⚠️ unknown type" 警告字串），
// 讓依賴這個值的元件（例如 Header 的 primaryNav）在 .map() 時整個炸掉。
// 改用 fieldTypeForTypedDataTypeId 先把 typeId 轉成正確的 FieldType（陣列時
// 包成 { kind: "array", item: { kind: "ref", typeId } }），"ref" 的部分再交給
// resolveValue 本身的 type.kind === "ref" 分支去查 typeRegistry，不需要在這裡
// 提前解析、也不用重複一份轉換邏輯。
function resolveTypedDataTypeDef(store: DataStore, typeId: string): FieldType | undefined {
  const fieldType = fieldTypeForTypedDataTypeId(typeId);
  if (fieldType.kind === "ref" && !store.getTypeDef(fieldType.typeId)) return undefined;
  if (fieldType.kind === "array" && fieldType.item.kind === "ref" && !store.getTypeDef(fieldType.item.typeId)) {
    return undefined;
  }
  return fieldType;
}

/**
 * 把 route path 加上 locale 前綴（defaultLocale 不加前綴），跟
 * resolve-route.ts resolveRoute() 對頁面本身路由套用的規則一致：
 *   - "/" 根路徑 -> "/{locale}"
 *   - 其餘路徑 -> "/{locale}{path}"
 * 這裡不 import resolve-route.ts（那是 apps/site-generator 的內部模組，
 * packages/ui 不該反向依賴 app 層），規則本身很短，直接重寫一份；兩處各自
 * 維護但邏輯必須保持一致，改動時記得同步。
 */
function withLocalePrefix(routePath: string, locale: string): string {
  return routePath === "/" ? `/${locale}` : `/${locale}${routePath}`;
}

/**
 * 綁定到 `kind: "route"` 的值——只有 target === "page"（連到站內某個頁面，
 * 而不是外部 URL）且 ctx.defaultLocale 有提供、locale 不是 defaultLocale
 * 時，才在 value 前面加上 `/${locale}` 前綴（見 ResolveContext.defaultLocale
 * 的說明）。target === "url" 是使用者手動輸入的外部連結，不該被套用站內的
 * locale 路由規則，一律原樣輸出。
 */
function resolveRouteSourceValue(source: RouteDataSource, ctx: ResolveContext): string {
  if (source.target !== "page") return source.value;
  if (!ctx.defaultLocale || ctx.locale === ctx.defaultLocale) return source.value;
  return withLocalePrefix(source.value, ctx.locale);
}

function resolveSourceRoot(
  source: DataSource,
  store: DataStore,
  ctx: ResolveContext,
): unknown {
  switch (source.kind) {
    case "i18n": {
      const v = source.values[ctx.locale];
      return v !== undefined ? v : `⚠️ missing locale "${ctx.locale}"`;
    }
    case "file":
      return source.url;
    case "route":
      return resolveRouteSourceValue(source, ctx);
    case "typedData": {
      const typeDef = resolveTypedDataTypeDef(store, source.typeId);
      if (!typeDef) return `⚠️ unknown type: ${source.typeId}`;
      return resolveValue(typeDef, source.value, store, ctx);
    }
  }
}

// ------------------------------------------------------------
// 6. BindingPolicy —— 「這個欄位可以綁哪些種類的資料」的判斷機制
// ------------------------------------------------------------

export type BindableKind = "literal" | "i18n" | "file" | "route" | "typedData";

export interface BindingPolicy {
  /** 這個 FieldType 整體開放哪些「種類」的資料來源（粗篩，決定要不要去撈某個 kind 的清單）。 */
  getBindableKinds(type: FieldType): BindableKind[];
  /**
   * 細篩：同一種 kind 底下，這一筆具體的 DataSource 是否真的符合這個 FieldType。
   * 例如 i18n 來源各自有自己的 valueType（string/number/boolean/date），
   * number 的 prop 不該被允許綁到 valueType 是 string 的 i18n 詞條；
   * route / file 的值本質上一律是 string，不該出現在 number/boolean 的候選清單。
   * 這個判斷特意做成 policy 的一部分（而不是寫死在 getCandidateSources 或
   * FieldEditor 裡），之後要調整比對規則、或針對特定專案客製化，只要換一顆
   * policy 或覆寫這個方法即可，不用動共用元件本身。
   * 省略時預設一律通過（等同舊行為，只做 kind 層級的粗篩)，讓沒有實作這個
   * 方法的既有 policy 不會被這次擴充破壞。
   */
  matchesSource?(type: FieldType, source: DataSource): boolean;
}

// 預設策略：string/number/boolean 都開放給 i18n/file/route 綁定，但實際候選
// 清單會再依 matchesSource 依型別過濾（i18n 比對 valueType；route/file 只有
// string 適用），不是「無腦全部開放」。
export const permissiveBindingPolicy: BindingPolicy = {
  getBindableKinds(type) {
    if (type.kind === "slot") return [];
    if (type.kind === "primitive") {
      return ["literal", "i18n", "file", "route"];
    }
    if (
      type.kind === "ref" ||
      type.kind === "object" ||
      type.kind === "array"
    ) {
      return ["literal", "typedData"];
    }
    return ["literal"];
  },

  matchesSource(type, source) {
    if (source.kind === "typedData") return matchesRefType(type, source.typeId);

    // 以下三種（i18n / file / route）都只對 primitive 欄位有意義（object/array/ref
    // 走的是 typedData，上面已經先擋掉），這裡再依實際型別比對：
    if (type.kind !== "primitive") return false;

    if (source.kind === "i18n") {
      // i18n 詞條本身宣告了 valueType，直接比對，避免 number 欄位被塞進一句
      // 文案、或 boolean 欄位被綁到一個數字詞條。
      return source.valueType === type.type;
    }

    // route.value 與 file.url 都固定是 string，只有 string 欄位適用。
    if (source.kind === "route" || source.kind === "file") {
      return type.type === "string";
    }

    return false;
  },
};

// 依 FieldType 找出符合的候選 DataSource 清單，供編輯器的 binding picker 使用。
// 先用 getBindableKinds 決定要撈哪幾種 kind（粗篩），再用 matchesSource 逐筆
// 過濾（細篩，型別是否真的相容）—— 型別判斷完全交給傳入的 policy，這裡
// 本身不寫死任何比對規則。
export function getCandidateSources(
  type: FieldType,
  store: DataStore,
  policy: BindingPolicy = permissiveBindingPolicy,
): DataSource[] {
  const kinds = policy.getBindableKinds(type);
  const matches = (source: DataSource) => policy.matchesSource?.(type, source) ?? true;

  const result: DataSource[] = [];
  if (kinds.includes("i18n")) result.push(...store.listSourcesByKind("i18n").filter(matches));
  if (kinds.includes("file")) result.push(...store.listSourcesByKind("file").filter(matches));
  if (kinds.includes("route")) result.push(...store.listSourcesByKind("route").filter(matches));
  if (kinds.includes("typedData")) {
    result.push(...store.listSourcesByKind("typedData").filter(matches));
  }
  return result;
}

// 判斷一筆 typedData 的 typeId 是否符合欄位型別要求
// - ref 型別：typeId 要完全相同（複合 id 精準比對，不會撞名）
// - array<ref> 型別：typedData 是「一組」該型別的具名資料，typeId 約定為 "<refTypeId>[]"
// - object（內聯匿名型別，如 wordmark）：暫不精準過濾，交給使用者自行判斷
function matchesRefType(type: FieldType, sourceTypeId: string): boolean {
  if (type.kind === "ref") {
    return sourceTypeId === type.typeId;
  }
  if (type.kind === "array" && type.item.kind === "ref") {
    return sourceTypeId === `${type.item.typeId}[]`;
  }
  if (type.kind === "object") {
    return true;
  }
  return false;
}

// ------------------------------------------------------------
// 7. 小工具：不可變地更新 ValueNode 樹上某個路徑的節點
// ------------------------------------------------------------

export function updateNodeAtPath(
  root: ValueNode,
  path: (string | number)[],
  updater: (node: ValueNode) => ValueNode,
): ValueNode {
  if (path.length === 0) {
    return updater(root);
  }

  const [head, ...rest] = path;

  if (root.mode === "object" && typeof head === "string") {
    const child = root.fields[head];
    if (!child) return root;
    return {
      ...root,
      fields: {
        ...root.fields,
        [head]: updateNodeAtPath(child, rest, updater),
      },
    };
  }

  if (root.mode === "array" && typeof head === "number") {
    const child = root.items[head];
    if (!child) return root;
    const items = [...root.items];
    items[head] = updateNodeAtPath(child, rest, updater);
    return { ...root, items };
  }

  return root;
}

// ------------------------------------------------------------
// 8. 依 FieldType 建立「預設 ValueNode 樹」
//
// 供資料管理介面使用：新增一筆型別資料、或在編輯器裡把某格從綁定切回純值 /
// 在陣列新增項目時，用來產生一棵結構正確的初始值樹。
// - ref：先解析成實際型別再遞迴（解析不到就退化成空字串）
// - object：每個欄位遞迴建立預設值（巢狀 object 也會正確展開）
// - array：預設空陣列
// - primitive：number→0、boolean→false、其餘（string/date）→空字串
// - slot：不參與綁定，給一個空 literal 佔位
// ------------------------------------------------------------

export function createDefaultValueNode(
  type: FieldType,
  store: DataStore,
): ValueNode {
  if (type.kind === "ref") {
    const real = store.getTypeDef(type.typeId);
    if (!real) return { mode: "literal", value: "" };
    return createDefaultValueNode(real, store);
  }
  if (type.kind === "primitive") {
    if (type.type === "number") return { mode: "literal", value: 0 };
    if (type.type === "boolean") return { mode: "literal", value: false };
    return { mode: "literal", value: "" };
  }
  if (type.kind === "array") {
    return { mode: "array", items: [] };
  }
  if (type.kind === "object") {
    const fields: Record<string, ValueNode> = {};
    for (const key of Object.keys(type.fields)) {
      fields[key] = createDefaultValueNode(type.fields[key], store);
    }
    return { mode: "object", fields };
  }
  // slot
  return { mode: "literal", value: "" };
}

// 把 typedData 的 typeId 還原成 FieldType。
// typeId 慣例：單筆是複合 id（"…#BrandData"），一整組是 "<複合 id>[]"（見 matchesRefType）。
export function fieldTypeForTypedDataTypeId(typeId: string): FieldType {
  if (typeId.endsWith("[]")) {
    return { kind: "array", item: { kind: "ref", typeId: typeId.slice(0, -2) } };
  }
  return { kind: "ref", typeId };
}