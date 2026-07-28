import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { uploadDevPlugin } from "./server/upload-dev-plugin";
import { dataExportDevPlugin } from "./server/data-export-dev-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), uploadDevPlugin(), dataExportDevPlugin()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@workspace/ui": path.resolve(__dirname, "../../packages/ui/src"),
    },
  },
});