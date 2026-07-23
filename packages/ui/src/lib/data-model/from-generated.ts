// ============================================================
// 生成資料 → FieldType 的轉換層
//
// 讀取 scripts/generate-docs.mjs 產生的 data/components.json /
// data/component-types.json，轉換成 data-model 可用的 FieldType /
// component props registry。生成流程本身完全不動，這裡只消費它的輸出。
//
// 這個專案的生成器已經直接輸出複合 id（`{filePath}#{TypeName}` /
// `{filePath}#{componentName}`），對應到 ComponentDoc.id /
// ComponentTypeDoc.id，因此這裡不需要另外組 id，直接沿用。
// ============================================================

import type { FieldType } from './schema';
import type { ComponentDoc } from '@workspace/ui/types/generator/component-types';
import rawComponents from '../../../data/components.json';
import rawTypes from '../../../data/component-types.json';

// component-types.json 的形狀跟 ComponentTypeDoc 略有出入（多了可選的 aliasOf，
// 且並非全部檔案都會有 fields），這裡用寬鬆一點的本地介面描述，避免因型別檔案
// 之後演進而卡住轉換層。
interface RawTypeField {
  name: string;
  required: boolean;
  type: string;
  description: string;
}

interface RawTypeDef {
  id: string; // 複合 id，例如 "src/components/landing1/types.ts#BrandData"
  name: string;
  kind: 'interface' | 'type';
  description: string;
  fields: RawTypeField[];
  aliasOf?: string; // 非 object 的 type alias（union / primitive），暫以 string 處理
}

const components = rawComponents as ComponentDoc[];
const typeDefs = (rawTypes as { types: RawTypeDef[] }).types;

// ------------------------------------------------------------
// 型別名稱 -> 複合 id 對照表
//
// components.json 的 props[].type 欄位是裸型別名稱字串（例如 "BrandData"），
// 不是複合 id；component-types.json 的每一筆已經是複合 id
// （例如 "src/components/landing1/types.ts#BrandData"）。這裡建一個查表，
// 讓 parseTypeString 能把裸名稱轉成正確的複合 id。
//
// 注意：如果專案結構演變成「同一個型別名稱、在不同檔案各自宣告」，
// 這個查表會因為 Map key 覆蓋而只留下最後一筆。此時代表 relatedTypeNames
// 應該直接提供複合 id 陣列（目前生成資料剛好就是這樣），下一步可以直接改用
// component.relatedTypeNames 做逐一解析，而不是這個全域名稱表 —— 這裡先用
// 全域表是因為它對目前資料集是正確的，且實作最簡單。
// ------------------------------------------------------------

const typeNameToId = new Map<string, string>();
for (const t of typeDefs) {
  typeNameToId.set(t.name, t.id);
}

// ------------------------------------------------------------
// TS 型別字串 -> FieldType
// ------------------------------------------------------------

const REACT_NODE_TYPES = new Set(['ReactNode', 'React.ReactNode', 'JSX.Element']);

function parseTypeString(typeStr: string): FieldType {
  const trimmed = typeStr.trim();

  // ReactNode / children / icon 這類 -> 插槽，不參與綁定
  if (REACT_NODE_TYPES.has(trimmed)) {
    return { kind: 'slot' };
  }

  // 陣列，例如 "NavItem[]" / "string[]"
  if (trimmed.endsWith('[]')) {
    const itemType = parseTypeString(trimmed.slice(0, -2));
    return { kind: 'array', item: itemType };
  }

  // union literal，例如 "\"sm\" | \"md\" | \"lg\"" -> 視為 string primitive
  // （簡化處理，不特別記錄 enum 選項；要做下拉選單限制時可以再擴充 FieldType 加 enum）
  if (trimmed.includes('|') && trimmed.includes('"')) {
    return { kind: 'primitive', type: 'string' };
  }

  // 基本型別
  if (trimmed === 'string') return { kind: 'primitive', type: 'string' };
  if (trimmed === 'number') return { kind: 'primitive', type: 'number' };
  if (trimmed === 'boolean') return { kind: 'primitive', type: 'boolean' };

  // 具名型別參照，例如 "BrandData" / "HeaderProps" -> 查表拿生成器給的複合 id
  const typeId = typeNameToId.get(trimmed);
  if (typeId) {
    return { kind: 'ref', typeId };
  }

  // 內聯的匿名 object，例如 "{ lead: string; accent: string; }"
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return parseInlineObject(trimmed);
  }

  // 無法辨識的型別，暫時當成不可綁定的純字串，避免整個轉換中斷
  return { kind: 'primitive', type: 'string' };
}

// 簡化的內聯 object 解析，處理 "{ a: string; b: number; }" 這種扁平形式，
// 足以支援目前的 BrandData.wordmark / Hero.title / Hero.primaryCta 等案例。
// 更複雜的巢狀內聯 object 建議在 component 原始碼那邊直接抽成具名 interface。
function parseInlineObject(inline: string): FieldType {
  const body = inline.slice(1, -1).trim();
  const fields: Record<string, FieldType> = {};
  const parts = body.split(';').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const rawName = part.slice(0, idx).trim();
    const fieldType = part.slice(idx + 1).trim();
    const name = rawName.replace(/\?$/, ''); // 忽略 optional 標記，簡化處理
    fields[name] = parseTypeString(fieldType);
  }
  return { kind: 'object', fields };
}

// ------------------------------------------------------------
// 組出完整的 type registry：複合 id -> FieldType
// ------------------------------------------------------------

export const typeRegistry: Record<string, FieldType> = {};

for (const t of typeDefs) {
  if (t.aliasOf) {
    // 非 object 的 type alias（union / primitive 別名），暫時視為 string primitive；
    // 之後若要精確處理 union，可以在這裡解析 t.aliasOf 補上 enum。
    typeRegistry[t.id] = { kind: 'primitive', type: 'string' };
    continue;
  }
  const fields: Record<string, FieldType> = {};
  for (const f of t.fields) {
    fields[f.name] = parseTypeString(f.type);
  }
  typeRegistry[t.id] = { kind: 'object', fields };
}

// ------------------------------------------------------------
// 組出每個 component 的 props FieldType（用 component 複合 id 當 key）
// ------------------------------------------------------------

export const componentPropsRegistry: Record<
  string,
  { component: ComponentDoc; propsType: FieldType }
> = {};

for (const c of components) {
  const fields: Record<string, FieldType> = {};
  for (const p of c.props) {
    fields[p.name] = parseTypeString(p.type);
  }
  componentPropsRegistry[c.id] = {
    component: c,
    propsType: { kind: 'object', fields },
  };
}

export { components as rawComponentList };
