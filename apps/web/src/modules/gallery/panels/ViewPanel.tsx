import { useTranslation } from "react-i18next";

import { ColumnsPanel } from "./ColumnsPanel";
import { SortPanel } from "./SortPanel";

// 合并的视图面板（排序 + 列数）
export const ViewPanel = () => {
  const { t } = useTranslation();

  return (
    <div className="pb-safe lg:pb-safe-2 w-full overflow-y-auto overscroll-contain px-6 pt-2 pb-6 lg:max-h-[min(72vh,34rem)] lg:px-5 lg:pt-5 lg:pb-5">
      <header className="flex items-center gap-3">
        <div className="bg-accent/10 border-accent/20 text-accent flex size-12 shrink-0 items-center justify-center rounded-2xl border shadow-sm lg:size-11">
          <i
            className="i-mingcute-layout-grid-line text-lg"
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0">
          <h3 className="text-ui text-lg leading-tight font-semibold text-pretty lg:text-base">
            {t("action.view.settings")}
          </h3>
          <p className="text-ui-secondary mt-1 text-sm lg:text-xs">
            {t("action.view.subtitle")}
          </p>
        </div>
      </header>

      {/* 排序部分 */}
      <section className="mt-6">
        <div className="text-ui-secondary mb-2 flex items-center gap-2 px-1 text-xs font-medium">
          <i className="i-mingcute-sort-descending-line" aria-hidden="true" />
          <h4>{t("action.sort.mode")}</h4>
        </div>
        <SortPanel />
      </section>

      {/* 分隔线 */}
      <div className="bg-ui-subtle my-5 h-px" />

      {/* 列数部分 */}
      <section>
        <div className="text-ui-secondary mb-3 flex items-center gap-2 px-1 text-xs font-medium">
          <i className="i-mingcute-grid-line" aria-hidden="true" />
          <h4>{t("action.columns.setting")}</h4>
        </div>
        <ColumnsPanel />
      </section>
    </div>
  );
};
