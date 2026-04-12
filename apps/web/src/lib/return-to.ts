const RETURN_TO_PARAM = 'returnTo'
const ALLOWED_RETURN_TO_PATHNAMES = new Set(['/explore'])

export function buildPhotoDetailSearch(returnTo: string): string {
  const searchParams = new URLSearchParams()
  searchParams.set(RETURN_TO_PARAM, returnTo)
  return `?${searchParams.toString()}`
}

export function getSafeReturnTo(search: string): string | null {
  const searchParams = new URLSearchParams(search)
  const returnTo = searchParams.get(RETURN_TO_PARAM)

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

  return `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`
}
