import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, "src/content.ts"),
      output: {
        entryFileNames: "content.js",
        format: "iife",
        inlineDynamicImports: true,
      },
    },
  },
});
