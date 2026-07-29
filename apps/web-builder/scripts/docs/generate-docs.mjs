/**
 * 批次解析 src/components/**\/*.tsx，
 * 使用 react-docgen-typescript 抽取 props / 型別 / JSDoc 說明，
 * 另外使用 ts-morph 針對每個 props 型別做「詳細型別展開」（跟
 * scripts/docs/generate-functions-docs.mjs 對函式參數的處理同一套設計）：
 *  - react-docgen-typescript 產生的 prop.type 字串本身已經夠給表格用
 *    （例如 "string[]"、"'a' | 'b'"），但當某個 prop 的型別指向專案內
 *    定義的 interface / type（例如 `items: CardItem[]`）時，使用者
 *    無法從字串本身看到 CardItem 裡有哪些欄位。
 *  - 這裡額外用 ts-morph 走一次每個組件的 props 型別，把有指向專案內
 *    interface / type 的部分展開成 ComponentTypeDoc（含欄位、是否必填、
 *    完整型別字串、JSDoc 說明），並給予一個獨立的 id。
 *
 * id 規則（避免不同目錄下同名組件 / 同一檔案內多個具名匯出 / 同名型別互相覆蓋、造成路由或查找撞名）：
 *  - ComponentDoc.id      = `{組件檔案的 filePath}#{組件名稱}`
 *                           （例如 `src/components/landing1/card.tsx#CardHeader`）
 *    單一檔案可能匯出多個組件（例如 card.tsx 同時匯出 Card 與 CardHeader），
 *    只用 filePath 當 id 會讓同檔案內的多個組件互相覆蓋，因此用「檔案路徑 + 組件名稱」組合。
 *  - ComponentTypeDoc.id  = `{型別宣告所在檔案的 filePath}#{型別名稱}`
 *                           （例如 `src/components/landing1/types.ts#BrandData`）
 *    因為型別名稱在單一檔案內才保證唯一，不同檔案可能有同名但不同定義的型別，
 *    用「宣告檔案路徑 + 型別名稱」組合才能保證全域唯一。
 *
 * 這支腳本位於 apps/web-builder/scripts/docs，但解析對象（src/components/**）
 * 是 packages/ui 的原始碼；輸出則分別寫到 monorepo 根目錄的 /data，
 * 以及 apps/web-builder 自己的 src（動態 import map）。
 *
 * 輸出：
 *  - /data/components.json                              給靜態頁面生成用（含 relatedTypeNames，內容為 component-types id）
 *  - /data/component-types.json                          相關型別的詳細展開（跨組件共用，以 filePath#TypeName 為 id）
 *  - apps/web-builder/src/lib/generator/component-map.ts 給動態 import 用（webpack/vite 需要靜態可分析路徑）
 */
import { withCustomConfig } from 'react-docgen-typescript';
import { Project, SyntaxKind } from 'ts-morph';
import { globSync } from 'glob';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 這支腳本住在 apps/web-builder/scripts/docs，但實際要解析的組件原始碼
// 在 packages/ui（@workspace/ui），所以「解析來源」與「輸出目的地」是兩個不同的根目錄。
const WEB_BUILDER_ROOT = path.resolve(__dirname, '../..');
const MONOREPO_ROOT = path.resolve(WEB_BUILDER_ROOT, '../..');
const UI_ROOT = path.join(MONOREPO_ROOT, 'packages', 'ui');

const TSCONFIG_PATH = path.join(UI_ROOT, 'tsconfig.app.json');
// src/components/**  → 文件系統要解析的範例組件本體（generator 的資料來源，位於 packages/ui）
const COMPONENTS_GLOBS = ['src/components/landing1/*.tsx'];
// 每個組件目錄底下的 default.ts（預覽用的預設 demo props，見
// apps/web-builder .../component-grouping.ts 的 loadDefaultProps）。
// 這些檔案不是組件本體，不會被 react-docgen-typescript 解析進 components.json，
// 但預覽視窗一樣要動態 import 到它們，所以要單獨把它們也寫進 component-map.ts，
// 否則 loadComponentModule("components/<group>/default") 會找不到對應的 map 項目，
// 即使 default.ts 檔案實際上存在於磁碟上。
const DEFAULT_PROPS_GLOB = 'src/components/*/default.ts';
// 輸出的文件 JSON 寫入 monorepo 根目錄的 /data（跟 data/default 平行），
// 而不是寫回 packages/ui，因為這是「產生出來的文件資料」而非站台內容資料。
const OUTPUT_JSON = path.join(MONOREPO_ROOT, 'data', 'components.json');
const OUTPUT_TYPES_JSON = path.join(MONOREPO_ROOT, 'data', 'component-types.json');
// component-map.ts 是給 web-builder 動態 import 用的程式碼，寫回 web-builder 的 src。
const OUTPUT_MAP = path.join(WEB_BUILDER_ROOT, 'src', 'lib', 'generator', 'component-map.ts');

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

/** 把絕對路徑轉成相對於 packages/ui（組件原始碼根目錄）、以 `/` 分隔的路徑，作為 id 的一部分（跨平台穩定） */
function toRelPath(absPath) {
  return path.relative(UI_ROOT, absPath).split(path.sep).join('/');
}

/**
 * 判斷一個 TypeAliasDeclaration 是不是「簡單別名」（底層不是 object type literal，
 * 例如 union literal `"a" | "b"`、或其他型別的單純別名）。
 * 這種別名沒有欄位可展開，只是幫一串字面型別取個名字 —— 對使用者來說，
 * 直接看到 `"start" | "center" | "end"` 比看到 `FlexAlign` 再多一層去查「FlexAlign 是什麼」
 * 更直接，所以這種別名不應該被當成獨立的 ComponentTypeDoc 收錄，也不應該留在
 * relatedTypeNames 裡造成「還要再展開一層」的間接參照，而是直接把它的定義字串
 * 內聯回 prop 的 type 欄位（見 inlineSimpleAliasTypeText）。
 */
function simpleAliasTypeText(typeAliasDecl) {
  const typeNode = typeAliasDecl.getTypeNode();
  if (typeNode && typeNode.getKind() === SyntaxKind.TypeLiteral) {
    return null; // object type literal，屬於「複雜型別」，交由 extractTypeAliasFields 展開欄位
  }
  return truncateType(typeNode ? typeNode.getText() : typeAliasDecl.getType().getText());
}

/**
 * 展開一個型別節點，如果它是對某個 interface，或底層為 object type literal 的
 * type alias 的參照，回傳該型別的「攤平後欄位清單」；否則回傳 null——
 * 包括原生型別（不需要展開），以及「簡單別名」（union / primitive 別名，
 * 見 simpleAliasTypeText），這兩種都不會被收進 relatedTypesMap /
 * relatedTypeNames，避免多一層「型別名稱 -> 還要再查一次定義」的間接參照。
 * 跟 generate-functions-docs.mjs 的 resolveTypeDeclaration 同一套邏輯，只是
 * 這裡收集進 ComponentTypeDoc（id 為 `{宣告檔案路徑}#{型別名稱}`，供跨組件共用參照）。
 */
function resolveTypeDeclaration(type, seenTypeIds, nestedTypeCollector) {
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

  // 簡單別名（union / primitive 別名）：不展開成 ComponentTypeDoc，直接視為原生型別跳過，
  // 讓呼叫端（top-level prop.type）改用 inlineSimpleAliasTypeText 直接內聯定義字串。
  if (decl.getKind() === SyntaxKind.TypeAliasDeclaration && simpleAliasTypeText(decl) !== null) {
    return null;
  }

  const typeName = symbol.getName();
  const typeFilePath = toRelPath(sourceFilePath);
  const typeId = `${typeFilePath}#${typeName}`;

  if (seenTypeIds.has(typeId)) return null; // 避免循環參照無限展開
  seenTypeIds.add(typeId);

  if (decl.getKind() === SyntaxKind.InterfaceDeclaration) {
    return extractInterfaceFields(decl, typeId, typeName, nestedTypeCollector);
  }
  if (decl.getKind() === SyntaxKind.TypeAliasDeclaration) {
    return extractTypeAliasFields(decl, typeId, typeName, nestedTypeCollector);
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
function extractInterfaceFields(interfaceDecl, typeId, typeName, nestedTypeCollector) {
  const properties = interfaceDecl.getProperties();
  const fields = properties.map((prop) => propertyToFieldDoc(prop, nestedTypeCollector));

  return {
    id: typeId,
    name: typeName,
    kind: 'interface',
    description: jsDocDescription(interfaceDecl.getJsDocs()),
    fields,
  };
}

/**
 * 從 TypeAliasDeclaration 抽出欄位清單。呼叫端（resolveTypeDeclaration）已經先用
 * simpleAliasTypeText 濾掉底層不是 object type literal 的簡單別名（union / primitive
 * 別名，例如 FlexAlign），所以這裡永遠是「底層為 object type literal」的具名別名
 * （例如 `type Wordmark = { lead: string; accent: string }`），可以直接當欄位清單展開。
 */
function extractTypeAliasFields(typeAliasDecl, typeId, typeName, nestedTypeCollector) {
  const typeNode = typeAliasDecl.getTypeNode();
  const members = typeNode.getMembers().filter((m) => m.getKind() === SyntaxKind.PropertySignature);
  const fields = members.map((prop) => propertyToFieldDoc(prop, nestedTypeCollector));
  return {
    id: typeId,
    name: typeName,
    kind: 'type',
    description: jsDocDescription(typeAliasDecl.getJsDocs()),
    fields,
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
 * 展開型別並塞進共用的 relatedTypesMap（key: typeId `{filePath}#{typeName}`，跨組件去重）。
 * 遞迴進入陣列 / 泛型容器的型別參數，以及 interface/type 欄位本身的型別。
 */
function collectRelatedType(type, relatedTypesMap, seenTypeIds) {
  if (type.isArray()) {
    collectRelatedType(type.getArrayElementTypeOrThrow(), relatedTypesMap, seenTypeIds);
    return;
  }

  const typeArgs = type.getTypeArguments?.() ?? [];
  for (const arg of typeArgs) {
    collectRelatedType(arg, relatedTypesMap, seenTypeIds);
  }

  const nestedTypeCollector = (fieldType) => {
    collectRelatedType(fieldType, relatedTypesMap, seenTypeIds);
  };

  const resolved = resolveTypeDeclaration(type, seenTypeIds, nestedTypeCollector);
  if (!resolved) return;

  if (!relatedTypesMap.has(resolved.id)) {
    relatedTypesMap.set(resolved.id, resolved);
  }
}

/**
 * 用 ts-morph 對單一組件檔案裡的 props 型別做詳細展開，回傳這個組件
 * 用到的相關型別 id 清單（依展開順序），同時把展開結果塞進共用的 relatedTypesMap。
 *
 * 尋找 props 型別的方式：優先找跟 react-docgen-typescript 解析出的
 * `displayName` 同名的函式/變數宣告的參數型別（元件的 props 參數），
 * 找不到就退回整份檔案 export 的 interface/type（常見的 `XxxProps` 命名慣例）。
 */
function extractRelatedTypeIdsForComponent(sourceFile, componentName, relatedTypesMap) {
  const seenTypeIds = new Set();

  function tryParam(fnLikeNode) {
    if (!fnLikeNode) return false;
    const params = fnLikeNode.getParameters?.() ?? [];
    const propsParam = params[0];
    if (!propsParam) return false;
    collectRelatedType(propsParam.getType(), relatedTypesMap, seenTypeIds);
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
      }
    }
  }

  // 找不到函式參數時，退回「同名或 `${componentName}Props`」的 interface/type 匯出宣告
  if (!found) {
    const candidateNames = [`${componentName}Props`, componentName];
    for (const iface of sourceFile.getInterfaces()) {
      if (candidateNames.includes(iface.getName())) {
        collectRelatedType(iface.getType(), relatedTypesMap, seenTypeIds);
        found = true;
      }
    }
    for (const alias of sourceFile.getTypeAliases()) {
      if (candidateNames.includes(alias.getName())) {
        collectRelatedType(alias.getType(), relatedTypesMap, seenTypeIds);
        found = true;
      }
    }
  }

  return [...seenTypeIds];
}

/**
 * 收集一個檔案內所有「簡單別名」（union / primitive 別名，例如
 * `export type FlexAlign = "start" | "center" | ...`）的 名稱 -> 展開後字串 對照表。
 * react-docgen-typescript 對具名型別參照（不像 inline union literal）不會自動展開，
 * prop.type 只會拿到裸名稱（例如 "FlexAlign"），所以用這張表在輸出前把它換成
 * 實際的限制字串，避免「型別名稱 -> 還要再去 component-types.json 查一次定義」
 * 這一層不必要的間接參照。
 */
function collectSimpleAliasesByName(sourceFile) {
  const map = new Map();
  for (const alias of sourceFile.getTypeAliases()) {
    const text = simpleAliasTypeText(alias);
    if (text !== null) map.set(alias.getName(), text);
  }
  return map;
}

/** 把 prop 型別字串中的具名簡單別名換成它的展開定義；不是簡單別名（或找不到）就原樣回傳。 */
function inlineSimpleAliasTypeText(typeText, simpleAliasesByName) {
  const trimmed = typeText.trim();
  const expanded = simpleAliasesByName.get(trimmed);
  return expanded ?? typeText;
}

function main() {
  const files = globSync(COMPONENTS_GLOBS, {
    cwd: UI_ROOT,
    ignore: ['**/*.stories.tsx', '**/*.test.tsx', '**/*.spec.tsx'],
  }).sort();

  if (files.length === 0) {
    console.warn(`⚠️  在 ${COMPONENTS_GLOBS.join(', ')} 找不到任何檔案`);
  }

  const project = new Project({
    tsConfigFilePath: TSCONFIG_PATH,
    skipAddingFilesFromTsConfig: true,
  });
  const absFiles = files.map((f) => path.join(UI_ROOT, f));
  if (absFiles.length > 0) project.addSourceFilesAtPaths(absFiles);

  /** @type {any[]} */
  const results = [];
  /** 收集所有組件 props 用到的相關型別，key 為 typeId（`{filePath}#{typeName}`），跨組件去重（型別可共用） */
  const relatedTypesMap = new Map();
  const failures = [];

  for (const relFile of files) {
    const absFile = path.join(UI_ROOT, relFile);
    try {
      const docs = parser.parse(absFile);
      const sourceFile = project.getSourceFileOrThrow(absFile);
      const simpleAliasesByName = collectSimpleAliasesByName(sourceFile);

      for (const doc of docs) {
        // 略過沒有解析出任何 props、且沒有 displayName 的雜訊結果
        if (!doc.displayName) continue;

        const importPath = relFile
          .replace(/^src\//, '')
          .replace(/\.tsx$/, '');

        let relatedTypeIds = [];
        try {
          relatedTypeIds = extractRelatedTypeIdsForComponent(sourceFile, doc.displayName, relatedTypesMap);
        } catch (err) {
          // ts-morph 詳細展開失敗不影響既有的 react-docgen-typescript 基本型別輸出，
          // 只記錄警告，這個組件仍會照舊產生 props 表格資料。
          console.warn(`⚠️  ${relFile}（${doc.displayName}）詳細型別展開失敗：${err.message}`);
        }

        results.push({
          // 用「檔案路徑 + 組件名稱」組合當 id：
          // - 不同目錄下同名組件（例如 demo/button.tsx 與 ui/button.tsx）不會互相覆蓋
          // - 同一檔案內匯出多個組件（例如 card.tsx 同時匯出 Card 與 CardHeader）也不會撞名
          id: `${relFile}#${doc.displayName}`,
          componentName: doc.displayName,
          filePath: relFile,
          importPath, // 例如 components/landing1/button
          description: doc.description || '',
          props: Object.entries(doc.props ?? {})
            .map(([name, prop]) => ({
              name,
              required: Boolean(prop.required),
              // react-docgen-typescript 對 union literal type（例如 'a' | 'b'）
              // 的 type.name 固定回傳 "enum"，真正的型別字串在 type.raw。
              // 一般型別（string / boolean / ReactNode / string[] / SomeType[]...）
              // 沒有 raw，就退回 name，name 本身已含陣列 `[]` 等完整寫法。
              // 若這個型別字串剛好是本檔案內某個「簡單別名」（union / primitive 別名，
              // 例如 FlexAlign）的裸名稱，直接內聯展開成它的實際限制字串，
              // 不留下需要再查一次 component-types.json 的間接參照。
              type: truncateType(
                inlineSimpleAliasTypeText(prop.type?.raw ?? prop.type?.name ?? 'unknown', simpleAliasesByName)
              ),
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
          // 這個組件 props 簽章中用到、且在專案內定義的型別 id 清單，
          // 詳細定義查 data/component-types.json（見 ComponentTypeDoc.id）。
          relatedTypeNames: relatedTypeIds,
        });
      }
    } catch (err) {
      failures.push({ file: relFile, message: err.message });
    }
  }

  // 按 id 排序，讓輸出結果穩定（避免每次 diff 都亂跳）
  results.sort((a, b) => a.id.localeCompare(b.id));

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(results, null, 2) + '\n');

  // 獨立輸出相關型別的詳細展開，供其他功能引用。每個型別以 `{filePath}#{typeName}`
  // 當作獨立 id，不同組件的 relatedTypeNames 可能共用同一筆。
  const relatedTypes = [...relatedTypesMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  const typesOutput = { types: relatedTypes };
  fs.mkdirSync(path.dirname(OUTPUT_TYPES_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_TYPES_JSON, JSON.stringify(typesOutput, null, 2) + '\n');

  // 產生「靜態可分析」的動態 import map。
  // Vite/webpack 沒辦法對執行期組出來的字串路徑做 code-splitting，
  // 所以這裡直接把每個 import() 字面量寫死進一個產生出來的檔案。
  const uniqueByImportPath = [...new Map(results.map((r) => [r.importPath, r])).values()];
  const componentMapEntries = uniqueByImportPath.map(
    (r) => `  '${r.importPath}': () => import('@workspace/ui/${r.importPath}.tsx'),`
  );

  // default.ts 不是組件本體、不在 results 裡，但預覽用的 loadDefaultProps
  // 一樣是透過 loadComponentModule 依 importPath 動態載入，所以要獨立 glob
  // 出來、一併寫進同一份 map，用 .ts（而非 .tsx）當副檔名。
  const defaultPropsFiles = globSync(DEFAULT_PROPS_GLOB, { cwd: UI_ROOT }).sort();
  const defaultPropsEntries = defaultPropsFiles.map((relFile) => {
    const importPath = relFile.replace(/^src\//, '').replace(/\.ts$/, '');
    return `  '${importPath}': () => import('@workspace/ui/${importPath}.ts'),`;
  });

  const mapEntries = [...componentMapEntries, ...defaultPropsEntries].join('\n');

  const mapFileContent = `// 此檔案由 apps/web-builder/scripts/docs/generate-docs.mjs 自動產生，請勿手動編輯。
// 執行 \`npm run docs:generate\` 以重新產生。

export type ComponentLoader = () => Promise<Record<string, unknown>>;

export const componentMap: Record<string, ComponentLoader> = {
${mapEntries}
};
`;

  fs.mkdirSync(path.dirname(OUTPUT_MAP), { recursive: true });
  fs.writeFileSync(OUTPUT_MAP, mapFileContent);

  console.log(`✅ 解析完成：${results.length} 個組件（來自 ${files.length} 個檔案），${relatedTypes.length} 個相關型別`);
  console.log(`   → ${path.relative(MONOREPO_ROOT, OUTPUT_JSON)}`);
  console.log(`   → ${path.relative(MONOREPO_ROOT, OUTPUT_TYPES_JSON)}`);
  console.log(`   → ${path.relative(MONOREPO_ROOT, OUTPUT_MAP)}`);

  if (failures.length > 0) {
    console.warn(`\n⚠️  ${failures.length} 個檔案解析失敗：`);
    for (const f of failures) {
      console.warn(`   - ${f.file}: ${f.message}`);
    }
  }
}

main();
