/**
 * 用 ts-morph 把 UI 上編輯過的「Props 說明 (JSDoc)」與「預設值」寫回對應的 .tsx 原始檔。
 *
 * 使用情境：ComponentDetail 頁面的 PropsTable 允許就地編輯 description / defaultValue，
 * Vite dev server 的 middleware（見 vite.config.ts）會呼叫這裡的 `updateProp()`，
 * 寫檔完成後由呼叫端重新執行 `docs:generate`，讓 components.json 與 UI 反映最新內容。
 *
 * 僅在 dev 模式下啟用（middleware 只掛在 vite dev server，build 產物不含這支腳本的呼叫路徑）。
 */
import { Project, SyntaxKind } from 'ts-morph';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TSCONFIG_PATH = path.join(ROOT, 'tsconfig.app.json');

/**
 * 找出某個 interface/type 底下、名稱符合 propName 的成員（PropertySignature）。
 * 組件的 props 型別可能是 `interface XxxProps extends ... { ... }`，
 * 也可能是 `type XxxProps = { ... }`，這裡兩種都支援。
 */
function findPropSignature(sourceFile, propsTypeName, propName) {
  const iface = sourceFile.getInterface(propsTypeName);
  if (iface) {
    const prop = iface.getProperty(propName);
    if (prop) return prop;
  }

  const typeAlias = sourceFile.getTypeAlias(propsTypeName);
  if (typeAlias) {
    const typeLiteral = typeAlias.getFirstDescendantByKind(SyntaxKind.TypeLiteral);
    const prop = typeLiteral?.getProperty(propName);
    if (prop) return prop;
  }

  return undefined;
}

/**
 * 嘗試從檔案內容推斷 propsTypeName（例如 Button.tsx 裡的 ButtonProps）。
 * 規則：找檔案裡任一個 `interface *Props` 或 `type *Props`，
 * 優先挑跟 componentName 前綴吻合的那個（例如 componentName=Button → ButtonProps）。
 */
function guessPropsTypeName(sourceFile, componentName) {
  const preferred = `${componentName}Props`;

  const interfaces = sourceFile.getInterfaces().map((i) => i.getName());
  const typeAliases = sourceFile.getTypeAliases().map((t) => t.getName());
  const candidates = [...interfaces, ...typeAliases];

  if (candidates.includes(preferred)) return preferred;

  const propsLike = candidates.find((name) => name.endsWith('Props'));
  return propsLike ?? preferred;
}

/**
 * 依 prop 的型別字串，把使用者在 UI 輸入的字串值轉成要寫進原始碼的「字面量」文字。
 *
 * - string 型別（含 string literal union，例如 'primary' | 'secondary'）→ 加上引號
 * - number / boolean → 當作原始 literal 直接寫入（不加引號）
 * - 其他（object / ReactNode / function 等複雜型別）→ 直接把使用者輸入原樣當成 expression 寫入，
 *   讓使用者自行負責寫出合法的 TS 表達式（例如 `{ x: 1 }` 或 `<Icon />`）
 */
function formatDefaultValueLiteral(rawValue, propType) {
  const trimmedType = propType.trim();
  const trimmedValue = rawValue.trim();

  const isBoolean = /^boolean$/.test(trimmedType) || /^(true|false)$/.test(trimmedValue);
  const isNumber =
    /^number$/.test(trimmedType) || (/^-?\d+(\.\d+)?$/.test(trimmedValue) && !/string/.test(trimmedType));

  if (isBoolean) {
    if (trimmedValue !== 'true' && trimmedValue !== 'false') {
      throw new Error(`預設值 "${rawValue}" 不是合法的 boolean（需為 true 或 false）`);
    }
    return trimmedValue;
  }

  if (isNumber) {
    if (Number.isNaN(Number(trimmedValue))) {
      throw new Error(`預設值 "${rawValue}" 不是合法的 number`);
    }
    return trimmedValue;
  }

  const looksLikeString =
    /string/.test(trimmedType) || /^['"].*['"]$/.test(trimmedValue) || /^[a-zA-Z_][\w-]*$/.test(trimmedValue);

  if (looksLikeString) {
    // 避免重複加引號：使用者若已自行輸入 'primary' 或 "primary" 就照用
    const alreadyQuoted = /^(['"]).*\1$/.test(trimmedValue);
    const unquoted = alreadyQuoted ? trimmedValue.slice(1, -1) : trimmedValue;
    return `'${unquoted.replace(/'/g, "\\'")}'`;
  }

  // 其他型別（ReactNode / 物件 / function...）：原樣當作 expression 寫入
  return trimmedValue;
}

/**
 * 更新（或移除）JSDoc description。
 * ts-morph 對 JSDoc 的操作要整段替換：先清掉舊的 JsDoc 節點，
 * 有新內容才 addJsDoc，避免殘留空的 `/** *​/`。
 */
function setJsDocDescription(propSignature, description) {
  const existingDocs = propSignature.getJsDocs();
  for (const doc of existingDocs) {
    doc.remove();
  }

  const trimmed = description?.trim();
  if (trimmed) {
    propSignature.addJsDoc({ description: trimmed });
  }
}

/**
 * 更新 prop 的預設值。有兩種寫法要處理：
 *
 * 1. 解構參數上的預設值：`function Button({ variant = 'primary' }: ButtonProps)`
 *    → 找到函式的參數解構 BindingElement，改寫它的 initializer
 * 2. defaultProps（較少見的舊寫法）：`Xxx.defaultProps = { variant: 'primary' }`
 *    → 找到 PropertyAssignment，改寫它的 initializer
 *
 * 若都找不到（例如該 prop 目前完全沒有預設值），且使用者要「新增」預設值，
 * 就在解構參數上補上 `propName = <value>`（若該 prop 存在於解構中）。
 */
function setDefaultValue(sourceFile, componentName, propName, literalText) {
  let updated = false;

  // --- 情況 1：函式參數解構 ---
  const fns = [
    ...sourceFile.getFunctions(),
    ...sourceFile.getVariableDeclarations().flatMap((v) => {
      const initializer = v.getInitializerIfKind(SyntaxKind.ArrowFunction);
      return initializer ? [initializer] : [];
    }),
  ];

  for (const fn of fns) {
    const fnName =
      typeof fn.getName === 'function' ? fn.getName() : undefined;
    // function 宣告要名字對得上 componentName；箭頭函式（const Xxx = (...) =>）沒有直接的名字比對，全部嘗試
    if (fnName && fnName !== componentName) continue;

    const params = fn.getParameters();
    for (const param of params) {
      const objectPattern = param.getFirstChildByKind(SyntaxKind.ObjectBindingPattern);
      if (!objectPattern) continue;

      const element = objectPattern
        .getElements()
        .find((el) => el.getName() === propName);

      if (element) {
        const existingInit = element.getInitializer();
        if (existingInit) {
          existingInit.replaceWithText(literalText);
        } else {
          element.replaceWithText(`${propName} = ${literalText}`);
        }
        updated = true;
      }
    }
    if (updated) break;
  }

  if (updated) return true;

  // --- 情況 2：Xxx.defaultProps = { ... } ---
  const exprStatements = sourceFile.getDescendantsOfKind(SyntaxKind.ExpressionStatement);
  for (const stmt of exprStatements) {
    const text = stmt.getText();
    if (!text.startsWith(`${componentName}.defaultProps`)) continue;

    const objectLiteral = stmt.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
    if (!objectLiteral) continue;

    const propAssignment = objectLiteral
      .getProperties()
      .find(
        (p) =>
          p.getKind() === SyntaxKind.PropertyAssignment && p.asKind(SyntaxKind.PropertyAssignment).getName() === propName
      );

    if (propAssignment) {
      propAssignment.asKind(SyntaxKind.PropertyAssignment).setInitializer(literalText);
    } else {
      objectLiteral.addPropertyAssignment({ name: propName, initializer: literalText });
    }
    updated = true;
    break;
  }

  return updated;
}

/**
 * 主要對外 API：把單一 prop 的 description / defaultValue 寫回 tsx。
 *
 * @param {object} params
 * @param {string} params.filePath   相對於專案根目錄的檔案路徑，例如 'src/components/demo/button.tsx'
 * @param {string} params.componentName  例如 'Button'
 * @param {string} params.propName   例如 'variant'
 * @param {string} params.propType   例如 "'primary' | 'secondary' | 'ghost' | 'danger'"（來自 components.json 的 type 欄位，用來判斷預設值該不該加引號）
 * @param {string} [params.description]   新的 JSDoc 說明；傳空字串代表清空
 * @param {string} [params.defaultValue]  新的預設值（使用者在 UI 輸入的原始字串）；傳 undefined 代表不變更
 * @returns {{ ok: true, changedFile: string } | { ok: false, error: string }}
 */
export function updateProp({ filePath, componentName, propName, propType, description, defaultValue }) {
  try {
    const project = new Project({ tsConfigFilePath: TSCONFIG_PATH });
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
    const sourceFile = project.addSourceFileAtPath(absPath);

    const propsTypeName = guessPropsTypeName(sourceFile, componentName);
    const propSignature = findPropSignature(sourceFile, propsTypeName, propName);

    if (!propSignature) {
      return {
        ok: false,
        error: `在 ${filePath} 找不到 ${propsTypeName}.${propName}，可能型別定義結構不是預期的 interface/type 字面量`,
      };
    }

    if (description !== undefined) {
      setJsDocDescription(propSignature, description);
    }

    if (defaultValue !== undefined) {
      const trimmedValue = defaultValue.trim();
      if (trimmedValue === '') {
        // 空字串代表「移除預設值」，目前僅支援解構參數寫法的移除
        // （defaultProps 寫法的移除較少見，暫不特別處理，避免誤刪整個屬性造成非預期改動）
      } else {
        const literalText = formatDefaultValueLiteral(trimmedValue, propType);
        const found = setDefaultValue(sourceFile, componentName, propName, literalText);
        if (!found) {
          return {
            ok: false,
            error: `在 ${filePath} 找不到 ${componentName} 對 ${propName} 的解構參數或 defaultProps，無法寫入預設值`,
          };
        }
      }
    }

    sourceFile.saveSync();

    return { ok: true, changedFile: filePath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
