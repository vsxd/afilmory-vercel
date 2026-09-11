import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";

import { clsxm } from "../utils/cn";
import { tooltipStyle } from "./styles";

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;

const Tooltip: typeof TooltipProvider = ({ children, ...props }) => (
  <TooltipProvider {...props}>
    <TooltipPrimitive.Tooltip>{children}</TooltipPrimitive.Tooltip>
  </TooltipProvider>
);

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = ({
  ref,
  className,
  sideOffset = 4,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
  ref?: React.Ref<React.ElementRef<typeof TooltipPrimitive.Content> | null>;
}) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={clsxm(tooltipStyle.content, className)}
    {...props}
  />
);
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipContent, TooltipRoot, TooltipTrigger };

export { RootPortal as TooltipPortal } from "../portal";
