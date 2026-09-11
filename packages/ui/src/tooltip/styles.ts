export const tooltipStyle = {
  content: [
    "af-popover relative z-9999 overflow-hidden px-3 py-2",
    "animate-in fade-in-0 zoom-in-95 duration-(--af-duration-fast)",
    "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
    "rounded-control text-sm",
    "max-w-[min(75ch,var(--radix-tooltip-content-available-width))] select-text",
  ],
};
