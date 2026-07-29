#!/usr/bin/env node
// ============================================================
// cli-split-jsx —— Node 進入點（.tsx + 拆開的資料檔案版）
//
// 用法：
//   node ./src/cli-split-jsx.ts [--data <路徑>] [--out <路徑>] [--group <all-in-one|by-component>]
//
// 預設值：
//   --data   ../../data           （相對於 apps/site-generator，也就是 monorepo 根目錄的 data/）
//   --out    ./dist              （產出目錄）
//   --group  all-in-one           （整頁一份資料檔案；改成 by-component 則每個組件名稱各自一份）
//
// 只負責參數解析與 exit code，實際邏輯都在 generate-split-jsx.ts。
// ============================================================

import path from "node:path";
import { generateSplitJsx } from "./generate-split-jsx.ts";

function parseArgs(argv: string[]): { dataDir?: string; outDir?: string; group?: "all-in-one" | "by-component" } {
  const result: { dataDir?: string; outDir?: string; group?: "all-in-one" | "by-component" } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--data") result.dataDir = argv[++i];
    else if (arg === "--out") result.outDir = argv[++i];
    else if (arg === "--group") result.group = argv[++i] as "all-in-one" | "by-component";
    else if (arg.startsWith("--data=")) result.dataDir = arg.slice("--data=".length);
    else if (arg.startsWith("--out=")) result.outDir = arg.slice("--out=".length);
    else if (arg.startsWith("--group=")) result.group = arg.slice("--group=".length) as "all-in-one" | "by-component";
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = path.resolve(import.meta.dirname, args.dataDir ?? "../../../data");
  const outDir = path.resolve(import.meta.dirname, args.outDir ?? "../dist");
  const dataFileGrouping = args.group ?? "all-in-one";

  const result = await generateSplitJsx({ dataDir, outDir, dataFileGrouping });

  if (result.warnings.length > 0) {
    console.log(`\n完成，但有 ${result.warnings.length} 則警告：`);
    for (const w of result.warnings) console.log(`  - ${w}`);
  }
  console.log(`\n輸出目錄：${outDir}`);
  console.log(`共 ${result.pages.length} 份 .tsx、${result.dataFiles.length} 份資料檔案。`);
}

main().catch((err) => {
  console.error("site-generator（.tsx + 拆分資料輸出）執行失敗：");
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
