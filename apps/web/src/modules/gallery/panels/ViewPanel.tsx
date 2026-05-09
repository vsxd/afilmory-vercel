import { useTranslation } from 'react-i18next'

import { ColumnsPanel } from './ColumnsPanel'
import { SortPanel } from './SortPanel'

// 合并的视图面板（排序 + 列数）
export const ViewPanel = () => {
  const { t } = useTranslation()

  return (
    <div className="pb-safe lg:pb-safe-2 w-full px-4 pt-4 pb-5">
      <header className="flex items-center gap-3">
        <div className="bg-accent/10 border-accent/15 text-accent flex size-10 shrink-0 items-center justify-center rounded-xl border">
          <i className="i-mingcute-layout-grid-line text-lg" />
        </div>
        <div className="min-w-0">
          <h3 className="text-text text-sm font-semibold">{t('action.view.settings')}</h3>
          <p className="text-text-secondary mt-0.5 text-xs">{t('action.view.subtitle')}</p>
        </div>
      </header>

      {/* 排序部分 */}
      <section className="mt-5">
        <div className="text-text-secondary mb-2 flex items-center gap-2 px-1 text-xs font-medium">
          <i className="i-mingcute-sort-descending-line" />
          <h4>{t('action.sort.mode')}</h4>
        </div>
        <SortPanel />
      </section>

      {/* 分隔线 */}
      <div className="bg-fill-secondary my-4 h-px" />

      {/* 列数部分 */}
      <section>
        <div className="text-text-secondary mb-3 flex items-center gap-2 px-1 text-xs font-medium">
          <i className="i-mingcute-grid-line" />
          <h4>{t('action.columns.setting')}</h4>
        </div>
        <ColumnsPanel />
      </section>
    </div>
  )
}
