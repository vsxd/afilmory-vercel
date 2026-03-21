import { act,renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useControlled } from '../useControlled'

describe('useControlled', () => {
  it('should use defaultValue when uncontrolled', () => {
    const { result } = renderHook(() => useControlled(undefined, 'hello'))
    expect(result.current[0]).toBe('hello')
  })

  it('should use value when controlled', () => {
    const { result } = renderHook(() => useControlled('controlled', 'default'))
    expect(result.current[0]).toBe('controlled')
  })

  it('should update state when uncontrolled', () => {
    const { result } = renderHook(() => useControlled(undefined, 'initial'))
    act(() => {
      result.current[1]('updated')
    })
    expect(result.current[0]).toBe('updated')
  })

  it('should call onChange when setting value', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useControlled(undefined, 'initial', onChange))
    act(() => {
      result.current[1]('new')
    })
    expect(onChange).toHaveBeenCalledWith('new')
  })
})
