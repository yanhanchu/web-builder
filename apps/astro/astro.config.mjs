import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
  output: "static",
  compressHTML: false,
  //publicDir: `./astro/${name}/public`,
  //srcDir: srcDir,
  //outDir: `./dist/${name}`,
  prefetch: {
    //prefetchAll: true,
    //defaultStrategy: "hover",
  },
  integrations: [react(), sitemap()],
  // Astro 底層本身就是用 Vite 建置，這裡透過 vite 欄位擴充原生 Vite 設定，
  // 接上 monorepo 內的 @workspace/ui（樣式 / utils / 元件）與 Tailwind v4。
  vite: {
    //envDir: `./astro/${name}`,
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@workspace/ui": path.resolve(__dirname, "../../packages/ui/src"),
      },
    },
    build: {
      // cssMinify: true,
      // minify: "esbuild",
      // rollupOptions: {
      //   output: {
      //     //experimentalMinChunkSize: 24 * 1024,
      //   },
      // },
    },
  },
});
