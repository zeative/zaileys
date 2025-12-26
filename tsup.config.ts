import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  outDir: "dist",

  dts: true,
  splitting: false,
  clean: true,
  minify: true,
  sourcemap: false,
  treeshake: true,
  legacyOutput: false,
  shims: true,

  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".js" : ".mjs",
    };
  },

  noExternal: [],
});
