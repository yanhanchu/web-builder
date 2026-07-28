#!/usr/bin/env node
// ============================================================
// cli —— Node 進入點
//
// 用法：
//   node ./src/cli.ts [--data <路徑>] [--out <路徑>]
//
// 預設值：
//   --data  ../../data        （相對於 apps/site-generator，也就是 monorepo 根目錄的 data/）
//   --out   ./dist
//
// 這個檔案只負責參數解析與 exit code，實際邏輯都在 generate.ts。
// ============================================================

import path from "node:path";
import { generate } from "./generate.ts";

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
  const outDir = path.resolve(import.meta.dirname, args.outDir ?? "../dist");

  const result = await generate({ dataDir, outDir });

  if (result.warnings.length > 0) {
    console.log(`\n完成，但有 ${result.warnings.length} 則警告：`);
    for (const w of result.warnings) console.log(`  - ${w}`);
  }
  console.log(`\n輸出目錄：${outDir}`);
  console.log(`共 ${result.routes.length} 個頁面。`);
}

main().catch((err) => {
  console.error("site-generator 執行失敗：");
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
