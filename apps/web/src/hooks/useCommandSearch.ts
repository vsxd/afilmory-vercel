import type { photoLoader } from '~/data-runtime/photo-loader'

const getLocationTokens = (
  location?: { locationName?: string | null; city?: string | null; country?: string | null } | null,
) => {
  if (!location) return []

  const tokens = [location.locationName, location.city, location.country]
    .map((token) => token?.trim())
    .filter((token): token is string => typeof token === 'string' && token.length > 0)

  const uniqueTokens: string[] = []
  const seen = new Set<string>()
  tokens.forEach((token) => {
    const normalized = token.toLowerCase()
    if (!seen.has(normalized)) {
      seen.add(normalized)
      uniqueTokens.push(token)
    }
  })

  return uniqueTokens
}

// Fuzzy search utility
export const fuzzyMatch = (text: string, query: string): boolean => {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  if (lowerText.includes(lowerQuery)) return true

  let queryIndex = 0
  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      queryIndex++
    }
  }
  return queryIndex === lowerQuery.length
}

// Search photos utility
export const searchPhotos = (photos: ReturnType<typeof photoLoader.getPhotos>, query: string) => {
  const lowerQuery = query.trim().toLowerCase()
  if (!lowerQuery) return []

  return photos.filter((photo) => {
    const matchesTitle = photo.title?.toLowerCase().includes(lowerQuery)
    const matchesDescription = photo.description?.toLowerCase().includes(lowerQuery)
    const matchesTags = photo.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
    const matchesCamera =
      photo.exif?.Make?.toLowerCase().includes(lowerQuery) || photo.exif?.Model?.toLowerCase().includes(lowerQuery)
    const matchesLens = photo.exif?.LensModel?.toLowerCase().includes(lowerQuery)
    const locationTokens = getLocationTokens(photo.location)
    const matchesLocation = locationTokens.some((token) => token.toLowerCase().includes(lowerQuery))

    return matchesTitle || matchesDescription || matchesTags || matchesCamera || matchesLens || matchesLocation
  })
}

export { getLocationTokens }
