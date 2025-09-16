import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
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
  tsconfig: "./tsconfig.json",
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production")
  },
  noExternal: []
});