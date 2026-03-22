import type { JSX, ReactNode } from 'react'
import { cloneElement } from 'react'

export const ProviderComposer: Component<{
  contexts: JSX.Element[]
}> = ({ contexts, children }) =>
  contexts.reduceRight((kids: ReactNode, parent: JSX.Element) => cloneElement(parent, { children: kids }), children)
