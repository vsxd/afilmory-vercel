import { atom } from 'jotai'

export type GallerySortBy = 'date'
export type GallerySortOrder = 'asc' | 'desc'

export interface GallerySetting {
  sortBy: GallerySortBy
  sortOrder: GallerySortOrder
  selectedTags: string[]
  selectedCameras: string[]
  selectedLenses: string[]
  selectedRatings: number | null
  tagFilterMode: 'union' | 'intersection'
  columns: number | 'auto'
}

export const gallerySettingAtom = atom<GallerySetting>({
  sortBy: 'date',
  sortOrder: 'desc',
  selectedTags: [],
  selectedCameras: [],
  selectedLenses: [],
  selectedRatings: null,
  tagFilterMode: 'union',
  columns: 'auto',
})

export const isExiftoolLoadedAtom = atom(false)

// Command Palette state
export const isCommandPaletteOpenAtom = atom(false)
