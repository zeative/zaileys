import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  clean: true,
  minify: "terser",
  outDir: "dist",
  sourcemap: false,
  treeshake: true,
  legacyOutput: false,
  shims: true,
  noExternal: ["libsignal"],
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".mjs",
    };
  },
});
