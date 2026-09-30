import { clsxm } from "@afilmory/ui";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { memo } from "react";
import { useTranslation } from "react-i18next";

import { useMobile } from "~/hooks/useMobile";

interface DateRangeIndicatorProps {
  dateRange: string;
  isVisible: boolean;
  className?: string;
}

export const DateRangeIndicator = memo(
  ({ dateRange, isVisible, className }: DateRangeIndicatorProps) => {
    const { t } = useTranslation();
    const translateDay = (day: string | number) =>
      t(`date.day.${day}` as never);
    const translateMonth = (month: string | number) =>
      t(`date.month.${month}` as never);

    // 解析日期范围，提取主要的日期信息
    const parseMainDate = (range: string) => {
      // 匹配跨年日期范围格式 "2022年3月 - 2023年5月"
      const crossYearMatch = range.match(
        /(\d{4})年(\d+)月\s*-\s*(\d{4})年(\d+)月/,
      );
      if (crossYearMatch) {
        const [, startYear, startMonth, endYear, endMonth] = crossYearMatch;
        // return `${startMonth}月 ${startYear} – ${endMonth}月 ${endYear}`
        return `${translateMonth(startMonth)} ${startYear} - ${translateMonth(endMonth)} ${endYear}`;
      }

      // 匹配类似 "2022年3月30日 - 5月2日" 的格式
      const singleYearDayMatch = range.match(
        /(\d{4})年(\d+)月(\d+)日?\s*-\s*(\d+)月(\d+)日?/,
      );
      if (singleYearDayMatch) {
        const [, year, startMonth, startDay, endMonth, endDay] =
          singleYearDayMatch;
        // return `${startMonth}月${startDay}日–${endMonth}月${endDay}日, ${year}`
        return `${translateMonth(startMonth)} ${translateDay(startDay)} - ${translateMonth(endMonth)} ${translateDay(endDay)} ${year}`;
      }

      // 匹配类似 "2022年3月 - 5月" 的格式
      const monthRangeMatch = range.match(/(\d{4})年(\d+)月\s*-\s*(\d+)月/);
      if (monthRangeMatch) {
        const [, year, startMonth, endMonth] = monthRangeMatch;
        // return `${startMonth}月–${endMonth}月, ${year}`
        return `${translateMonth(startMonth)} - ${translateMonth(endMonth)} ${year}`;
      }

      // 匹配单个日期
      const singleDateMatch = range.match(/(\d{4})年(\d+)月(\d+)日/);
      if (singleDateMatch) {
        const [, year, month, day] = singleDateMatch;
        // return `${month}月${day}日, ${year}`
        return `${translateMonth(month)} ${translateDay(day)} ${year}`;
      }

      // 默认返回原始字符串
      return range;
    };

    const isMobile = useMobile();
    const shouldReduceMotion = useReducedMotion() === true;
    const variants =
      isMobile || shouldReduceMotion
        ? {
            initial: {
              opacity: 0,
            },
            animate: { opacity: 1 },
          }
        : {
            initial: {
              opacity: 0,
              y: -6,
            },
            animate: { opacity: 1, y: 0 },
          };

    const formattedDate = parseMainDate(dateRange);

    return (
      <AnimatePresence>
        {isVisible && dateRange && (
          <m.div
            initial={shouldReduceMotion ? false : variants.initial}
            animate={variants.animate}
            exit={variants.initial}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            className={clsxm(
              "af-glass pointer-events-none flex w-fit max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl px-4 py-1.5",
              "fixed top-[calc(env(safe-area-inset-top)+0.75rem)] left-[max(0.75rem,env(safe-area-inset-left))] z-50 lg:top-6 lg:left-6",
              className,
            )}
          >
            <i
              className="i-mingcute-calendar-line text-ui-secondary size-5 shrink-0"
              aria-hidden="true"
            />
            <span className="text-ui flex min-h-11 min-w-0 items-center text-base leading-snug font-medium tracking-wide break-words tabular-nums lg:text-lg">
              {formattedDate}
            </span>
          </m.div>
        )}
      </AnimatePresence>
    );
  },
);

DateRangeIndicator.displayName = "DateRangeIndicator";
