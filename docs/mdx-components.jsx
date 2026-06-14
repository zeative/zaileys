import { useMDXComponents as getThemeComponents } from 'nextra-theme-docs'
import DocH1 from './app/components/doc-h1'

export function useMDXComponents(components) {
  return {
    ...getThemeComponents(),
    h1: DocH1,
    ...components,
  }
}
