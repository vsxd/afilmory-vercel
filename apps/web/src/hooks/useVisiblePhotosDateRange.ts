import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { getPhotoDate } from "~/lib/photo-date";
import type { PhotoManifest } from "~/types/photo";

interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
  formattedRange: string;
}

interface ComputedRangeKey {
  start: number;
  end: number;
  items: unknown;
  lang: string;
}

/**
 * Hook to calculate the date range of currently visible photos in the viewport
 * Works with masonry onRender callback
 */
export const useVisiblePhotosDateRange = (_photos: PhotoManifest[]) => {
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: null,
    endDate: null,
    formattedRange: "",
  });

  // 上一次已计算的输入签名：快速滚动时 onRender 每帧触发，可视 index 区间未变时
  // 直接早退，避免每帧 O(n) 的 slice/sort 与 setState。
  const lastComputedRef = useRef<ComputedRangeKey | null>(null);
  const currentRange = useRef<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });

  const { i18n } = useTranslation();

  // Intl.DateTimeFormat 构造不便宜，按 locale 缓存两个变体（是否含天）。
  const formatters = useMemo(
    () => ({
      monthOnly: new Intl.DateTimeFormat(i18n.language, {
        year: "numeric",
        month: "long",
      }),
      withDay: new Intl.DateTimeFormat(i18n.language, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    }),
    [i18n.language],
  );

  const formatDateRange = useCallback(
    (startDate: Date, endDate: Date): string => {
      const sameDay = startDate.toDateString() === endDate.toDateString();
      const sameMonth =
        startDate.getFullYear() === endDate.getFullYear() &&
        startDate.getMonth() === endDate.getMonth();

      // 全部走 Intl，按 locale 输出（包含天级精度仅在同月时显示），不再硬编码中文。
      const formatter =
        sameDay || sameMonth ? formatters.withDay : formatters.monthOnly;

      if (sameDay) {
        return formatter.format(startDate);
      }

      // formatRange 给出 locale 正确的区间（如 "January 5 – 8, 2024" / "2024年1月 – 3月"）。
      if (typeof formatter.formatRange === "function") {
        return formatter.formatRange(startDate, endDate);
      }
      return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
    },
    [formatters],
  );

  // 计算当前可视范围内照片的日期范围
  const calculateDateRange = useCallback(
    (
      startIndex: number,
      endIndex: number,
      items: (PhotoManifest | { id?: never })[],
    ) => {
      // 输入（区间 + items 引用 + 语言）与上次一致 → 结果必然一致，直接早退。
      const last = lastComputedRef.current;
      if (
        last &&
        last.start === startIndex &&
        last.end === endIndex &&
        last.items === items &&
        last.lang === i18n.language
      ) {
        return;
      }
      lastComputedRef.current = {
        start: startIndex,
        end: endIndex,
        items,
        lang: i18n.language,
      };

      if (!items || items.length === 0) {
        setDateRange({
          startDate: null,
          endDate: null,
          formattedRange: "",
        });
        return;
      }

      // 过滤出照片类型的items (排除header等)
      const visiblePhotos = items
        .slice(startIndex, endIndex + 1)
        .filter(
          (item): item is PhotoManifest =>
            item && typeof item === "object" && "id" in item,
        );

      if (visiblePhotos.length === 0) {
        setDateRange({
          startDate: null,
          endDate: null,
          formattedRange: "",
        });
        return;
      }

      // 计算日期范围
      const dates = visiblePhotos
        .map((photo) => getPhotoDate(photo))
        .sort((a, b) => a.getTime() - b.getTime());

      const startDate = dates[0];
      const endDate = dates.at(-1);

      if (!startDate || !endDate) {
        setDateRange({
          startDate: null,
          endDate: null,
          formattedRange: "",
        });
        return;
      }

      const formattedRange = formatDateRange(startDate, endDate);

      // 值未变则保留旧对象，避免 DateRangeIndicator 无意义重渲染。
      setDateRange((prev) =>
        prev.formattedRange === formattedRange &&
        prev.startDate?.getTime() === startDate.getTime() &&
        prev.endDate?.getTime() === endDate.getTime()
          ? prev
          : { startDate, endDate, formattedRange },
      );

      // 更新当前范围
      currentRange.current = { start: startIndex, end: endIndex };
    },
    [formatDateRange, i18n.language],
  );

  // 用于传递给 masonry 的 onRender 回调
  const handleRender = useCallback(
    (
      startIndex: number,
      stopIndex: number,
      items: (PhotoManifest | { id?: never })[],
    ) => {
      calculateDateRange(startIndex, stopIndex, items);
    },
    [calculateDateRange],
  );

  return {
    dateRange,
    handleRender,
    currentRange: currentRange.current,
  };
};
