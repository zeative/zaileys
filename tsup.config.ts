import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  clean: true,
  minify: false, // Disable minification to reduce memory usage
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
  // Reduce memory consumption
  tsconfig: "./tsconfig.json",
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production")
  },
  // Skip bundling type-only imports to reduce memory usage
  noExternal: []
});