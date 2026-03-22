import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../Collapsible'

// Mock motion/react to avoid animation issues in tests.
// Use vi.hoisted to ensure React is available in the mock factory.
const { mockAnimatePresence, mockMDiv } = vi.hoisted(() => {
   
  const React = require('react')
  return {
    mockAnimatePresence: ({ children }: { children: unknown }) => React.createElement(React.Fragment, null, children),
    mockMDiv: (props: Record<string, unknown>) =>
      React.createElement('div', { id: props.id, role: props.role, className: props.className }, props.children),
  }
})

vi.mock('motion/react', () => ({
  AnimatePresence: mockAnimatePresence,
  m: { div: mockMDiv },
}))

afterEach(() => {
  cleanup()
})

describe('Collapsible', () => {
  it('should render trigger with aria-expanded=false by default', () => {
    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>,
    )

    const trigger = screen.getByRole('button', { name: 'Toggle' })
    expect(trigger).toBeDefined()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('should render trigger with aria-expanded=true when defaultOpen', () => {
    render(
      <Collapsible defaultOpen>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>,
    )

    const trigger = screen.getByRole('button', { name: 'Toggle' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('should toggle aria-expanded on click', () => {
    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>,
    )

    const trigger = screen.getByRole('button', { name: 'Toggle' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('should have aria-controls on trigger matching content id', () => {
    render(
      <Collapsible defaultOpen>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>,
    )

    const trigger = screen.getByRole('button', { name: 'Toggle' })
    const contentId = trigger.getAttribute('aria-controls')
    expect(contentId).toBeTruthy()

    const content = screen.getByRole('region')
    expect(content.id).toBe(contentId)
  })

  it('should render content with role=region when open', () => {
    render(
      <Collapsible defaultOpen>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Visible Content</CollapsibleContent>
      </Collapsible>,
    )

    const region = screen.getByRole('region')
    expect(region).toBeDefined()
    expect(region.textContent).toBe('Visible Content')
  })

  it('should not render content when closed', () => {
    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>,
    )

    expect(screen.queryByRole('region')).toBeNull()
  })

  it('should call onOpenChange when toggled', () => {
    const onOpenChange = vi.fn()

    render(
      <Collapsible onOpenChange={onOpenChange}>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }))
    expect(onOpenChange).toHaveBeenCalledWith(true)

    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('should work in controlled mode', () => {
    const { rerender } = render(
      <Collapsible open={false}>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>,
    )

    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region')).toBeNull()

    rerender(
      <Collapsible open={true}>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>,
    )

    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('region')).toBeDefined()
  })
})
