const langs = ['en', 'zh-CN', 'zh-HK', 'ja', 'jp', 'ko', 'zh-TW'] as const
export const currentSupportedLanguages = [...langs].sort() as string[]
export type MainSupportedLanguages = (typeof langs)[number]

export const ns = ['app'] as const
export const defaultNS = 'app' as const
