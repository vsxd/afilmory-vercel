// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearStorage, getStorageNS } from '../ns'

const createLocalStorageMock = () => {
  const storage = new Map<string, string>()

  return {
    get length() {
      return storage.size
    },
    clear() {
      storage.clear()
    },
    getItem(key: string) {
      return storage.get(key) ?? null
    },
    key(index: number) {
      return Array.from(storage.keys())[index] ?? null
    },
    removeItem(key: string) {
      storage.delete(key)
    },
    setItem(key: string, value: string) {
      storage.set(key, value)
    },
  }
}

describe('storage namespace utilities', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock())
    localStorage.clear()
  })

  it('removes every namespaced key without skipping adjacent entries', () => {
    localStorage.setItem(getStorageNS('filters'), '1')
    localStorage.setItem(getStorageNS('view'), '2')
    localStorage.setItem(getStorageNS('sort'), '3')

    clearStorage()

    expect(localStorage.getItem(getStorageNS('filters'))).toBeNull()
    expect(localStorage.getItem(getStorageNS('view'))).toBeNull()
    expect(localStorage.getItem(getStorageNS('sort'))).toBeNull()
  })

  it('keeps keys outside the exact namespace prefix', () => {
    localStorage.setItem('apple:keep', '1')
    localStorage.setItem('app-legacy', '2')
    localStorage.setItem(getStorageNS('photo'), '3')

    clearStorage()

    expect(localStorage.getItem('apple:keep')).toBe('1')
    expect(localStorage.getItem('app-legacy')).toBe('2')
    expect(localStorage.getItem(getStorageNS('photo'))).toBeNull()
  })
})
