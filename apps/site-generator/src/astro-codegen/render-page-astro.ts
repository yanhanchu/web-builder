// ============================================================
// render-page-astro —— 單一 (page, locale) 產出「一份 .astro 頁面檔案 +
// 一份 data.ts 資料檔案」。
//
// 跟 render-page-split-jsx.ts（React 版）最大的差異：Astro 只有 file-based
// route，沒有 react-router 那種「一份元件 + 多個 <Route> 各自傳 data prop」
// 的做法（見 render-page-split-jsx.ts「做法 A」的說明）——每個 (page, locale)
// 都要落地成一個獨立的 .astro 檔案（即使兩個語系版面結構完全一樣）。
// 所以這裡採「做法 B」：
//
//   - 頁面結構（用了哪些組件、巢狀關係、client:* 指令）跟語系無關，只跟
//     page.blocks 本身有關；但因為 Astro 沒有「一份元件給多個路由重用」
//     這種機制，只能每個 (page, locale) 各自產生一份完整的 .astro 檔案
//     （structure 重複，但每份檔案都是獨立、單純的靜態產物，不需要執行期
//     共用邏輯——這是 Astro file-route 模型下最直接的做法）。
//   - 資料本身（data.ts）維持跟 React 版一樣，各個 varName 各自 export，
//     `.astro` frontmatter 用具名 import 取用，模板部份用 `{...hero}` 這種
//     spread 語法接上（Astro template 語法允許 JSX 風格的 spread）。
//
// 範例輸出（precis 版，對照 roadmap 的參考結構）：
//
//   ---
//   import Layout from "@workspace/ui/components/landing1/layout";
//   import Hero from "@workspace/ui/components/landing1/hero";
//   import ValueProps from "@workspace/ui/components/landing1/value-props";
//   import CtaBanner from "@workspace/ui/components/landing1/cta-banner";
//   import { header, footer, hero, valueProps, ctaBanner } from "./data";
//   ---
//   <Layout header={header} footer={footer}>
//     <Hero {...hero} />
//     <ValueProps {...valueProps} />
//     <CtaBanner {...ctaBanner} />
//   </Layout>
//
// i18n 值怎麼塞（下一版再處理）：這一版先把每個 (page, locale) resolve 成
// 純值（跟 React split-jsx 版一樣的做法），每個語系各自一份 data.ts + 各自
// 一份 .astro 檔案（結構重複但單純）。下一版如果要改成「同一份 .astro
// 搭配 Astro i18n routing + 執行期用 Astro.currentLocale 選字典」，只需要
// 換掉這個檔案跟 generate-astro.ts 的產出邏輯，plan-routes.ts /
// resolve-route.ts / load-static-data.ts 完全不用動。
// ============================================================

import type { DataStore } from "@workspace/ui/lib/data-model/schema";
import type { PageItem } from "@workspace/ui/lib/page-model";
import { ImportCollector } from "../jsx-codegen/import-collector";
import { VarNameAllocator } from "../jsx-codegen/var-naming";
import { stringifyLiteralValue } from "../jsx-codegen/stringify-literal";
import type { DataExport } from "../jsx-codegen/render-block-tree-to-split-jsx";
import { walkBlockListToAstro } from "./render-block-tree-to-astro";

export interface RenderPageAstroOptions {
  page: PageItem;
  locale: string;
  /** 站台的預設語系，見 render-block-tree-to-split-jsx.ts 同名欄位說明。 */
  defaultLocale: string;
  store: DataStore;
  /**
   * `.astro` 檔案 import data.ts 用的相對路徑（不含副檔名），例如
   * "./_data/about/data"。data.ts 實際落在哪裡由呼叫端（generate-astro.ts）
   * 決定——Astro file route 的檔案路徑本身就是 URL（`pages/about.astro` ->
   * `/about`），data.ts 不能跟它同名放在同一層（會被誤認成另一個路由），
   * 所以呼叫端會把資料檔案放到平行的子目錄（例如 `pages/_data/about/data.ts`），
   * 這裡不假設固定是 "./data"，交由呼叫端算好相對路徑傳進來。
   * 沒有任何純值 props（純容器頁）時可省略，這種情況下這個頁面本來就不會
   * 有 data.ts、也不需要這個 import。
   */
  dataImportPath?: string;
}

export interface RenderedPageAstro {
  /** `.astro` 檔案內容：frontmatter（imports）+ template（block tree）。 */
  astroCode: string;
  /** 這個 (page, locale) 對應的 data.ts 內容；沒有任何純值 props（純容器頁）時為 undefined，代表不需要 data.ts。 */
  dataCode?: string;
  warnings: string[];
}

/** 跟 data-file-writer.ts 的 renderDataFileContent() 邏輯一致（多個具名 export、無彙總 default export），
 * Astro 版資料檔案不需要 `satisfies HomePageData` 這種彙總型別——.astro 檔案本身沒有一個「頁面 data prop
 * 型別」需要標注（做法 B 底下，每個具名 export 直接被 frontmatter import 使用，型別各自標注即可）。 */
function renderAstroDataFile(dataExports: DataExport[], headerComment: string): string {
  const typeImports = new ImportCollector();
  for (const exp of dataExports) {
    if (exp.propsTypeName) {
      typeImports.add(exp.propsTypeImportPath, exp.propsTypeName);
    }
  }
  const typeImportsSource = typeImports.render({ typeOnly: true });

  const body = dataExports
    .map((exp) => {
      const typeAnnotation = exp.propsTypeName
        ? exp.omittedPropKeys.length > 0
          ? `: Omit<${exp.propsTypeName}, ${exp.omittedPropKeys.map((k) => JSON.stringify(k)).join(" | ")}>`
          : `: ${exp.propsTypeName}`
        : "";
      const valueSource = stringifyLiteralValue(exp.value, 0);
      return `export const ${exp.varName}${typeAnnotation} = ${valueSource};`;
    })
    .join("\n\n");

  const importsBlock = typeImportsSource ? `${typeImportsSource}\n\n` : "";

  return `${headerComment}\n\n${importsBlock}${body}\n`;
}

/**
 * 產出一個 (page, locale) 對應的「.astro 頁面檔案 + data.ts」。
 *
 * Astro frontmatter（`---` 圍住的區塊）等同 React 版的 import 區段；
 * template 部份沿用 walkBlockListToAstro() 產生的片段，直接 `{...varName}`
 * 引用 frontmatter 裡 import 進來的資料，寫法跟 React JSX 幾乎一致
 * （Astro template 語法本來就支援 spread attribute）。
 */
export function renderPageAstro(options: RenderPageAstroOptions): RenderedPageAstro {
  const { page, locale, defaultLocale, store, dataImportPath } = options;
  const warnings: string[] = [];
  const componentImports = new ImportCollector();
  const varNames = new VarNameAllocator();

  const { template: bodyTemplate, dataExports, isEmpty } = walkBlockListToAstro(
    page.blocks,
    {
      locale,
      defaultLocale,
      store,
      componentImports,
      varNames,
      onWarning: (message) => warnings.push(`[${page.id}/${locale}] ${message}`),
    },
    0,
  );

  // Astro 組件 import 用 default import 風格（`import Hero from "..."`），
  // 對照 @workspace/ui 組件模組實際是具名 export（`export function Hero`），
  // 這裡刻意沿用 React 版一致的具名 import 寫法（`import { Hero } from "..."`）
  // ——Astro 對兩種寫法都支援，具名 import 跟組件原始碼的實際 export 型式
  // 一致，不需要額外包一層 default re-export。
  const componentImportsSource = componentImports.render();

  const dataVarNames = dataExports.map((e) => e.varName);
  const dataImportSource =
    dataVarNames.length > 0 && dataImportPath
      ? `import { ${dataVarNames.join(", ")} } from "${dataImportPath}";`
      : "";

  const frontmatterLines = [componentImportsSource, dataImportSource].filter(Boolean).join("\n");

  const bodyOut = isEmpty ? "<Fragment></Fragment>" : bodyTemplate;

  const astroCode = `---
// ============================================================
// 此檔案由 site-generator（apps/site-generator/src/astro-codegen/render-page-astro.ts）
// 自動產生，請勿手動編輯——重新執行產生器即會覆蓋這裡的內容。
//
// 來源頁面：${page.id}（${page.name}） · 語系：${locale}
// 資料來源：${dataImportPath ?? "（此頁沒有任何純值 props，不需要資料檔案）"}
// client:* 指令依 page.blocks 各自的 clientDirective 欄位產生（見
// astro-codegen/render-block-tree-to-astro.ts 的 clientDirectiveAttr()）。
// ============================================================
${frontmatterLines ? `\n${frontmatterLines}\n` : ""}---

${bodyOut}
`;

  const dataCode =
    dataExports.length > 0
      ? renderAstroDataFile(
          dataExports,
          `// ============================================================
// 此檔案由 site-generator（apps/site-generator/src/astro-codegen/render-page-astro.ts）
// 自動產生，請勿手動編輯——重新執行產生器即會覆蓋這裡的內容。
//
// 來源頁面：${page.id}（${page.name}） · 語系：${locale}（resolved 純值，
// 此檔案不含任何 i18n/resolve 邏輯——之後要接 i18n 執行期字典時，這裡是
// 需要換掉的地方，其餘 codegen 不受影響）。
// ============================================================`,
        )
      : undefined;

  return { astroCode, dataCode, warnings };
}
