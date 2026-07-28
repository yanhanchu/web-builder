#!/usr/bin/env node
// ============================================================
// cli-jsx —— Node 進入點（.tsx 輸出版）
//
// 用法：
//   node ./src/cli-jsx.ts [--data <路徑>] [--out <路徑>]
//
// 預設值：
//   --data  ../../data     （相對於 apps/site-generator，也就是 monorepo 根目錄的 data/）
//   --out   ./dist-jsx     （跟既有 cli.ts 的 ./dist 分開，避免兩種輸出互相覆蓋）
//
// 這是 roadmap.md 全新的第二個進入點，跟既有 cli.ts（HTML 輸出）平行存在、
// 互不影響：cli.ts 呼叫 generate()（renderPage，輸出 HTML），這裡呼叫
// generateJsx()（renderPageJsx / renderPageData，輸出 .tsx + JSON）。
// 只負責參數解析與 exit code，實際邏輯都在 generate-jsx.ts。
// ============================================================

import path from "node:path";
import { generateJsx } from "./generate-jsx.ts";

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
  const dataDir = path.resolve(import.meta.dirname, args.dataDir ?? "../../../data");
  const outDir = path.resolve(import.meta.dirname, args.outDir ?? "../dist-jsx");

  const result = await generateJsx({ dataDir, outDir });

  if (result.warnings.length > 0) {
    console.log(`\n完成，但有 ${result.warnings.length} 則警告：`);
    for (const w of result.warnings) console.log(`  - ${w}`);
  }
  console.log(`\n輸出目錄：${outDir}`);
  console.log(`共 ${result.pages.length} 份 .tsx、${result.dataFiles.length} 份資料 JSON。`);
}

main().catch((err) => {
  console.error("site-generator（.tsx 輸出）執行失敗：");
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
