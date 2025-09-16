import { defineConfig } from "tsup";

// Configuration for JavaScript build only (no dts)
export const jsConfig = defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: false, // No declaration files in this step
  splitting: false,
  clean: true,
  minify: false,
  outDir: "dist",
  sourcemap: false,
  treeshake: true,
  legacyOutput: false,
  shims: true,
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".js" : ".mjs",
    };
  },
});

// Configuration for declaration files only
export const dtsConfig = defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"], // Only need one format for dts
  dts: {
    resolve: true,
    only: true // Only generate declaration files
  },
  clean: false, // Don't clean as we already built JS files
  outDir: "dist",
  treeshake: true,
  legacyOutput: false,
  shims: true,
});

export default defineConfig([
  jsConfig,
  dtsConfig
]);