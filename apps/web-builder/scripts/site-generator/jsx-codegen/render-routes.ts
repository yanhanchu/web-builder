// ============================================================
// render-routes —— 產生「路由清單」的原始碼，不是完整的 App 殼層。
//
// index.html / src/main.tsx / src/App.tsx（含 BrowserRouter、layout 等）
// 交給外部（例如 apps/web-builder 裡手寫的版本）自行維護，site-generator
// 不碰、也不產生這三個檔案——避免每次重新產生資料時，把使用者手動調整過
// 的殼層檔案蓋掉。
//
// 這裡只負責產出一個可以被外部 App.tsx import 的 <GeneratedRoutes />
// 元件，內容是 react-router 的 <Routes>，外部自己決定要包在哪個
// <BrowserRouter> / layout 底下：
//
//   // apps/web-builder/src/App.tsx（手寫，不受 site-generator 控制）
//   import { GeneratedRoutes } from "./generated/routes";
//   export function App() {
//     return (
//       <BrowserRouter>
//         <GeneratedRoutes />
//       </BrowserRouter>
//     );
//   }
//
// 語系與元件解耦（做法 A，見 render-page-split-jsx.ts 檔案開頭說明）：
// 頁面元件（pages/*.tsx）本身不 import 任何語系的資料，改成每個 Route 各自
// import 自己語系的資料檔案，再透過 `data={...}` prop 傳給共用的頁面元件。
// 同一個 page 有幾個語系的路由（見 plan-routes.ts 的規則），這裡就會產生
// 幾個 <Route>，但都指向同一個 import（同一份 pages/HomePage.tsx）。
// ============================================================

import type { PlannedRoute } from "../plan-routes";

/**
 * 單一 (page, locale) 需要 import 的一份資料檔案：具名 export 對應到某個
 * import 路徑。對應 data-file-writer.ts 的 renderDataFileContent()（多個
 * 具名 export 版本，例如 groupByComponentName 拆成 hero.ts / footer.ts）。
 *
 * 目前 render-routes.ts 預設走的是 RouteEntry.dataImportPath（單一 default
 * export，見下方），這個型別本身沒被拿掉——保留給未來如果需要「逐檔具名
 * import」的消費端使用（例如給人工瀏覽/比對用的輸出、或改用
 * groupByComponentName 分組策略時）。
 */
export interface RouteDataImport {
  /** import 路徑（不含副檔名），例如 "./data/en/home/data"。 */
  importPath: string;
  /** 這個路徑底下要 import 的具名 export 名稱清單，例如 ["hero", "ctaBanner"]。 */
  exportNames: string[];
}

export interface RouteEntry {
  planned: PlannedRoute;
  /** 頁面元件名稱，例如 "HomePage"（render-page-split-jsx.ts 回傳的 componentName）。 */
  componentName: string;
  /** 這個 codegen 檔案（routes.tsx）import 頁面元件的相對路徑（不含副檔名），例如 "./pages/HomePage"。 */
  componentImportPath: string;
  /** 對應的資料型別名稱，例如 "HomePageData"（render-page-split-jsx.ts 回傳的 dataTypeName）。找不到型別（純容器頁）時可省略。 */
  dataTypeName?: string;
  /** 型別所在模組的 import 路徑（跟頁面元件同一個檔案）。與 dataTypeName 同時提供或同時省略。 */
  dataTypeImportPath?: string;
  /**
   * 這個 (page, locale) 的資料檔案 import 路徑（不含副檔名），例如
   * "./data/en/home/data"。資料檔案本身具名 export 都保留（見
   * render-page-split-jsx.ts renderPageDataFiles() / data-file-writer.ts
   * renderDataFileNamedAndDefaultExport()），另外多了一個彙總所有欄位的
   * default export，routes.tsx 這裡一行 default import 就能拿到整包資料，
   * 不用逐欄位具名 import 再手動組回物件。undefined 代表這頁
   * 沒有任何純值 props（純容器頁，元件不吃 data prop）。
   */
  dataImportPath?: string;
  /**
   * 具名 export 版本（跟 dataImportPath 二選一，目前 renderRoutes() 只消費
   * dataImportPath；這個欄位保留給未來需要「逐欄位具名 import」的呼叫端，
   * 對應 renderDataFileContent() 產生的資料檔案）。
   */
  dataImports?: RouteDataImport[];
}

/**
 * 幫每個 (page, locale) 產生獨一無二的資料變數名，同時作為 default import
 * 的識別名本身（例如 "home_zh_TW"），避免不同語系/頁面的資料 import 撞名。
 */
function routeDataVarName(entry: RouteEntry): string {
  return `${entry.planned.resolved.page.id}_${entry.planned.resolved.locale}`.replace(/[^a-zA-Z0-9]/g, "_");
}

/**
 * 組出 routes.tsx 內容。範例（雙語系、home 頁）：
 *
 *   import { Route, Routes } from "react-router-dom";
 *   import HomePage from "./pages/HomePage";
 *   import type { HomePageData } from "./pages/HomePage";
 *   import home_zh_TW from "./data/zh-TW/home/data";
 *   import home_en from "./data/en/home/data";
 *
 *   export function GeneratedRoutes() {
 *     return (
 *       <Routes>
 *         <Route path="/" element={<HomePage data={(home_zh_TW satisfies HomePageData)} />} />
 *         <Route path="/en" element={<HomePage data={(home_en satisfies HomePageData)} />} />
 *       </Routes>
 *     );
 *   }
 *
 * entries 不在這裡排序去重：呼叫端（generate-split-jsx.ts）已經用
 * plan-routes.ts 的 planAllRoutes() 展開好完整清單（每個 page x locale
 * 一筆，依規則決定要不要加前綴），這裡只負責字串組裝，維持跟
 * render-page-split-jsx.ts / data-file-writer.ts 一致的「codegen 只管拼
 * 字串」分工原則。
 */
export function renderRoutes(entries: RouteEntry[]): string {
  // component import 依 componentImportPath 去重：同一個 page 出現在多個
  // 語系的 route 裡，元件只需要 import 一次（例如 HomePage 有 3 筆 route，
  // 但只應該有一行 `import HomePage from "./pages/HomePage";`）。
  const seenComponentImports = new Set<string>();
  const componentImportLines: string[] = [];
  for (const entry of entries) {
    const key = `${entry.componentImportPath}#${entry.componentName}`;
    if (seenComponentImports.has(key)) continue;
    seenComponentImports.add(key);
    componentImportLines.push(`import ${entry.componentName} from "${entry.componentImportPath}";`);
  }
  const componentImportsSource = componentImportLines.join("\n");

  // 型別 import 依 (componentName, dataTypeName) 去重：同一個 page 出現在
  // 多個語系的 route 裡，型別只需要 import 一次。
  const seenTypeImports = new Set<string>();
  const typeImportLines: string[] = [];
  for (const entry of entries) {
    if (!entry.dataTypeName || !entry.dataTypeImportPath) continue;
    const key = `${entry.dataTypeImportPath}#${entry.dataTypeName}`;
    if (seenTypeImports.has(key)) continue;
    seenTypeImports.add(key);
    typeImportLines.push(`import type { ${entry.dataTypeName} } from "${entry.dataTypeImportPath}";`);
  }
  const typeImportsSource = typeImportLines.join("\n");

  // 每個 route 各自 import 自己語系的資料檔案的彙總 default export（見
  // data-file-writer.ts renderDataFileNamedAndDefaultExport；該檔案本身
  // 具名 export 也都保留，但 routes.tsx 這裡只需要拿整包），變數名用
  // routeDataVarName 產生（例如 "home_zh_TW"），避免不同語系/頁面撞名。
  // 依 dataImportPath 去重：plan-routes.ts 的規則 2 會讓同一個
  // (page, locale) 出現在多筆 PlannedRoute 裡（例如 defaultLocale 的不帶
  // 前綴版本 + 帶前綴版本），資料檔案本身跟前綴無關，import 只需要一次，
  // 不然會重複 import 同一份 default export（重複的變數宣告）。
  const seenDataImports = new Set<string>();
  const dataImportLines: string[] = [];
  for (const entry of entries) {
    if (!entry.dataImportPath) continue;
    if (seenDataImports.has(entry.dataImportPath)) continue;
    seenDataImports.add(entry.dataImportPath);
    const varName = routeDataVarName(entry);
    dataImportLines.push(`import ${varName} from "${entry.dataImportPath}";`);
  }
  const dataImportsSource = dataImportLines.join("\n");

  const importsSource = [componentImportsSource, typeImportsSource, dataImportsSource]
    .filter(Boolean)
    .join("\n");

  const routesSource = entries
    .map((entry) => {
      const path = JSON.stringify(entry.planned.resolved.urlPath);
      if (!entry.dataImportPath) {
        // 純容器頁（沒有任何純值 props）：不需要 data prop。
        return `        <Route path=${path} element={<${entry.componentName} />} />`;
      }
      const varName = routeDataVarName(entry);
      // 直接引用 default import 的整包資料，`satisfies` 表達式外層要多包一層
      // 括號（`(varName satisfies Type)`），否則 JSX attribute expression
      // 裡的 `satisfies` 會被解析成型別註記而非值表達式。
      const dataExpr = entry.dataTypeName ? `(${varName} satisfies ${entry.dataTypeName})` : varName;
      return `        <Route path=${path} element={<${entry.componentName} data={${dataExpr}} />} />`;
    })
    .join("\n");

  return `// ============================================================
// 此檔案由 site-generator（apps/site-generator/src/jsx-codegen/render-routes.ts）
// 自動產生，請勿手動編輯——重新執行產生器即會覆蓋這裡的內容（連同這個檔案
// 所在的整個資料夾）。
//
// 只是路由清單，不含 BrowserRouter：外部 App.tsx 自行 import
// <GeneratedRoutes /> 並決定要包在哪個 <BrowserRouter> / layout 底下。
//
// route 清單來源：plan-routes.ts 算出的 PlannedRoute[]（單語系不加前綴；
// 多語系則 defaultLocale 產生不帶前綴的第一層 + 所有語系各自帶前綴的
// 第二層，見 plan-routes.ts 開頭說明）。頁面元件（pages/*.tsx）本身跟語系
// 無關，每個 Route 各自 import 對應語系的資料檔案，透過 data prop 傳入。
// ============================================================

import { Route, Routes } from "react-router-dom";
${importsSource ? `${importsSource}\n` : ""}
export function GeneratedRoutes() {
  return (
    <Routes>
${routesSource}
    </Routes>
  );
}
`;
}