const ns = 'app'
const storagePrefix = `${ns}:`
export const getStorageNS = (key: string) => `${ns}:${key}`

export const clearStorage = () => {
  if (typeof localStorage === 'undefined') {
    return
  }

  const keysToRemove: string[] = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(storagePrefix)) {
      keysToRemove.push(key)
    }
  }

  keysToRemove.forEach((key) => {
    localStorage.removeItem(key)
  })
}
