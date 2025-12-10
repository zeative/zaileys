import { defineConfig } from 'tsup';
import pkg from './package.json' assert { type: 'json' };

const banner = `
/*
 * Copyright (c) ${new Date().getFullYear()} zaadevofc.
 * All rights reserved.
 * Licensed under the MIT License.
 * See LICENSE file for details.

 * Author: zaadevofc
 * Last build time: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
 * 
 * Repository: ${pkg.repository.url}
 */
`;

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  outDir: 'dist',

  dts: true,
  splitting: false,
  clean: true,
  minify: true,
  sourcemap: false,
  treeshake: true,
  legacyOutput: false,
  shims: true,

  footer: {
    js: banner,
  },

  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.js' : '.mjs',
    };
  },

  // tsconfig: './tsconfig.json',
  noExternal: [],
});
