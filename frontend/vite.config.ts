import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "solar-charge-card.ts",
      formats: ["es"],
      fileName: () => "solar-charge-card.js",
    },
    outDir: "../custom_components/solar_charge/frontend",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
