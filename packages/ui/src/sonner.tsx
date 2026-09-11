import "./sonner.css";

import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";

import { clsxm } from "./utils/cn";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Sonner's dark close-button rules also apply in unstyled mode. Feed its
// public theme variables instead of competing with injected, unlayered CSS.
const sonnerTheme = {
  "--normal-bg": "var(--af-surface-control)",
  "--normal-bg-hover": "var(--af-surface-hover)",
  "--normal-border": "var(--af-border)",
  "--normal-border-hover": "var(--af-border-strong)",
  "--normal-text": "var(--af-text)",
} as CSSProperties;

const toastStyles = {
  toast:
    "af-popover group relative flex w-full min-w-0 max-w-md items-center gap-3 rounded-panel p-4 has-[[data-close-button]]:pr-16",
  title: "text-ui text-sm font-medium leading-tight",
  description: "mt-1 text-sm leading-relaxed",
  content: "min-w-0 flex-1",
  icon: String.raw`
    relative flex size-5 shrink-0 items-center justify-center
    [li[data-type="success"]_&]:text-success
    [li[data-type="error"]_&]:text-error
    [li[data-type="warning"]_&]:text-warning
    [li[data-type="info"]_&]:text-info
    [li[data-type="loading"]_&]:text-ui-muted
  `,
  actionButton:
    "af-control min-h-9 shrink-0 rounded-control px-2.5 text-xs font-medium",
  cancelButton:
    "af-control min-h-9 shrink-0 rounded-control px-2.5 text-xs font-medium",
  closeButton:
    "af-control absolute right-2 top-2 flex size-11 items-center justify-center rounded-full",
};

const Toaster = ({
  className,
  style,
  toastOptions,
  ...props
}: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      gap={12}
      className={clsxm("af-toaster", className)}
      style={{ ...sonnerTheme, ...style }}
      toastOptions={{
        unstyled: true,
        ...toastOptions,
        classNames: { ...toastStyles, ...toastOptions?.classNames },
      }}
      icons={{
        success: (
          <i aria-hidden="true" className="i-mingcute-check-circle-fill" />
        ),
        error: (
          <i aria-hidden="true" className="i-mingcute-close-circle-fill" />
        ),
        warning: <i aria-hidden="true" className="i-mingcute-warning-fill" />,
        info: <i aria-hidden="true" className="i-mingcute-information-fill" />,
        loading: (
          <i
            aria-hidden="true"
            className="i-mingcute-loading-3-fill animate-spin"
          />
        ),
      }}
      {...props}
    />
  );
};

export { Toaster };
