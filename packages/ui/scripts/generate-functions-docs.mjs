/**
 * 批次解析 src/functions/**\/*.ts，
 * 使用 ts-morph 讀取 TypeScript AST，抽取「純函式」的完整簽章與說明：
 *  - 函式本身的 JSDoc（描述 / @param / @returns / @throws / @deprecated）
 *  - 參數清單（名稱、型別、是否 optional、預設值、對應的 @param 說明）
 *  - 回傳型別
 *  - 函式簽章中用到的 interface / type alias（遞迴展開一層欄位，含各欄位 JSDoc）
 *
 * 跟 scripts/generate-docs.mjs（組件文件）是同一套設計哲學，但解析器不同：
 *  - 組件文件解析的是 React props（react-docgen-typescript 專門處理這塊）
 *  - 函式文件解析的是「一般函式的參數 / 回傳型別」，這不是 react-docgen-typescript
 *    的守備範圍，所以改用 ts-morph 直接操作 TypeScript Compiler API。
 *
 * 輸出：
 *  - data/functions.json        給靜態頁面生成 / 文件 UI 用
 *  - src/types/generator/function-types.ts  FunctionDoc / ParamDoc / TypeDoc 的型別定義（供其他程式 import）
 *
 * 用法：
 *   node scripts/generate-functions-docs.mjs
 */
import { Project, SyntaxKind, ts } from 'ts-morph';
import { globSync } from 'glob';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TSCONFIG_PATH = path.join(ROOT, 'tsconfig.app.json');
const FUNCTIONS_GLOB = 'src/functions/**/*.ts';
const OUTPUT_JSON = path.join(ROOT, 'data', 'functions.json');
const OUTPUT_TYPES = path.join(ROOT, 'src', 'types', 'generator', 'function-types.ts');

/** 型別字串裁短，避免超長的 union / 泛型把表格撐爆（跟 generate-docs.mjs 的 truncateType 邏輯一致） */
function truncateType(type, max = 200) {
  if (!type) return 'unknown';
  const oneLine = type.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 1) + '…';
}

function toSlug(str) {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * 從 JSDoc 節點抽出結構化資訊：
 *  - description：JSDoc 主體說明（去除 @tag 區塊）
 *  - params：Map<paramName, description>，來自 @param
 *  - returns：@returns / @return 的說明文字
 *  - throws：@throws / @exception 的說明文字陣列（一個函式可能有多段 @throws）
 *  - deprecated：@deprecated 說明文字（若存在）
 */
function parseJsDoc(jsDocs) {
  const result = {
    description: '',
    params: new Map(),
    returns: '',
    throws: [],
    deprecated: null,
  };

  if (!jsDocs || jsDocs.length === 0) return result;

  // 一個宣告理論上只會有一段連續的 JSDoc 註解，但保險起見全部串接
  const descriptions = [];

  for (const doc of jsDocs) {
    const description = doc.getDescription().trim();
    if (description) descriptions.push(description);

    for (const tag of doc.getTags()) {
      const tagName = tag.getTagName();
      const tagComment = getTagCommentText(tag);

      if (tagName === 'param') {
        // ts-morph 的 JSDocParameterTag 有 getName()
        const paramName =
          typeof tag.getName === 'function' ? tag.getName() : extractParamNameFromComment(tagComment);
        if (paramName) {
          result.params.set(paramName, tagComment.replace(new RegExp(`^${paramName}\\s*-?\\s*`), '').trim());
        }
      } else if (tagName === 'returns' || tagName === 'return') {
        result.returns = tagComment;
      } else if (tagName === 'throws' || tagName === 'exception') {
        if (tagComment) result.throws.push(tagComment);
      } else if (tagName === 'deprecated') {
        result.deprecated = tagComment || '此函式已棄用';
      }
    }
  }

  result.description = descriptions.join('\n\n');
  return result;
}

/** JSDoc tag 的註解內容可能是字串或 JSDocText[] 節點陣列，統一轉成純文字 */
function getTagCommentText(tag) {
  const comment = tag.getComment();
  if (!comment) return '';
  if (typeof comment === 'string') return comment.trim();
  if (Array.isArray(comment)) {
    return comment
      .map((c) => (typeof c === 'string' ? c : c.getText?.() ?? ''))
      .join('')
      .trim();
  }
  return '';
}

/** 少數舊格式 `@param foo 說明文字` 沒被 ts-morph 解析出 name 時的備援 */
function extractParamNameFromComment(comment) {
  const match = comment.match(/^(\S+)/);
  return match ? match[1] : null;
}

/**
 * 展開一個型別節點，如果它是對某個 interface / type alias 的參照，
 * 回傳該型別的「攤平後欄位清單」；否則回傳 null（代表是原生型別，不需要展開）。
 *
 * 只展開一層（不遞迴進巢狀 interface 內部再展開它們的巢狀型別），
 * 理由跟 generate-docs.mjs 對型別字串的處理一致：文件是給人看的摘要，
 * 過度遞迴展開反而會讓一個函式的文件頁塞進整個型別樹，可讀性更差。
 * 巢狀欄位的型別字串仍會完整顯示（例如 "OrderItem[]"），
 * 使用者可以在「相關型別」區塊找到 OrderItem 本身的展開。
 */
function resolveTypeDeclaration(type, seenTypeNames, nestedTypeCollector) {
  const symbol = type.getAliasSymbol() ?? type.getSymbol();
  if (!symbol) return null;

  const declarations = symbol.getDeclarations();
  const decl = declarations.find(
    (d) => d.getKind() === SyntaxKind.InterfaceDeclaration || d.getKind() === SyntaxKind.TypeAliasDeclaration
  );
  if (!decl) return null;

  // 只展開專案原始碼裡的型別，跳過 node_modules / lib.d.ts 內建型別（例如 Array, Date...）
  const sourceFilePath = decl.getSourceFile().getFilePath();
  if (sourceFilePath.includes('node_modules') || sourceFilePath.includes('typescript/lib')) {
    return null;
  }

  const typeName = symbol.getName();
  if (seenTypeNames.has(typeName)) return null; // 避免循環參照無限展開
  seenTypeNames.add(typeName);

  if (decl.getKind() === SyntaxKind.InterfaceDeclaration) {
    return extractInterfaceFields(decl, typeName, nestedTypeCollector);
  }
  if (decl.getKind() === SyntaxKind.TypeAliasDeclaration) {
    return extractTypeAliasFields(decl, typeName, nestedTypeCollector);
  }
  return null;
}

/**
 * 從 InterfaceDeclaration 抽出欄位清單（含繼承的 extends，攤平合併）。
 * nestedTypeCollector（若提供）用來讓呼叫端遞迴收集欄位型別中，又參照到的其他專案內型別
 * （例如 ValidationResult.errors: ValidationErrorMessages）。
 */
function extractInterfaceFields(interfaceDecl, typeName, nestedTypeCollector) {
  const jsDoc = parseJsDoc(interfaceDecl.getJsDocs());
  const properties = interfaceDecl.getProperties();

  const fields = properties.map((prop) => propertyToFieldDoc(prop, nestedTypeCollector));

  return {
    name: typeName,
    kind: 'interface',
    description: jsDoc.description,
    fields,
  };
}

/** 從 TypeAliasDeclaration 抽出資訊：若底層是 object literal type 則當成欄位清單，否則當成單純的型別別名（例如 union） */
function extractTypeAliasFields(typeAliasDecl, typeName, nestedTypeCollector) {
  const jsDoc = parseJsDoc(typeAliasDecl.getJsDocs());
  const typeNode = typeAliasDecl.getTypeNode();

  if (typeNode && typeNode.getKind() === SyntaxKind.TypeLiteral) {
    const members = typeNode.getMembers().filter((m) => m.getKind() === SyntaxKind.PropertySignature);
    const fields = members.map((prop) => propertyToFieldDoc(prop, nestedTypeCollector));
    return {
      name: typeName,
      kind: 'type',
      description: jsDoc.description,
      fields,
    };
  }

  // union / primitive alias 等：沒有欄位清單，只記錄型別本身的字串定義
  return {
    name: typeName,
    kind: 'type',
    description: jsDoc.description,
    aliasOf: truncateType(typeNode ? typeNode.getText() : typeAliasDecl.getType().getText()),
    fields: [],
  };
}

/** PropertySignature -> FieldDoc（跟 PropDoc 結構對齊，方便前端共用同一顆 PropsTable 元件渲染） */
function propertyToFieldDoc(prop, nestedTypeCollector) {
  const jsDoc = parseJsDoc(prop.getJsDocs());
  const name = prop.getName();
  const optional = prop.hasQuestionToken();
  const propType = prop.getType();

  // 讓呼叫端（collectRelatedType）有機會展開這個欄位的型別，
  // 藉此把 interface 內部參照到的其他專案型別也一併收進「相關型別」清單。
  if (nestedTypeCollector) {
    nestedTypeCollector(propType);
  }

  return {
    name,
    required: !optional,
    type: truncateType(propType.getText(prop)),
    description: jsDoc.description,
  };
}

function main() {
  const files = globSync(FUNCTIONS_GLOB, {
    cwd: ROOT,
    ignore: ['**/*.test.ts', '**/*.spec.ts', '**/*.stories.ts'],
  }).sort();

  if (files.length === 0) {
    console.warn(`⚠️  在 ${FUNCTIONS_GLOB} 找不到任何檔案`);
  }

  const project = new Project({
    tsConfigFilePath: TSCONFIG_PATH,
    skipAddingFilesFromTsConfig: true,
  });

  const absFiles = files.map((f) => path.join(ROOT, f));
  project.addSourceFilesAtPaths(absFiles);

  /** @type {any[]} */
  const results = [];
  /** 收集所有函式簽章用到的相關型別，key 為型別名稱，避免同名型別重複輸出 */
  const relatedTypesMap = new Map();
  const failures = [];

  for (const relFile of files) {
    const absFile = path.join(ROOT, relFile);
    try {
      const sourceFile = project.getSourceFileOrThrow(absFile);
      const functionDocs = extractFunctionsFromFile(sourceFile, relFile, project, relatedTypesMap);
      results.push(...functionDocs);
    } catch (err) {
      failures.push({ file: relFile, message: err.message });
    }
  }

  results.sort((a, b) => a.functionName.localeCompare(b.functionName));

  const relatedTypes = [...relatedTypesMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  const output = {
    functions: results,
    types: relatedTypes,
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2) + '\n');

  fs.mkdirSync(path.dirname(OUTPUT_TYPES), { recursive: true });
  fs.writeFileSync(OUTPUT_TYPES, FUNCTION_TYPES_FILE_CONTENT);

  console.log(`✅ 函式文件解析完成：${results.length} 個函式（來自 ${files.length} 個檔案），${relatedTypes.length} 個相關型別`);
  console.log(`   → ${path.relative(ROOT, OUTPUT_JSON)}`);
  console.log(`   → ${path.relative(ROOT, OUTPUT_TYPES)}`);

  if (failures.length > 0) {
    console.warn(`\n⚠️  ${failures.length} 個檔案解析失敗：`);
    for (const f of failures) {
      console.warn(`   - ${f.file}: ${f.message}`);
    }
  }
}

/**
 * 從單一檔案抽出所有「具名匯出的函式」文件。
 * 支援兩種寫法：
 *  - export function foo() {}
 *  - export const foo = (...) => {}  /  export const foo = function () {}
 */
function extractFunctionsFromFile(sourceFile, relFile, project, relatedTypesMap) {
  const docs = [];
  const importPath = relFile.replace(/^src\//, '').replace(/\.ts$/, '');

  // 1. function 宣告
  for (const fn of sourceFile.getFunctions()) {
    if (!fn.isExported()) continue;
    const name = fn.getName();
    if (!name) continue; // 匿名 export default function，暫不支援
    docs.push(buildFunctionDoc({ name, node: fn, relFile, importPath, relatedTypesMap, jsDocOwner: fn }));
  }

  // 2. export const foo = (...) => {} 或 export const foo = function (...) {}
  for (const varStatement of sourceFile.getVariableStatements()) {
    if (!varStatement.isExported()) continue;
    for (const decl of varStatement.getDeclarations()) {
      const initializer = decl.getInitializer();
      if (!initializer) continue;

      const isArrow = initializer.getKind() === SyntaxKind.ArrowFunction;
      const isFnExpr = initializer.getKind() === SyntaxKind.FunctionExpression;
      if (!isArrow && !isFnExpr) continue;

      const name = decl.getName();
      // JSDoc 掛在 VariableStatement 上，不是掛在 initializer 上
      docs.push(
        buildFunctionDoc({
          name,
          node: initializer,
          relFile,
          importPath,
          relatedTypesMap,
          jsDocOwner: varStatement,
        })
      );
    }
  }

  return docs;
}

function buildFunctionDoc({ name, node, relFile, importPath, relatedTypesMap, jsDocOwner }) {
  const jsDoc = parseJsDoc(jsDocOwner.getJsDocs());
  const seenTypeNames = new Set();

  const params = node.getParameters().map((param) => {
    const paramName = param.getName();
    const paramType = param.getType();
    const isDestructured = param.getNameNode().getKind() === SyntaxKind.ObjectBindingPattern;

    // 遞迴展開這個參數型別（如果它指向專案內定義的 interface/type）
    collectRelatedType(paramType, relatedTypesMap, seenTypeNames);

    return {
      // 解構參數（例如 `{ items, couponCode }: OrderCalculationInput`）沒有單一名稱可顯示，
      // 用型別名稱代替，讓文件仍然可讀
      name: isDestructured ? paramType.getText(param) : paramName,
      type: truncateType(paramType.getText(param)),
      optional: param.isOptional() || param.hasInitializer(),
      defaultValue: param.hasInitializer() ? param.getInitializer().getText() : null,
      description: jsDoc.params.get(paramName) ?? '',
    };
  });

  const returnType = node.getReturnType();
  collectRelatedType(returnType, relatedTypesMap, seenTypeNames);

  const isAsync = typeof node.isAsync === 'function' ? node.isAsync() : false;

  return {
    id: toSlug(`${path.basename(relFile, '.ts')}-${name}`),
    functionName: name,
    filePath: relFile,
    importPath,
    description: jsDoc.description,
    isAsync,
    deprecated: jsDoc.deprecated,
    params,
    returnType: truncateType(returnType.getText(node)),
    returnDescription: jsDoc.returns,
    throws: jsDoc.throws,
    // 這個函式簽章（參數 + 回傳型別）直接或間接（巢狀欄位）用到的相關型別名稱，
    // 供前端連結到「相關型別」區塊；依展開順序排列，第一層（直接出現在參數/回傳型別的）會排在前面
    relatedTypeNames: [...seenTypeNames],
  };
}

/**
 * 展開型別並塞進共用的 relatedTypesMap（key: 型別名稱，跨函式去重）。
 * 遞迴進入：
 *  - 陣列 / Promise<T> 等泛型容器的型別參數
 *  - interface / type 欄位本身的型別（透過 nestedTypeCollector 回呼），
 *    這樣像 ValidationResult.errors: ValidationErrorMessages 這種巢狀參照也會被收錄。
 *
 * exportedFunctionTypeNames：這次呼叫鏈中已經展開過的型別名稱，避免循環參照（A 參照 B，B 又參照 A）無限遞迴。
 */
function collectRelatedType(type, relatedTypesMap, exportedFunctionTypeNames) {
  if (type.isArray()) {
    collectRelatedType(type.getArrayElementTypeOrThrow(), relatedTypesMap, exportedFunctionTypeNames);
    return;
  }

  const typeArgs = type.getTypeArguments?.() ?? [];
  for (const arg of typeArgs) {
    collectRelatedType(arg, relatedTypesMap, exportedFunctionTypeNames);
  }

  const nestedTypeCollector = (fieldType) => {
    collectRelatedType(fieldType, relatedTypesMap, exportedFunctionTypeNames);
  };

  const resolved = resolveTypeDeclaration(type, exportedFunctionTypeNames, nestedTypeCollector);
  if (!resolved) return;

  if (!relatedTypesMap.has(resolved.name)) {
    relatedTypesMap.set(resolved.name, resolved);
  }
}

const FUNCTION_TYPES_FILE_CONTENT = `// 此檔案由 scripts/generate-functions-docs.mjs 自動產生，請勿手動編輯。
// 執行 \`npm run functions:generate\` 以重新產生。

export interface FunctionParamDoc {
  name: string;
  type: string;
  optional: boolean;
  defaultValue: string | null;
  description: string;
}

export interface FunctionDoc {
  id: string;
  functionName: string;
  filePath: string;
  importPath: string;
  description: string;
  isAsync: boolean;
  deprecated: string | null;
  params: FunctionParamDoc[];
  returnType: string;
  returnDescription: string;
  throws: string[];
  /** 這個函式簽章中用到、且在專案內定義的 interface / type 名稱清單 */
  relatedTypeNames: string[];
}

export interface TypeFieldDoc {
  name: string;
  required: boolean;
  type: string;
  description: string;
}

export interface TypeDoc {
  name: string;
  kind: 'interface' | 'type';
  description: string;
  /** 若為 object 形狀（interface 或 type = { ... }），列出欄位；否則為空陣列 */
  fields: TypeFieldDoc[];
  /** 若為非 object 的 type alias（例如 union / primitive），記錄其原始定義字串 */
  aliasOf?: string;
}

export interface FunctionsDocData {
  functions: FunctionDoc[];
  types: TypeDoc[];
}
`;

main();
