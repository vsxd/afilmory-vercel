import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HoverCard, HoverCardContent, HoverCardTrigger } from '..'

describe('HoverCardContent', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders content inside the current tree when portal is disabled', () => {
    render(
      <div data-testid="host">
        <HoverCard open>
          <HoverCardTrigger asChild>
            <button type="button">trigger</button>
          </HoverCardTrigger>
          <HoverCardContent portal={false}>inline content</HoverCardContent>
        </HoverCard>
      </div>,
    )

    const host = screen.getByTestId('host')
    const content = screen.getByText('inline content')

    expect(host.contains(content)).toBe(true)
  })

  it('renders content through a portal by default', () => {
    render(
      <div data-testid="host">
        <HoverCard open>
          <HoverCardTrigger asChild>
            <button type="button">trigger</button>
          </HoverCardTrigger>
          <HoverCardContent>portal content</HoverCardContent>
        </HoverCard>
      </div>,
    )

    const host = screen.getByTestId('host')
    const content = screen.getByText('portal content')

    expect(host.contains(content)).toBe(false)
    expect(document.body.contains(content)).toBe(true)
  })
})
