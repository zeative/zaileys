import { defineConfig } from 'tsup';
import pkg from './package.json' assert { type: 'json' };

const banner = `
/*
 * Copyright (c) ${new Date().getFullYear()} Zeative Media.
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
  dts: true,
  splitting: false,
  clean: true,
  minify: true,
  outDir: 'dist',
  sourcemap: false,
  treeshake: true,
  legacyOutput: false,
  shims: true,
  banner: {
    js: banner,
  },
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.js' : '.mjs',
    };
  },
  tsconfig: './tsconfig.json',
  noExternal: [],
});
