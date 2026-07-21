#!/usr/bin/env node
// scripts/generate-pages.mjs
//
// 讀取 data/{app}/pages.json（該 app 底下的頁面陣列，每頁內容由
// 組件節點遞迴組成），對照 data/components.json（由 generate-docs.mjs 產生的
// 組件描述檔），靜態生成實際可執行的 .tsx 頁面檔到 src/pages/generated/。
//
// 用法：
//   node scripts/generate-pages.mjs                        # 產生「default」app
//   node scripts/generate-pages.mjs --app marketing  # 產生指定 app
//   node scripts/generate-pages.mjs --pages ./data/marketing/pages.json --out ./src/pages/generated
//
// 設計重點：
//   - 完全 build-time：輸出的是普通 .tsx 原始碼，不含任何 runtime JSON 解析或動態 import。
//   - 資料配置是「一個 app = 一個資料夾」：data/{app}/pages.json，
//     跟 i18n 管理頁面（data/{app}/i18n/{locale}.json）的 app 概念一致；
//     這支腳本每次只處理單一 app 底下的頁面（預設 "default"，對應
//     data/default/pages.json，`--pages` 可覆寫成任意路徑）。
//   - 沒有任何跨 app 的聚合檔：`--pages` 直接指向單一 app 的
//     pages.json，不需要先讀整份彙整資料再挑出其中一筆。
//   - 每個節點的 `component` 欄位對應 components.json 的 `id`，
//     用來查出 componentName / importPath，藉此在檔案開頭產生正確的具名 import。
//   - `children` 支援遞迴巢狀（component 節點或純文字字串混合），對應到 JSX 的 children。
//   - props 值目前僅支援基本型別 (string / number / boolean / null)，
//     會依型別分別輸出成 JSX attribute 字面量或 `{expr}` 形式。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// ---------- CLI 參數 ----------

function parseArgs(argv) {
  const args = {
    pages: null, // 未指定時，依 app 決定預設值：data/{app}/pages.json
    // components.json 由 packages/ui 的 `docs:generate`（scripts/generate-docs.mjs）
    // 產生，是文件生成套件（@workspace/ui）輸出的產物；web-builder 端不再保留
    // 自己的一份重複拷貝，預設直接指向 workspace 底下 packages/ui/data/components.json，
    // 避免兩處 components.json 各自過期、內容不一致。
    components: '../../packages/ui/data/components.json',
    out: 'src/pages/generated',
    app: 'default',
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pages') args.pages = argv[++i];
    else if (argv[i] === '--components') args.components = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--app') args.app = argv[++i];
  }
  if (args.pages == null) {
    args.pages = `data/${args.app}/pages.json`;
  }
  return args;
}

const cwd = process.cwd();
const args = parseArgs(process.argv.slice(2));
const pagesPath = path.resolve(cwd, args.pages);
const componentsPath = path.resolve(cwd, args.components);
const outDir = path.resolve(cwd, args.out);
const app = args.app;

// ---------- 讀取資料 ----------

function readJson(filePath, label) {
  if (!existsSync(filePath)) {
    console.error(`[generate-pages] 找不到${label}: ${filePath}`);
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`[generate-pages] ${label} 不是合法 JSON: ${filePath}`);
    console.error(err.message);
    process.exit(1);
  }
}

/**
 * 讀 pages.json 專用：檔案不存在時視為「這個 app 還沒有任何頁面」，
 * 回傳空陣列並繼續（而不是讓整個 build/dev 直接失敗）——新建 app、
 * 或第一次導入這套機制時，pages.json 本來就還沒被寫入過是正常狀態。
 * 檔案存在但不是合法 JSON 仍視為錯誤，直接中止（避免悄悄吃掉真正壞掉的資料）。
 */
function readPagesJsonWithDefault(filePath, label) {
  if (!existsSync(filePath)) {
    console.warn(`[generate-pages] 找不到${label}: ${filePath}，視為尚無頁面（[]）並繼續`);
    return [];
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`[generate-pages] ${label} 不是合法 JSON: ${filePath}`);
    console.error(err.message);
    process.exit(1);
  }
}

/** @typedef {{ id: string; componentName: string; importPath: string }} ComponentMeta */

/** @type {ComponentMeta[]} */
const componentsRaw = readJson(componentsPath, 'components.json');

/** @type {Map<string, ComponentMeta>} */
const componentById = new Map(componentsRaw.map((c) => [c.id, c]));

// pagesPath 直接指向單一 app 的 data/{app}/pages.json，
// 內容本身就是該 app 的 PageDef[]（不再是 { [app]: PageDef[] } 的彙整形狀）。
// 找不到檔案時視為「尚無頁面」，回傳 [] 並繼續（見 readPagesJsonWithDefault），
// 避免新建 app、或第一次跑這支腳本時，因為 pages.json 還沒被建立就整個失敗。
const pages = readPagesJsonWithDefault(pagesPath, `app "${app}" 的 pages.json`);

if (!Array.isArray(pages)) {
  console.error(`[generate-pages] "${pagesPath}" 的內容必須是陣列（多個頁面）`);
  process.exit(1);
}

// ---------- 工具函式 ----------

const VALID_ID_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** kebab-case id -> PascalCase 元件別名（給 import 重名時使用；一般直接用 componentName） */
function toIdentifier(str) {
  return str
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('');
}

/** 產生縮排字串 */
function indent(depth) {
  return '  '.repeat(depth);
}

/** 把 JS 字串正確跳脫成 JSX 文字節點內容（純文字節點直接輸出，不需特別跳脫，交由 JSX 處理即可） */
function escapeJsxText(text) {
  return text.replace(/[{}]/g, (ch) => (ch === '{' ? '&#123;' : '&#125;'));
}

/**
 * 把 JS 字串轉成合法的雙引號 JSX attribute 字串字面量。
 */
function jsStringLiteral(value) {
  return JSON.stringify(String(value));
}

/**
 * 依基本型別把單一 prop 轉成一段 `name="value"` 或 `name={value}` 字串。
 * 僅支援 string / number / boolean / null（如 spec 所述，其餘型別之後再擴充）。
 */
function renderProp(name, value) {
  if (!VALID_ID_RE.test(name)) {
    throw new Error(`不合法的 prop 名稱: "${name}"`);
  }
  if (value === null) {
    // null -> 顯式傳入 null
    return `${name}={null}`;
  }
  switch (typeof value) {
    case 'string':
      return `${name}=${jsStringLiteral(value)}`;
    case 'number':
      return `${name}={${JSON.stringify(value)}}`;
    case 'boolean':
      // true 可簡寫成純屬性名，但明確寫出比較不會誤導閱讀者
      return `${name}={${value}}`;
    default:
      throw new Error(
        `prop "${name}" 的值型別 "${typeof value}" 目前不支援（僅支援 string/number/boolean/null）`
      );
  }
}

/**
 * 遞迴把一個節點（component 節點或字串）轉成 JSX 原始碼字串。
 * @param {unknown} node
 * @param {number} depth 目前縮排深度
 * @param {Set<string>} usedComponentIds 用來收集這個頁面實際用到的 component id（給 import 用）
 * @returns {string}
 */
function renderNode(node, depth, usedComponentIds) {
  if (typeof node === 'string') {
    return `${indent(depth)}${escapeJsxText(node)}`;
  }

  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    throw new Error(`不合法的節點: ${JSON.stringify(node)}`);
  }

  const { component, props = {}, children } = node;

  if (!component || typeof component !== 'string') {
    throw new Error(`節點缺少 "component" 欄位: ${JSON.stringify(node)}`);
  }

  const meta = componentById.get(component);
  if (!meta) {
    throw new Error(
      `找不到 component id "${component}"，請確認 data/components.json 中存在此 id（先執行 npm run docs:generate）`
    );
  }

  usedComponentIds.add(component);

  // "children" 一律用節點自己的 `children` 陣列（→ JSX 子元素）表示，
  // 不透過 props 傳遞；若資料裡的 props 混入了 "children" 欄位（例如舊資料、
  // 手動編輯失誤），視為不合法，直接報錯，避免生成同時有
  // `children="..."` attribute 又有實際 JSX children 的錯誤輸出。
  if (props && Object.prototype.hasOwnProperty.call(props, 'children')) {
    throw new Error(
      `節點 "${component}" 的 props 不應包含 "children" 欄位，請改用節點的 "children" 陣列（JSX 子元素）: ${JSON.stringify(node)}`
    );
  }

  // 產生 props 字串（每個 prop 各自一行，方便 diff 閱讀）
  const propEntries = Object.entries(props ?? {});
  const propsStr = propEntries
    .map(([k, v]) => `${indent(depth + 1)}${renderProp(k, v)}`)
    .join('\n');

  const tag = meta.componentName;

  const hasChildren = Array.isArray(children) && children.length > 0;

  if (!hasChildren) {
    // 自閉合標籤
    if (propEntries.length === 0) {
      return `${indent(depth)}<${tag} />`;
    }
    return [`${indent(depth)}<${tag}`, propsStr, `${indent(depth)}/>`].join('\n');
  }

  const childrenStr = children
    .map((child) => renderNode(child, depth + 1, usedComponentIds))
    .join('\n');

  const openTag =
    propEntries.length === 0
      ? `${indent(depth)}<${tag}>`
      : [`${indent(depth)}<${tag}`, propsStr, `${indent(depth)}>`].join('\n');

  return [openTag, childrenStr, `${indent(depth)}</${tag}>`].join('\n');
}

/**
 * 產生單一頁面的完整 .tsx 原始碼。
 */
function renderPage(pageDef) {
  const { id, title, nodes } = pageDef;

  if (!id || typeof id !== 'string' || !VALID_ID_RE.test(toIdentifier(id))) {
    throw new Error(`頁面缺少合法的 "id": ${JSON.stringify(pageDef)}`);
  }
  if (!Array.isArray(nodes)) {
    throw new Error(`頁面 "${id}" 缺少 "nodes" 陣列`);
  }

  const usedComponentIds = new Set();
  const bodyStr = nodes
    .map((node) => renderNode(node, 3, usedComponentIds))
    .join('\n');

  // 依實際用到的 component 產生 import，並依 importPath 分組合併（避免同檔案(如 Card/CardHeader)重複 import 造成語法錯誤）
  /** @type {Map<string, Set<string>>} importPath -> Set<componentName> */
  const importsByPath = new Map();
  for (const cid of usedComponentIds) {
    const meta = componentById.get(cid);
    if (!importsByPath.has(meta.importPath)) {
      importsByPath.set(meta.importPath, new Set());
    }
    importsByPath.get(meta.importPath).add(meta.componentName);
  }

  const importLines = [...importsByPath.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([importPath, names]) => {
      const sortedNames = [...names].sort();
      // 範例組件（Avatar / Badge / Button / Card / Input / ui 基礎元件）現在收斂在
      // @workspace/ui 套件（packages/ui/src/components/**），不再是這個 app 自己的
      // src/components/**，因此改成從 @workspace/ui 匯入，而非本地 '@/'。
      return `import { ${sortedNames.join(', ')} } from '@workspace/ui/${importPath}';`;
    });

  const componentIdentifier = toIdentifier(id) + 'Page';
  const pageTitle = title ?? id;

  return `// 此檔案由 scripts/generate-pages.mjs 依 data/pages.json 自動產生，請勿手動編輯。
// 若要修改頁面內容，請編輯來源 JSON 後重新執行 \`npm run pages:generate\`。

${importLines.join('\n')}

/** ${pageTitle} */
export function ${componentIdentifier}() {
  return (
    <div className="mx-auto max-w-[720px] px-6 pt-8 pb-16" data-page-id="${id}">
      <h1>${escapeJsxText(pageTitle)}</h1>
${bodyStr}
    </div>
  );
}

export default ${componentIdentifier};
`;
}

/**
 * 產生 pages-map.ts：靜態、可被路由讀取的頁面清單 + import map。
 * 放在 outDir 的上一層（預設 src/pages/pages-map.ts），與 generated/ 平行，
 * 這樣 generated/ 整個目錄都可以視為「純產物、可安全整批覆寫」，
 * pages-map.ts 則是給 App.tsx 路由 import 的穩定入口。
 */
function renderPagesMap(generated) {
  const importLines = generated
    .map(
      ({ id }) =>
        `import { ${toIdentifier(id)}Page } from './generated/${id}';`
    )
    .join('\n');

  const entries = generated
    .map(({ id, title }) => {
      const comp = `${toIdentifier(id)}Page`;
      return `  { id: ${jsStringLiteral(id)}, path: ${jsStringLiteral(id)}, title: ${jsStringLiteral(
        title
      )}, Component: ${comp} },`;
    })
    .join('\n');

  return `// 此檔案由 scripts/generate-pages.mjs 自動產生，請勿手動編輯。
// 執行 \`npm run pages:generate\` 以重新產生。
//
// 提供路由（App.tsx）與任何導覽 UI 使用的靜態頁面清單。
// 每個 entry 的 Component 是直接 import 進來的（非 code-splitting）；
// 若之後想跟文件頁一樣做成 lazy load，可比照 component-map.ts 改成
// \`() => import('./generated/xxx')\` 並在路由端用 React.lazy 包裝。

import type { ComponentType } from 'react';
${importLines}

export interface GeneratedPageEntry {
  id: string;
  /** 相對於掛載路由的 path 片段，預設等同 id */
  path: string;
  title: string;
  Component: ComponentType;
}

export const generatedPages: GeneratedPageEntry[] = [
${entries}
];

export function getGeneratedPageById(id: string): GeneratedPageEntry | undefined {
  return generatedPages.find((p) => p.id === id);
}
`;
}

/**
 * 更新 src/App.tsx，把 pages-map.ts 的頁面清單掛進路由。
 * 採用「標記區塊」策略：只替換 BEGIN/END 註解之間的內容，
 * 若標記不存在（例如使用者已手動大改 App.tsx），則不動 App.tsx，
 * 只輸出一份範例檔供比對合併，避免破壞既有檔案。
 */
const APP_TSX_PATH = path.resolve(cwd, 'src/App.tsx');
const BEGIN_MARK = '{/* GENERATED_PAGES_ROUTES_BEGIN */}';
const END_MARK = '{/* GENERATED_PAGES_ROUTES_END */}';
const IMPORT_MARK_BEGIN = '// GENERATED_PAGES_IMPORT_BEGIN';
const IMPORT_MARK_END = '// GENERATED_PAGES_IMPORT_END';

function buildAppRouteSnippet() {
  return [
    `      {`,
    `        path: 'pages',`,
    `        children: generatedPages.map((page) => ({`,
    `          path: page.path,`,
    `          element: <page.Component />,`,
    `        })),`,
    `      },`,
  ].join('\n');
}

function updateAppRouting() {
  if (!existsSync(APP_TSX_PATH)) {
    console.warn('[generate-pages] 找不到 src/App.tsx，略過路由整合。');
    return;
  }

  let source = readFileSync(APP_TSX_PATH, 'utf-8');
  const hasImportMarks = source.includes(IMPORT_MARK_BEGIN) && source.includes(IMPORT_MARK_END);
  const hasRouteMarks = source.includes(BEGIN_MARK) && source.includes(END_MARK);

  if (!hasImportMarks || !hasRouteMarks) {
    console.warn(
      '[generate-pages] src/App.tsx 尚未包含自動整合標記，略過自動寫入。\n' +
        '  請參考產生的 src/App.generated-example.tsx，比對後手動合併。'
    );
    return;
  }

  const importSnippet = `${IMPORT_MARK_BEGIN}\nimport { generatedPages } from '@/pages/pages-map';\n${IMPORT_MARK_END}`;
  const routeSnippet = `${BEGIN_MARK}\n${buildAppRouteSnippet()}\n      ${END_MARK}`;

  source = source.replace(
    new RegExp(`${IMPORT_MARK_BEGIN}[\\s\\S]*?${IMPORT_MARK_END}`),
    importSnippet
  );
  source = source.replace(
    new RegExp(`${BEGIN_MARK}[\\s\\S]*?${END_MARK}`),
    routeSnippet
  );

  writeFileSync(APP_TSX_PATH, source, 'utf-8');
  console.log('[generate-pages] ✓ 已更新 src/App.tsx 的路由設定');
}

/**
 * 若 App.tsx 還沒有標記（第一次導入這套機制），
 * 額外輸出一份範例檔 src/App.generated-example.tsx，
 * 內含標記與整合方式，方便使用者比對後手動合併進真正的 App.tsx。
 */
function writeAppExampleIfNeeded() {
  if (!existsSync(APP_TSX_PATH)) return;
  const source = readFileSync(APP_TSX_PATH, 'utf-8');
  const hasMarks = source.includes(IMPORT_MARK_BEGIN) && source.includes(BEGIN_MARK);
  if (hasMarks) return;

  const example = `// 範例：如何把 generatedPages 整合進 App.tsx 的路由。
// 這個檔案不會被 import，純粹給你比對、手動合併用。
// 合併後記得保留下方的標記註解，之後每次 \`npm run pages:generate\`
// 就能自動更新這個區塊，不用手動維護。

import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from '@/pages/Layout';
import { Home } from '@/pages/Home';
import { ComponentDetail } from '@/pages/ComponentDetail';
${IMPORT_MARK_BEGIN}
import { generatedPages } from '@/pages/pages-map';
${IMPORT_MARK_END}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'components/:id', element: <ComponentDetail /> },
      ${BEGIN_MARK}
${buildAppRouteSnippet()}
      ${END_MARK}
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
`;

  const exampleTarget = path.resolve(cwd, 'src/App.generated-example.tsx');
  writeFileSync(exampleTarget, example, 'utf-8');
  console.log(
    `[generate-pages] ℹ 已產生 ${path.relative(cwd, exampleTarget)}，` +
      '請比對後手動合併進 src/App.tsx（合併時保留 GENERATED_PAGES_* 標記註解，之後即可自動更新）。'
  );
}

// ---------- 主流程 ----------

function main() {
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const seenIds = new Set();
  const generated = [];

  for (const pageDef of pages) {
    if (seenIds.has(pageDef.id)) {
      console.error(`[generate-pages] 重複的頁面 id: "${pageDef.id}"`);
      process.exit(1);
    }
    seenIds.add(pageDef.id);

    let source;
    try {
      source = renderPage(pageDef);
    } catch (err) {
      console.error(`[generate-pages] 產生頁面 "${pageDef.id ?? '(未知)'}" 失敗:`);
      console.error(`  ${err.message}`);
      process.exit(1);
    }

    const fileName = `${pageDef.id}.tsx`;
    const filePath = path.join(outDir, fileName);
    writeFileSync(filePath, source, 'utf-8');
    generated.push({ id: pageDef.id, title: pageDef.title ?? pageDef.id, file: path.relative(cwd, filePath) });
    console.log(`[generate-pages] ✓ ${path.relative(cwd, filePath)}`);
  }

  // pages-map.ts 放在 outDir 的上一層（預設 src/pages/）
  const pagesMapPath = path.join(outDir, '..', 'pages-map.ts');
  writeFileSync(pagesMapPath, renderPagesMap(generated), 'utf-8');
  console.log(`[generate-pages] ✓ ${path.relative(cwd, pagesMapPath)}`);

  writeAppExampleIfNeeded();
  updateAppRouting();

  console.log(`[generate-pages] 完成，共產生 ${generated.length} 個頁面於 ${path.relative(cwd, outDir)}/`);
}

main();
