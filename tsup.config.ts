import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  outDir: 'dist',
  target: 'es2022',
  platform: 'node',

  tsconfig: './tsconfig.build.json',

  dts: true,
  sourcemap: true,
  treeshake: true,
  splitting: false,
  minify: false,
  clean: true,
  shims: false,
  legacyOutput: false,
  skipNodeModulesBundle: true,

  external: [
    'baileys',
    'whatsapp-rust-bridge',
    'pino',
    'libsignal',
    'qrcode-terminal',
    'nanospinner',
    'audio-decode',
    'lru-cache',
    'async-mutex',
    'valibot',
    '@zaileys/media-process',
  ],

  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.mjs' }
  },

  esbuildOptions(options) {
    options.conditions = ['node', 'import', 'default']
  },
})
