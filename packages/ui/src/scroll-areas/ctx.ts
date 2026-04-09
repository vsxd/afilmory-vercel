import { createContext } from 'react'

import { getDocumentElement } from '../utils/dom'

export const ScrollElementContext = createContext<HTMLElement | null>(getDocumentElement())
