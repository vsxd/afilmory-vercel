// @vitest-environment node

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

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
})
