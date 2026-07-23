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
}

export interface RouteDataSource extends DataSourceMetaBase {
  kind: "route";
  value: string;
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
      return source.value;
    case "typedData": {
      const typeDef = store.getTypeDef(source.typeId);
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
  getBindableKinds(type: FieldType): BindableKind[];
}

// 預設策略：不做語意猜測，string/number/boolean 全部開放給 i18n/file/route 綁定。
// 之後若要精細化（例如靠欄位名稱關鍵字、或人工標註判斷「這格是不是 i18n」），
// 只要替換這個 policy，FieldType 定義、編輯器 UI、resolver 完全不用動。
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
};

// 依 FieldType 找出符合的候選 DataSource 清單，供編輯器的 binding picker 使用
export function getCandidateSources(
  type: FieldType,
  store: DataStore,
  policy: BindingPolicy = permissiveBindingPolicy,
): DataSource[] {
  const kinds = policy.getBindableKinds(type);
  const result: DataSource[] = [];

  if (kinds.includes("i18n")) result.push(...store.listSourcesByKind("i18n"));
  if (kinds.includes("file")) result.push(...store.listSourcesByKind("file"));
  if (kinds.includes("route")) result.push(...store.listSourcesByKind("route"));
  if (kinds.includes("typedData")) {
    result.push(
      ...store
        .listSourcesByKind("typedData")
        .filter(
          (s) => s.kind === "typedData" && matchesRefType(type, s.typeId),
        ),
    );
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
