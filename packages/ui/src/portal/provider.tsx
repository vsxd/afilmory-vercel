/* eslint-disable react-refresh/only-export-components */

import { createContext, use } from 'react'

import { getDocumentBody } from '../utils/dom'

export const useRootPortal = () => {
  const ctx = use(RootPortalContext)

  return ctx.to || getDocumentBody()
}

const RootPortalContext = createContext<{
  to?: HTMLElement | undefined
}>({
  to: undefined,
})

export const RootPortalProvider = RootPortalContext
