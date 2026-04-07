/* eslint-disable react-refresh/only-export-components */

import { createContext, use } from 'react'

export const useRootPortal = () => {
  const ctx = use(RootPortalContext)

  return ctx.to || document.body
}

const RootPortalContext = createContext<{
  to?: HTMLElement | undefined
}>({
  to: undefined,
})

export const RootPortalProvider = RootPortalContext
