const RETURN_TO_PARAM = 'returnTo'
const ALLOWED_RETURN_TO_PATHNAMES = new Set(['/explore'])

export function buildPhotoDetailSearch(returnTo: string): string {
  const searchParams = new URLSearchParams()
  searchParams.set(RETURN_TO_PARAM, returnTo)
  return `?${searchParams.toString()}`
}

export function syncPhotoDetailSearch(search: string, photoId: string): string {
  const searchParams = new URLSearchParams(search)
  const returnTo = searchParams.get(RETURN_TO_PARAM)

  if (!returnTo) {
    return search
  }

  const returnUrl = getSafeReturnToUrl(returnTo)
  if (!returnUrl || returnUrl.pathname !== '/explore') {
    return search
  }

  returnUrl.searchParams.set('photoId', photoId)
  searchParams.set(RETURN_TO_PARAM, `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`)

  return `?${searchParams.toString()}`
}

export function getSafeReturnTo(search: string): string | null {
  const searchParams = new URLSearchParams(search)
  const returnTo = searchParams.get(RETURN_TO_PARAM)

  const returnUrl = getSafeReturnToUrl(returnTo)
  if (!returnUrl) {
    return null
  }

  return `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`
}

function getSafeReturnToUrl(returnTo: string | null): URL | null {
  if (!returnTo) {
    return null
  }

  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return null
  }

  const returnUrl = new URL(returnTo, 'https://afilmory.local')
  if (!ALLOWED_RETURN_TO_PATHNAMES.has(returnUrl.pathname)) {
    return null
  }

  return returnUrl
}
