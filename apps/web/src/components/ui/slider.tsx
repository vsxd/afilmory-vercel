import { clsxm } from "@afilmory/ui";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface SliderProps {
  value: number | "auto";
  onChange: (value: number | "auto") => void;
  // Called when user commits a value (pointer up / keyboard step). Optional and non-breaking.
  onPointUp?: (e: PointerEvent | React.KeyboardEvent) => void;
  min: number;
  max: number;
  step?: number;
  autoLabel?: string;
  className?: string;
  disabled?: boolean;
}

export const Slider = ({
  value,
  onChange,
  onPointUp,
  min,
  max,
  step = 1,
  autoLabel,
  className,
  disabled = false,
}: SliderProps) => {
  const { t } = useTranslation();
  const finalAutoLabel = autoLabel || t("slider.auto");
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const activePointerRef = useRef<number | null>(null);

  // 将值转换为位置百分比
  const getPositionFromValue = useCallback(
    (val: number | "auto") => {
      if (val === "auto") return 5; // 自动档位置稍微偏右一点
      // 数值档从 15% 开始到 100%
      if (max === min) return 15;
      return 15 + ((val - min) / (max - min)) * 85;
    },
    [min, max],
  );

  // 将位置百分比转换为值
  const getValueFromPosition = useCallback(
    (position: number) => {
      if (position <= 12) return "auto"; // 左侧 12% 区域为自动档
      const normalizedPosition = (position - 15) / 85; // 从 15% 开始的 85% 区域为数值
      const rawValue = min + Math.max(0, normalizedPosition) * (max - min);
      return Math.min(
        max,
        Math.max(min, min + Math.round((rawValue - min) / step) * step),
      );
    },
    [min, max, step],
  );

  const updateValue = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const position = ((clientX - rect.left) / rect.width) * 100;
      const newValue = getValueFromPosition(
        Math.max(0, Math.min(100, position)),
      );
      if (newValue !== value) onChange(newValue);
    },
    [getValueFromPosition, onChange, value],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || event.button !== 0 || activePointerRef.current !== null)
        return;

      event.preventDefault();
      // preventDefault suppresses native focus-on-click; move focus to the
      // handle explicitly so keyboard adjustment can continue after a drag.
      handleRef.current?.focus();
      activePointerRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
      updateValue(event.clientX);
    },
    [disabled, updateValue],
  );

  const finishPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerRef.current !== event.pointerId) return false;
      activePointerRef.current = null;
      setIsDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return true;
    },
    [],
  );

  // 键盘步进：与指针路径一致地吸附到 step 倍数，"auto" 是 min 左侧的一个离散档
  const stepValue = useCallback(
    (val: number | "auto", direction: 1 | -1): number | "auto" => {
      if (val === "auto") return direction === 1 ? min : "auto";
      const snapped =
        min + Math.round((val - min + direction * step) / step) * step;
      if (snapped < min) return val <= min ? "auto" : min;
      return Math.min(max, snapped);
    },
    [min, max, step],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;

      let newValue: number | "auto";
      switch (event.key) {
        case "ArrowRight":
        case "ArrowUp": {
          newValue = stepValue(value, 1);
          break;
        }
        case "ArrowLeft":
        case "ArrowDown": {
          newValue = stepValue(value, -1);
          break;
        }
        case "Home": {
          newValue = "auto";
          break;
        }
        case "End": {
          newValue = max;
          break;
        }
        default: {
          return;
        }
      }

      event.preventDefault();
      if (newValue !== value) {
        onChange(newValue);
        // 键盘每一步都是一次完整交互，立即提交
        onPointUp?.(event);
      }
    },
    [disabled, stepValue, value, max, onChange, onPointUp],
  );

  const position = getPositionFromValue(value);

  return (
    <div className={clsxm("w-full", className)}>
      {/* 标签 */}
      <div className="text-ui-secondary mb-2 flex justify-between text-xs">
        <span>{finalAutoLabel}</span>
        <span>{max}</span>
      </div>

      {/* 滑块轨道 */}
      <div
        ref={sliderRef}
        className={clsxm(
          "relative h-11 touch-none cursor-pointer",
          disabled && "cursor-not-allowed opacity-50",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={(event) => {
          if (!disabled && activePointerRef.current === event.pointerId) {
            updateValue(event.clientX);
          }
        }}
        onPointerUp={(event) => {
          if (finishPointer(event) && !disabled) onPointUp?.(event.nativeEvent);
        }}
        onPointerCancel={finishPointer}
        onLostPointerCapture={(event) => {
          if (event.target === event.currentTarget) finishPointer(event);
        }}
      >
        {/* 背景轨道 */}
        <div
          ref={trackRef}
          className="bg-ui-hover absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full"
        >
          {/* 自动档区域指示 */}
          <div className="bg-ui-subtle absolute top-0 left-0 h-full w-[12%] rounded-l-full" />

          {/* 激活区域 */}
          <div
            className={clsxm(
              "absolute top-0 h-full max-w-full rounded-full transition-[background-color,width] duration-150",
              value === "auto" ? "bg-accent/70" : "bg-accent",
            )}
            style={{
              width: `${Math.max(position, 5)}%`,
              borderRadius: value === "auto" ? "9999px 0 0 9999px" : "9999px",
            }}
          />
        </div>

        {/* 滑块把手 */}
        <div
          ref={handleRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={t("action.columns.setting")}
          aria-valuemin={min - 1}
          aria-valuemax={max}
          aria-valuenow={value === "auto" ? min - 1 : value}
          aria-valuetext={
            value === "auto"
              ? finalAutoLabel
              : t("slider.columns", { count: value })
          }
          aria-disabled={disabled || undefined}
          onKeyDown={handleKeyDown}
          className={clsxm(
            "absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg transition-[background-color,box-shadow,transform] duration-150",
            isDragging ? "scale-110" : "hover:scale-105",
            value === "auto" ? "bg-accent/80" : "bg-accent",
            disabled && "cursor-not-allowed",
          )}
          style={{
            left: `${position}%`,
          }}
        />

        {/* 数值刻度 */}
        <div className="text-ui-secondary absolute top-full mt-1 flex w-full text-xs">
          <div className="w-[15%] text-left">
            <span
              className={clsxm(
                "transition-colors",
                value === "auto" && "text-accent font-medium",
              )}
            >
              {finalAutoLabel}
            </span>
          </div>
          <div className="flex w-[85%] justify-between">
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map(
              (num) => (
                <span
                  key={num}
                  className={clsxm(
                    "transition-colors",
                    value === num && "font-medium text-accent",
                  )}
                >
                  {num}
                </span>
              ),
            )}
          </div>
        </div>
      </div>

      {/* 当前值显示 */}
      <div className="text-ui-secondary mt-8 text-center text-sm font-medium">
        {value === "auto"
          ? finalAutoLabel
          : t("slider.columns", { count: value })}
      </div>
    </div>
  );
};
