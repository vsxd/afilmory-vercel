// @vitest-environment node

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

const removeGlobal = (name: 'navigator') => {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: undefined,
    writable: true,
  })
}

describe('packages/ui SSR safety', () => {
  it('imports the scroll context without a DOM', async () => {
    await expect(import('../scroll-areas/ctx')).resolves.toBeDefined()
  })

  it('renders RootPortal without createPortal when no DOM is available', async () => {
    const { RootPortal } = await import('../portal')

    expect(
      renderToStaticMarkup(
        <RootPortal>
          <span>portal-child</span>
        </RootPortal>,
      ),
    ).toContain('portal-child')
  })

  it('renders useIsOnline consumers without navigator during SSR', async () => {
    removeGlobal('navigator')

    const { useIsOnline } = await import('../hooks/useIsOnline')

    const Probe = () => <span>{useIsOnline() ? 'online' : 'offline'}</span>

    expect(renderToStaticMarkup(<Probe />)).toContain('online')
  })
})
