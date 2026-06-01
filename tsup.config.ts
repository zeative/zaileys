import { builtinModules } from 'node:module'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  outDir: 'dist',
  target: 'es2022',
  platform: 'node',

  tsconfig: './tsconfig.build.json',

  dts: true,
  // No sourcemaps in the published package — they reference src/ (not published),
  // so they add ~1.2MB of dead weight for consumers without being resolvable.
  sourcemap: false,
  treeshake: true,
  splitting: false,
  minify: true,
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
    'sharp',
    '@zaileys/media-process',
  ],

  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.mjs' }
  },

  esbuildOptions(options) {
    options.conditions = ['node', 'import', 'default']
  },

  async onSuccess() {
    const { readFile, writeFile } = await import('node:fs/promises')
    const names = [...builtinModules].filter((n) => !n.startsWith('_')).sort((a, b) => b.length - a.length)
    for (const file of ['dist/index.mjs', 'dist/index.cjs']) {
      let code = await readFile(file, 'utf8')
      for (const name of names) {
        const esc = name.replace(/[/]/g, '\\/')
        code = code.replace(
          new RegExp(`(from\\s*|import\\(\\s*|require\\(\\s*|import\\s+)(['"])${esc}\\2`, 'g'),
          (_m, kw: string, q: string) => `${kw}${q}node:${name}${q}`,
        )
      }
      await writeFile(file, code)
    }
  },
})
