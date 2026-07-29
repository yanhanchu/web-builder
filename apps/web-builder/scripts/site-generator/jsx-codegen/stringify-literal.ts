// ============================================================
// stringify-literal —— 把 resolveValue() 解出來的「純值」pretty-print 成
// 合法的 JS 表達式原始碼字串，供 JSX attribute（`prop={<這裡>}`）使用。
//
// 不能直接用 JSON.stringify：
//   - JSX/JS 物件 literal 的 key 不需要加引號（除非含特殊字元）
//   - 字串慣例用雙引號，跟專案其他手寫程式碼風格一致
//   - undefined 在 JSON 裡不存在，但 JS 表達式裡是合法值
//
// 這裡刻意跟 JSON 語法規則分開維護（不是「JSON.stringify 再後處理」），
// 因為兩者的合法語法集合本來就不同，後處理容易漏掉邊界情況（例如巢狀字串
// 裡剛好出現看起來像 JSON key 的片段）。
// ============================================================

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** 字串 literal：雙引號包裹，跳脫雙引號、反斜線、以及會截斷 JSX/JS 的控制字元。 */
function stringifyString(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `"${escaped}"`;
}

/** object literal 的 key：合法 identifier 就不加引號，否則用字串 key。 */
function stringifyKey(key: string): string {
  return IDENTIFIER_RE.test(key) ? key : stringifyString(key);
}

/**
 * 把任意純值（resolveValue 的輸出：string/number/boolean/null/undefined/
 * 陣列/巢狀 object）轉成一段合法的 JS 表達式原始碼。
 *
 * indent 是目前這個值所在的縮排層級（每層 2 個空白），只有 object/array
 * 內容較多時才會真的換行；純量值與空陣列/空物件維持單行，避免不必要的
 * 縮排雜訊。
 */
export function stringifyLiteralValue(value: unknown, indent = 0): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return stringifyString(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const pad = "  ".repeat(indent + 1);
    const closePad = "  ".repeat(indent);
    const items = value.map((item) => `${pad}${stringifyLiteralValue(item, indent + 1)}`);
    return `[\n${items.join(",\n")},\n${closePad}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const pad = "  ".repeat(indent + 1);
    const closePad = "  ".repeat(indent);
    const lines = entries.map(
      ([key, v]) => `${pad}${stringifyKey(key)}: ${stringifyLiteralValue(v, indent + 1)}`,
    );
    return `{\n${lines.join(",\n")},\n${closePad}}`;
  }

  // 理論上不會走到這裡（resolveValue 的輸出型別已窮舉），保底避免整個產生器中斷。
  return JSON.stringify(value);
}

/**
 * 把一個純值決定要用哪種 JSX attribute 語法包起來：
 *   - 字串 -> `prop="值"`（純字串常數，跟一般手寫 JSX 慣例一致，不用 `{"..."}`）
 *   - 其餘（number/boolean/null/undefined/array/object）-> `prop={<表達式>}`
 *
 * 回傳的是「值本身」的原始碼片段（不含 prop 名稱），呼叫端負責組
 * `${name}=${valueSource}` 或 `${name}={${valueSource}}`。
 */
export function stringifyJsxAttrValue(value: unknown, indent = 0): { needsBraces: boolean; source: string } {
  if (typeof value === "string") {
    // 字串裡如果含雙引號，走 {"..."} 語法比較安全（避免跟 attribute 外層引號衝突）。
    if (!value.includes('"')) {
      return { needsBraces: false, source: value };
    }
  }
  return { needsBraces: true, source: stringifyLiteralValue(value, indent) };
}
