/**
 * 批次解析 src/components/**\/*.tsx，
 * 使用 react-docgen-typescript 抽取 props / 型別 / JSDoc 說明，
 * 輸出：
 *  - data/components.json                              給靜態頁面生成用
 *  - src/lib/generator/component-map.ts    給動態 import 用（webpack/vite 需要靜態可分析路徑）
 */
import { withCustomConfig } from 'react-docgen-typescript';
import { globSync } from 'glob';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TSCONFIG_PATH = path.join(ROOT, 'tsconfig.app.json');
// src/components/**  → 文件系統要解析的範例組件本體 + ui 基礎元件（generator 的資料來源）
const COMPONENTS_GLOBS = ['src/components/**/*.tsx'];
const OUTPUT_JSON = path.join(ROOT, 'data', 'components.json');
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
  if (type.length <= max) return type;
  return type.slice(0, max - 1) + '…';
}

function toSlug(str) {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function main() {
  const files = globSync(COMPONENTS_GLOBS, {
    cwd: ROOT,
    ignore: ['**/*.stories.tsx', '**/*.test.tsx', '**/*.spec.tsx'],
  }).sort();

  if (files.length === 0) {
    console.warn(`⚠️  在 ${COMPONENTS_GLOBS.join(', ')} 找不到任何檔案`);
  }

  /** @type {any[]} */
  const results = [];
  const failures = [];

  for (const relFile of files) {
    const absFile = path.join(ROOT, relFile);
    try {
      const docs = parser.parse(absFile);

      for (const doc of docs) {
        // 略過沒有解析出任何 props、且沒有 displayName 的雜訊結果
        if (!doc.displayName) continue;

        const importPath = relFile
          .replace(/^src\//, '')
          .replace(/\.tsx$/, '');

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
              // 一般型別（string / boolean / ReactNode...）沒有 raw，就退回 name。
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

  console.log(`✅ 解析完成：${results.length} 個組件（來自 ${files.length} 個檔案）`);
  console.log(`   → ${path.relative(ROOT, OUTPUT_JSON)}`);
  console.log(`   → ${path.relative(ROOT, OUTPUT_MAP)}`);

  if (failures.length > 0) {
    console.warn(`\n⚠️  ${failures.length} 個檔案解析失敗：`);
    for (const f of failures) {
      console.warn(`   - ${f.file}: ${f.message}`);
    }
  }
}

main();
