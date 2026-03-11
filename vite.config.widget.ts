import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/widget/main.ts",
      name: "SensAI",
      fileName: "sensai-widget",
      formats: ["iife"],
    },
    outDir: "dist-widget",
    emptyOutDir: true,
    minify: "esbuild",
  },
});
