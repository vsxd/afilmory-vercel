import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { getPhotoDate } from "~/lib/photo-date";
import type { PhotoManifest } from "~/types/photo";

interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
  formattedRange: string;
}

interface VisibleRange {
  start: number;
  end: number;
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

  const currentRange = useRef<VisibleRange>({ start: 0, end: 0 });

  const { i18n } = useTranslation();

  const formatDateRange = useCallback(
    (startDate: Date, endDate: Date): string => {
      const sameDay = startDate.toDateString() === endDate.toDateString();
      const sameMonth =
        startDate.getFullYear() === endDate.getFullYear() &&
        startDate.getMonth() === endDate.getMonth();

      // 全部走 Intl，按 locale 输出（包含天级精度仅在同月时显示），不再硬编码中文。
      const formatter = new Intl.DateTimeFormat(i18n.language, {
        year: "numeric",
        month: "long",
        ...(sameDay || sameMonth ? { day: "numeric" } : {}),
      });

      if (sameDay) {
        return formatter.format(startDate);
      }

      // formatRange 给出 locale 正确的区间（如 "January 5 – 8, 2024" / "2024年1月 – 3月"）。
      if (typeof formatter.formatRange === "function") {
        return formatter.formatRange(startDate, endDate);
      }
      return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
    },
    [i18n.language],
  );

  // 计算当前可视范围内照片的日期范围
  const calculateDateRange = useCallback(
    (
      startIndex: number,
      endIndex: number,
      items: (PhotoManifest | { id?: never })[],
    ) => {
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

      setDateRange({
        startDate,
        endDate,
        formattedRange,
      });

      // 更新当前范围
      currentRange.current = { start: startIndex, end: endIndex };
    },
    [formatDateRange],
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
