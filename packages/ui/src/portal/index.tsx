'use client'

import type { FC, PropsWithChildren } from 'react'
import { createPortal } from 'react-dom'

import { useRootPortal } from './provider'

export const RootPortal: FC<
  {
    to?: HTMLElement
  } & PropsWithChildren
> = (props) => {
  const to = useRootPortal()
  const target = props.to || to

  if (!target) {
    return props.children
  }

  return createPortal(props.children, target)
}
export { RootPortalProvider } from './provider'
