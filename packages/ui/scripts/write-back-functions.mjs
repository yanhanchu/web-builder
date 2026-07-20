/**
 * 用 ts-morph 把 UI 上編輯過的「函式說明 (JSDoc description)」寫回對應的 .ts 原始檔。
 *
 * 跟 write-back.mjs（組件 props）是同一套設計，但目標節點不同：
 *  - write-back.mjs 改的是 interface/type 裡某個 PropertySignature 的 JSDoc
 *  - 這裡改的是「函式本身」的 JSDoc description（第一段說明文字），
 *    不動 @param / @returns / @throws / @deprecated 等其他 tag —— 這些 tag 在
 *    重寫 JSDoc 時會被原樣保留，只替換最前面的 description 區塊。
 *
 * 支援兩種函式寫法（跟 generate-functions-docs.mjs 解析時一致）：
 *  - export function foo() {}         → JSDoc 掛在 FunctionDeclaration 上
 *  - export const foo = (...) => {}   → JSDoc 掛在 VariableStatement 上
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
 * 找出這個檔案裡指定名稱的函式宣告，回傳「JSDoc 應該掛載的節點」（jsDocOwner）。
 * 跟 generate-functions-docs.mjs 的 extractFunctionsFromFile 找法保持一致：
 *  - function 宣告：JSDoc 掛在 FunctionDeclaration 本身
 *  - export const foo = (...) => {} ：JSDoc 掛在 VariableStatement（不是掛在 ArrowFunction 上）
 */
function findJsDocOwner(sourceFile, functionName) {
  const fn = sourceFile.getFunction(functionName);
  if (fn && fn.isExported()) {
    return fn;
  }

  for (const varStatement of sourceFile.getVariableStatements()) {
    if (!varStatement.isExported()) continue;
    for (const decl of varStatement.getDeclarations()) {
      if (decl.getName() !== functionName) continue;
      const initializer = decl.getInitializer();
      if (!initializer) continue;
      const isArrow = initializer.getKind() === SyntaxKind.ArrowFunction;
      const isFnExpr = initializer.getKind() === SyntaxKind.FunctionExpression;
      if (isArrow || isFnExpr) {
        return varStatement;
      }
    }
  }

  return undefined;
}

/**
 * 重寫一個節點的 JSDoc description，同時保留原本所有的 @tag（@param/@returns/@throws/@deprecated...）。
 *
 * ts-morph 對 JSDoc 的操作要整段替換：
 *  1. 把每個既有 tag 的原始文字記下來（tag.getText()，含 @tagName 與其註解）
 *  2. 移除整段舊 JsDoc
 *  3. 若新 description 或任何 tag 存在，用 addJsDoc 重新組一段新的
 *
 * 若新 description 為空字串，且完全沒有 tag，則不留下任何 JSDoc（避免殘留空的 /** *\/）。
 */
function setFunctionJsDocDescription(node, newDescription) {
  const existingDocs = node.getJsDocs();
  const existingTagTexts = existingDocs.flatMap((doc) =>
    doc.getTags().map((tag) => cleanTagText(tag.getText()))
  );

  for (const doc of existingDocs) {
    doc.remove();
  }

  const trimmed = newDescription?.trim() ?? '';

  if (!trimmed && existingTagTexts.length === 0) {
    return; // 完全沒有說明也沒有 tag，不需要留 JSDoc
  }

  const bodyLines = trimmed ? trimmed.split('\n') : [];
  const description = [...bodyLines, ...existingTagTexts].join('\n');

  node.addJsDoc({ description });
}

/**
 * `tag.getText()` 回傳的是這個 tag 在原始碼裡「從 @tagName 開始，到下一個 tag 或註解結尾為止」
 * 的原始文字，可能帶有換行與延續行殘留的 `*` 前綴（例如原始 JSDoc 裡以 `* *` 分隔段落的寫法），
 * 這裡逐行清掉這些殘留符號，並移除尾端的空白行，避免重寫後產生 `*  *` 這種雜訊行。
 */
function cleanTagText(rawText) {
  const lines = rawText.split('\n').map((line, i) => {
    if (i === 0) return line; // 第一行是 "@tagName ..."，不用處理前綴
    // 移除該行開頭殘留的 JSDoc 星號前綴（例如 " * " 或單獨的 "*"）
    return line.replace(/^\s*\*\s?/, '');
  });

  // 去掉尾端因為原始 tag 之間換行殘留下來的空白行
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  return lines.join('\n');
}

/**
 * 主要對外 API：把單一函式的 description 寫回 .ts。
 *
 * @param {object} params
 * @param {string} params.filePath      相對於專案根目錄的檔案路徑，例如 'src/functions/calculateOrderTotal.ts'
 * @param {string} params.functionName  例如 'calculateOrderTotal'
 * @param {string} params.description   新的 JSDoc 說明文字；空字串代表清空（但保留既有的 @param 等 tag）
 * @returns {{ ok: true, changedFile: string } | { ok: false, error: string }}
 */
export function updateFunctionDescription({ filePath, functionName, description }) {
  try {
    const project = new Project({ tsConfigFilePath: TSCONFIG_PATH });
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
    const sourceFile = project.addSourceFileAtPath(absPath);

    const jsDocOwner = findJsDocOwner(sourceFile, functionName);

    if (!jsDocOwner) {
      return {
        ok: false,
        error: `在 ${filePath} 找不到具名匯出的函式 ${functionName}`,
      };
    }

    setFunctionJsDocDescription(jsDocOwner, description ?? '');

    sourceFile.saveSync();

    return { ok: true, changedFile: filePath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
