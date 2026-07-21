/**
 * 批次解析 src/components/**\/*.tsx，
 * 使用 react-docgen-typescript 抽取 props / 型別 / JSDoc 說明，
 * 另外使用 ts-morph 針對每個 props 型別做「詳細型別展開」（跟
 * scripts/generate-functions-docs.mjs 對函式參數的處理同一套設計）：
 *  - react-docgen-typescript 產生的 prop.type 字串本身已經夠給表格用
 *    （例如 "string[]"、"'a' | 'b'"），但當某個 prop 的型別指向專案內
 *    定義的 interface / type（例如 `items: CardItem[]`）時，使用者
 *    無法從字串本身看到 CardItem 裡有哪些欄位。
 *  - 這裡額外用 ts-morph 走一次每個組件的 props 型別，把有指向專案內
 *    interface / type 的部分展開成 ComponentTypeDoc（含欄位、是否必填、
 *    完整型別字串、JSDoc 說明），並給予一個獨立的 id（目前實作等於
 *    型別名稱本身）。不同組件的 props 若參照到同一個型別（例如兩個組件
 *    都吃 `items: CardItem[]`），會共用同一筆 ComponentTypeDoc，不重複展開。
 *
 * 輸出：
 *  - data/components.json                              給靜態頁面生成用（含 relatedTypeNames）
 *  - data/component-types.json                          相關型別的詳細展開（跨組件共用，供「資料管理」等功能使用）
 *  - src/lib/generator/component-map.ts    給動態 import 用（webpack/vite 需要靜態可分析路徑）
 */
import { withCustomConfig } from 'react-docgen-typescript';
import { Project, SyntaxKind } from 'ts-morph';
import { globSync } from 'glob';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TSCONFIG_PATH = path.join(ROOT, 'tsconfig.app.json');
// src/components/**  → 文件系統要解析的範例組件本體 + ui 基礎元件（generator 的資料來源）
const COMPONENTS_GLOBS = ['src/components/demo/*.tsx'];//'src/components/**/*.tsx'
const OUTPUT_JSON = path.join(ROOT, 'data', 'components.json');
const OUTPUT_TYPES_JSON = path.join(ROOT, 'data', 'component-types.json');
const OUTPUT_MAP = path.join(ROOT, 'src', 'lib', 'generator', 'component-map.ts');

const parser = withCustomConfig(TSCONFIG_PATH, {
  savePropValueAsString: true,
  shouldExtractLiteralValuesFromEnum: true,
  shouldExtractValuesFromUnion: true,
  shouldRemoveUndefinedFromOptional: true,
  shouldIncludePropTagMap: true,
  // 排除從 node_modules（例如原生 HTMLAttributes）繼承來、且沒有自己註解的 props，
  // 避免每個組件都被硬塞一堆 onClick / onChange 等雜訊。
  propFilter: (prop) => {
    if (prop.parent) {
      return !prop.parent.fileName.includes('node_modules');
    }
    return true;
  },
});

/** 把型別字串裁短，避免超長的 union / 泛型把表格撐爆 */
function truncateType(type, max = 160) {
  if (!type) return 'unknown';
  const oneLine = String(type).replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 1) + '…';
}

function toSlug(str) {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * 展開一個型別節點，如果它是對某個 interface / type alias 的參照，
 * 回傳該型別的「攤平後欄位清單」；否則回傳 null（代表是原生型別，不需要展開）。
 * 跟 generate-functions-docs.mjs 的 resolveTypeDeclaration 同一套邏輯，只是
 * 這裡收集進 ComponentTypeDoc（多一個獨立的 id 欄位供跨組件共用參照）。
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

/** 從 JSDoc 節點抽出主要說明文字（不需要 @param 等 tag，元件型別展開只取 description） */
function jsDocDescription(jsDocs) {
  if (!jsDocs || jsDocs.length === 0) return '';
  return jsDocs
    .map((doc) => doc.getDescription().trim())
    .filter(Boolean)
    .join('\n\n');
}

/** 從 InterfaceDeclaration 抽出欄位清單（含繼承的 extends，攤平合併） */
function extractInterfaceFields(interfaceDecl, typeName, nestedTypeCollector) {
  const properties = interfaceDecl.getProperties();
  const fields = properties.map((prop) => propertyToFieldDoc(prop, nestedTypeCollector));

  return {
    id: typeName,
    name: typeName,
    kind: 'interface',
    description: jsDocDescription(interfaceDecl.getJsDocs()),
    fields,
  };
}

/** 從 TypeAliasDeclaration 抽出資訊：若底層是 object literal type 則當成欄位清單，否則當成單純的型別別名（例如 union） */
function extractTypeAliasFields(typeAliasDecl, typeName, nestedTypeCollector) {
  const typeNode = typeAliasDecl.getTypeNode();

  if (typeNode && typeNode.getKind() === SyntaxKind.TypeLiteral) {
    const members = typeNode.getMembers().filter((m) => m.getKind() === SyntaxKind.PropertySignature);
    const fields = members.map((prop) => propertyToFieldDoc(prop, nestedTypeCollector));
    return {
      id: typeName,
      name: typeName,
      kind: 'type',
      description: jsDocDescription(typeAliasDecl.getJsDocs()),
      fields,
    };
  }

  // union / primitive alias 等：沒有欄位清單，只記錄型別本身的字串定義
  return {
    id: typeName,
    name: typeName,
    kind: 'type',
    description: jsDocDescription(typeAliasDecl.getJsDocs()),
    aliasOf: truncateType(typeNode ? typeNode.getText() : typeAliasDecl.getType().getText()),
    fields: [],
  };
}

/** PropertySignature -> ComponentTypeFieldDoc，型別字串保留完整（含陣列 `[]`、union 等），不會被簡化成基本 json 型別 */
function propertyToFieldDoc(prop, nestedTypeCollector) {
  const name = prop.getName();
  const optional = prop.hasQuestionToken();
  const propType = prop.getType();

  // 讓呼叫端有機會展開這個欄位的型別，藉此把 interface 內部參照到的
  // 其他專案型別也一併收進「相關型別」清單（例如 CardItem.badge: BadgeVariant）。
  if (nestedTypeCollector) {
    nestedTypeCollector(propType);
  }

  return {
    name,
    required: !optional,
    type: truncateType(propType.getText(prop)),
    description: jsDocDescription(prop.getJsDocs()),
  };
}

/**
 * 展開型別並塞進共用的 relatedTypesMap（key: 型別名稱，跨組件去重）。
 * 遞迴進入陣列 / 泛型容器的型別參數，以及 interface/type 欄位本身的型別。
 */
function collectRelatedType(type, relatedTypesMap, seenTypeNames) {
  if (type.isArray()) {
    collectRelatedType(type.getArrayElementTypeOrThrow(), relatedTypesMap, seenTypeNames);
    return;
  }

  const typeArgs = type.getTypeArguments?.() ?? [];
  for (const arg of typeArgs) {
    collectRelatedType(arg, relatedTypesMap, seenTypeNames);
  }

  const nestedTypeCollector = (fieldType) => {
    collectRelatedType(fieldType, relatedTypesMap, seenTypeNames);
  };

  const resolved = resolveTypeDeclaration(type, seenTypeNames, nestedTypeCollector);
  if (!resolved) return;

  if (!relatedTypesMap.has(resolved.name)) {
    relatedTypesMap.set(resolved.name, resolved);
  }
}

/**
 * 用 ts-morph 對單一組件檔案裡的 props 型別做詳細展開，回傳這個組件
 * 用到的相關型別名稱清單（依展開順序），同時把展開結果塞進共用的 relatedTypesMap。
 *
 * 尋找 props 型別的方式：優先找跟 react-docgen-typescript 解析出的
 * `displayName` 同名的函式/變數宣告的參數型別（元件的 props 參數），
 * 找不到就退回整份檔案 export 的 interface/type（常見的 `XxxProps` 命名慣例）。
 */
function extractRelatedTypeNamesForComponent(sourceFile, componentName, relatedTypesMap) {
  const seenTypeNames = new Set();

  function tryParam(fnLikeNode) {
    if (!fnLikeNode) return false;
    const params = fnLikeNode.getParameters?.() ?? [];
    const propsParam = params[0];
    if (!propsParam) return false;
    collectRelatedType(propsParam.getType(), relatedTypesMap, seenTypeNames);
    return true;
  }

  let found = false;

  // function Component(props) {}
  for (const fn of sourceFile.getFunctions()) {
    if (fn.getName() === componentName) {
      found = tryParam(fn) || found;
    }
  }

  // const Component = (props) => {} / forwardRef(...)
  for (const varStatement of sourceFile.getVariableStatements()) {
    for (const decl of varStatement.getDeclarations()) {
      if (decl.getName() !== componentName) continue;
      const initializer = decl.getInitializer();
      if (!initializer) continue;

      if (
        initializer.getKind() === SyntaxKind.ArrowFunction ||
        initializer.getKind() === SyntaxKind.FunctionExpression
      ) {
        found = tryParam(initializer) || found;
      } else {
        // React.forwardRef<Ref, Props>(...) 等：退而求其次，直接展開變數宣告型別
        // 上標註的泛型引數，通常第二個引數就是 Props。
        const typeArgs = initializer.getKind?.() ? [] : [];
        void typeArgs;
      }
    }
  }

  // 找不到函式參數時，退回「同名或 `${componentName}Props`」的 interface/type 匯出宣告
  if (!found) {
    const candidateNames = [`${componentName}Props`, componentName];
    for (const iface of sourceFile.getInterfaces()) {
      if (candidateNames.includes(iface.getName())) {
        collectRelatedType(iface.getType(), relatedTypesMap, seenTypeNames);
        found = true;
      }
    }
    for (const alias of sourceFile.getTypeAliases()) {
      if (candidateNames.includes(alias.getName())) {
        collectRelatedType(alias.getType(), relatedTypesMap, seenTypeNames);
        found = true;
      }
    }
  }

  return [...seenTypeNames];
}

function main() {
  const files = globSync(COMPONENTS_GLOBS, {
    cwd: ROOT,
    ignore: ['**/*.stories.tsx', '**/*.test.tsx', '**/*.spec.tsx'],
  }).sort();

  if (files.length === 0) {
    console.warn(`⚠️  在 ${COMPONENTS_GLOBS.join(', ')} 找不到任何檔案`);
  }

  const project = new Project({
    tsConfigFilePath: TSCONFIG_PATH,
    skipAddingFilesFromTsConfig: true,
  });
  const absFiles = files.map((f) => path.join(ROOT, f));
  if (absFiles.length > 0) project.addSourceFilesAtPaths(absFiles);

  /** @type {any[]} */
  const results = [];
  /** 收集所有組件 props 用到的相關型別，key 為型別名稱，跨組件去重（型別可共用） */
  const relatedTypesMap = new Map();
  const failures = [];

  for (const relFile of files) {
    const absFile = path.join(ROOT, relFile);
    try {
      const docs = parser.parse(absFile);
      const sourceFile = project.getSourceFileOrThrow(absFile);

      for (const doc of docs) {
        // 略過沒有解析出任何 props、且沒有 displayName 的雜訊結果
        if (!doc.displayName) continue;

        const importPath = relFile
          .replace(/^src\//, '')
          .replace(/\.tsx$/, '');

        let relatedTypeNames = [];
        try {
          relatedTypeNames = extractRelatedTypeNamesForComponent(sourceFile, doc.displayName, relatedTypesMap);
        } catch (err) {
          // ts-morph 詳細展開失敗不影響既有的 react-docgen-typescript 基本型別輸出，
          // 只記錄警告，這個組件仍會照舊產生 props 表格資料。
          console.warn(`⚠️  ${relFile}（${doc.displayName}）詳細型別展開失敗：${err.message}`);
        }

        results.push({
          id: toSlug(`${path.basename(relFile, '.tsx')}-${doc.displayName}`),
          componentName: doc.displayName,
          filePath: relFile,
          importPath, // 例如 components/Button/Button
          description: doc.description || '',
          props: Object.entries(doc.props ?? {})
            .map(([name, prop]) => ({
              name,
              required: Boolean(prop.required),
              // react-docgen-typescript 對 union literal type（例如 'a' | 'b'）
              // 的 type.name 固定回傳 "enum"，真正的型別字串在 type.raw。
              // 一般型別（string / boolean / ReactNode / string[] / SomeType[]...）
              // 沒有 raw，就退回 name，name 本身已含陣列 `[]` 等完整寫法。
              type: truncateType(prop.type?.raw ?? prop.type?.name ?? 'unknown'),
              defaultValue:
                prop.defaultValue && prop.defaultValue.value !== undefined
                  ? String(prop.defaultValue.value)
                  : null,
              description: prop.description || '',
            }))
            // required 的排前面，其餘照字母排序，閱讀順序比較直覺
            .sort((a, b) => {
              if (a.required !== b.required) return a.required ? -1 : 1;
              return a.name.localeCompare(b.name);
            }),
          // 這個組件 props 簽章中用到、且在專案內定義的型別名稱清單，
          // 詳細定義查 data/component-types.json（見 ComponentTypeDoc）。
          relatedTypeNames,
        });
      }
    } catch (err) {
      failures.push({ file: relFile, message: err.message });
    }
  }

  // 按組件名稱排序，讓輸出結果穩定（避免每次 diff 都亂跳）
  results.sort((a, b) => a.componentName.localeCompare(b.componentName));

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(results, null, 2) + '\n');

  // 獨立輸出相關型別的詳細展開，供「資料管理」等其他功能引用（見
  // apps/web-builder/src/pages/data-manager.tsx）。每個型別以 name 當作
  // 目前實作的獨立 id，不同組件的 relatedTypeNames 可能共用同一筆。
  const relatedTypes = [...relatedTypesMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const typesOutput = { types: relatedTypes };
  fs.mkdirSync(path.dirname(OUTPUT_TYPES_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_TYPES_JSON, JSON.stringify(typesOutput, null, 2) + '\n');

  // 產生「靜態可分析」的動態 import map。
  // Vite/webpack 沒辦法對執行期組出來的字串路徑做 code-splitting，
  // 所以這裡直接把每個 import() 字面量寫死進一個產生出來的檔案。
  const uniqueByImportPath = [...new Map(results.map((r) => [r.importPath, r])).values()];
  const mapEntries = uniqueByImportPath
    .map((r) => `  '${r.importPath}': () => import('@workspace/ui/${r.importPath}.tsx'),`)
    .join('\n');

  const mapFileContent = `// 此檔案由 scripts/generate-docs.mjs 自動產生，請勿手動編輯。
// 執行 \`npm run docs:generate\` 以重新產生。

export type ComponentLoader = () => Promise<Record<string, unknown>>;

export const componentMap: Record<string, ComponentLoader> = {
${mapEntries}
};
`;

  fs.mkdirSync(path.dirname(OUTPUT_MAP), { recursive: true });
  fs.writeFileSync(OUTPUT_MAP, mapFileContent);

  console.log(`✅ 解析完成：${results.length} 個組件（來自 ${files.length} 個檔案），${relatedTypes.length} 個相關型別`);
  console.log(`   → ${path.relative(ROOT, OUTPUT_JSON)}`);
  console.log(`   → ${path.relative(ROOT, OUTPUT_TYPES_JSON)}`);
  console.log(`   → ${path.relative(ROOT, OUTPUT_MAP)}`);

  if (failures.length > 0) {
    console.warn(`\n⚠️  ${failures.length} 個檔案解析失敗：`);
    for (const f of failures) {
      console.warn(`   - ${f.file}: ${f.message}`);
    }
  }
}

main();
