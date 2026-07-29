#!/usr/bin/env node
// ============================================================
// cli-astro —— Node 進入點（Astro 版）
//
// 用法：
//   node ./scripts/site-generator/cli-astro.ts [--data <路徑>] [--out <路徑>]
//
// 預設值：
//   --data   ../../../data/default   （相對於 apps/web-builder/scripts/site-generator，
//                                       也就是 monorepo 根目錄的 data/default）
//   --out    ../../dist/astro         （產出目錄，每次執行採「覆蓋」寫入：只會
//                                   建立/覆寫這次產出涵蓋到的檔案，不會整個
//                                   清空重建，目錄底下既有但這次未涵蓋到的
//                                   檔案會被原樣保留——請指到獨立資料夾，
//                                   例如 Astro 專案的 src/ 目錄，例如
//                                   apps/astro-site/src，不要跟手寫的
//                                   astro.config.mjs / layouts 混放）
//
// 產出佈局（詳見 generate-astro.ts 開頭說明）：
//   pages/[lang]/*.astro         每個 page 一份，語系無關，[lang] 只是 Astro
//                                 動態路由片段的字面目錄名稱，不會被替換成
//                                 實際語系；實際語系清單由檔案內
//                                 getStaticPaths()（SSG 腳本）在建置期展開。
//   data/<locale>/<page>/data.ts 逐語系各自一份，內容完全沿用 React
//                                 split-jsx 版的 renderPageDataFiles()。
//
// 只負責參數解析與 exit code，實際邏輯都在 generate-astro.ts。
// ============================================================

import path from "node:path";
import { generateAstro } from "./generate-astro.ts";

function parseArgs(argv: string[]): { dataDir?: string; outDir?: string } {
  const result: { dataDir?: string; outDir?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--data") result.dataDir = argv[++i];
    else if (arg === "--out") result.outDir = argv[++i];
    else if (arg.startsWith("--data=")) result.dataDir = arg.slice("--data=".length);
    else if (arg.startsWith("--out=")) result.outDir = arg.slice("--out=".length);
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = path.resolve(import.meta.dirname, args.dataDir ?? "../../../../data/default");
  // --out 可以是相對路徑（相對於 apps/web-builder/scripts/site-generator）或絕對路徑，
  // 例如 --out ../../../astro-site/src 直接指到 Astro 專案的 src/ 目錄。
  // 注意：此目錄採覆蓋寫入，不會整個清空重建（見上方說明）。
  const outDir = path.resolve(import.meta.dirname, args.outDir ?? "../../dist/astro");

  const result = await generateAstro({ dataDir, outDir });

  if (result.warnings.length > 0) {
    console.log(`\n完成，但有 ${result.warnings.length} 則警告：`);
    for (const w of result.warnings) console.log(`  - ${w}`);
  }
  console.log(`\n輸出目錄：${outDir}`);
  console.log(`共 ${result.pages.length} 份 .astro、${result.dataFiles.length} 份 data.ts。`);
  console.log(`樣式：${result.generatedFiles.styles}`);
}

main().catch((err) => {
  console.error("site-generator（Astro 版）執行失敗：");
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
