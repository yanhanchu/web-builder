#!/usr/bin/env node
// scripts/generate-pages.mjs
//
// 讀取 data/{app}/pages.json（該 app 底下的頁面陣列，每頁內容由
// 組件節點遞迴組成），對照 data/components.json（由 generate-docs.mjs 產生的
// 組件描述檔），靜態生成實際可執行的 .tsx 頁面檔到 data/{app}/pages/。
//
// 用法：
//   node scripts/generate-pages.mjs                        # 產生「default」app
//   node scripts/generate-pages.mjs --app marketing  # 產生指定 app
//   node scripts/generate-pages.mjs --pages ./data/marketing/pages.json --out ./data/marketing/pages
//
// 設計重點：
//   - 完全 build-time：輸出的是普通 .tsx 原始碼，不含任何 runtime JSON 解析或動態 import。
//   - 資料配置是「一個 app = 一個資料夾」：data/{app}/pages.json 為來源，
//     產物 data/{app}/pages/*.tsx 與 data/{app}/pages-map.ts 同樣依 app 各自存放，
//     跟 i18n 管理頁面（data/{app}/i18n/{locale}.json）的 app 概念一致。
//   - 每個 app 的產物互相獨立：`--pages` 直接指向單一 app 的
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
    out: null, // 未指定時，依 app 決定預設值：data/{app}/pages
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
  if (args.out == null) {
    args.out = `data/${args.app}/pages`;
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

/**
 * 還原 `data/{app}/pages.json` 寫檔時附加的 __i18n/__text 標註（純粹給人讀
 * pages.json 用，見 scripts/write-pages.mjs 的 annotateNodesWithI18n /
 * src/lib/pages-i18n-annotations.ts），生成靜態頁面之前先拿掉，避免
 * `__i18n`（一個物件）被當成一般 prop 傳給 renderProp 而噴出「型別不支援」。
 */
function stripI18nAnnotations(nodes) {
  return nodes.map((node) => {
    if (typeof node === 'string') return node;
    if (node && typeof node === 'object' && '__text' in node && '__i18nKey' in node) {
      return node.__text;
    }
    const next = { ...node };
    if (next.props && typeof next.props === 'object' && '__i18n' in next.props) {
      const { __i18n, ...restProps } = next.props;
      next.props = restProps;
    }
    if (Array.isArray(next.children)) {
      next.children = stripI18nAnnotations(next.children);
    }
    return next;
  });
}

// pagesPath 直接指向單一 app 的 data/{app}/pages.json，
// 內容本身就是該 app 的 PageDef[]（不再是 { [app]: PageDef[] } 的彙整形狀）。
// 找不到檔案時視為「尚無頁面」，回傳 [] 並繼續（見 readPagesJsonWithDefault），
// 避免新建 app、或第一次跑這支腳本時，因為 pages.json 還沒被建立就整個失敗。
const rawPages = readPagesJsonWithDefault(pagesPath, `app "${app}" 的 pages.json`);
const pages = Array.isArray(rawPages)
  ? rawPages.map((page) => ({
      ...page,
      nodes: Array.isArray(page.nodes) ? stripI18nAnnotations(page.nodes) : page.nodes,
    }))
  : rawPages;

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

  return `// 此檔案由 scripts/generate-pages.mjs 依 data/${app}/pages.json 自動產生，請勿手動編輯。
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
 * 產生 data/{app}/pages-map.ts：靜態、可被路由讀取的頁面清單 + import map。
 * 跟 data/{app}/pages/*.tsx 放在同一層（皆屬於這個 app 的產物），
 * 由 src/pages/generated-pages-map.ts 用 import.meta.glob 依 app 動態彙整。
 */
function renderPagesMap(generated) {
  const importLines = generated
    .map(
      ({ id }) =>
        `import { ${toIdentifier(id)}Page } from './pages/${id}';`
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
// 這個 app 底下 build-time 產生的靜態頁面清單，由
// src/pages/generated-pages-map.ts 依目前選定的 app 動態讀取。
// 每個 entry 的 Component 是直接 import 進來的（非 code-splitting）。

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

  // pages-map.ts 跟 outDir（data/{app}/pages/）放在同一層，即 data/{app}/pages-map.ts
  const pagesMapPath = path.join(outDir, '..', 'pages-map.ts');
  writeFileSync(pagesMapPath, renderPagesMap(generated), 'utf-8');
  console.log(`[generate-pages] ✓ ${path.relative(cwd, pagesMapPath)}`);

  console.log(`[generate-pages] 完成，共產生 ${generated.length} 個頁面於 ${path.relative(cwd, outDir)}/`);
}

main();
