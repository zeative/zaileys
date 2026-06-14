import { useMDXComponents as getThemeComponents } from 'nextra-theme-docs'
import DocH1 from './app/components/doc-h1'
import StackBlitz from './app/components/stackblitz'

export function useMDXComponents(components) {
  return {
    ...getThemeComponents(),
    h1: DocH1,
    StackBlitz,
    ...components,
  }
}
