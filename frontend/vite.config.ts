import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "solar-charge-card.ts",
      formats: ["es"],
      fileName: () => "solar-charge-card.js",
    },
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
