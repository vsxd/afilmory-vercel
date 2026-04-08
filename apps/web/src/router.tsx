import { createBrowserRouter } from 'react-router'

import App from './App'
import { ErrorElement } from './components/common/ErrorElement'
import { NotFound } from './components/common/NotFound'
import { buildGlobRoutes } from './lib/route-builder'

const globTree = import.meta.env.DEV
  ? import.meta.glob('./pages/**/*.tsx')
  : import.meta.glob(['./pages/**/*.tsx', '!./pages/(debug)/**/*.tsx', '!./pages/(data)/**/*.tsx'])
const tree = buildGlobRoutes(globTree)

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: tree,
    errorElement: <ErrorElement />,
  },
  {
    path: '*',
    element: <NotFound />,
  },
])
