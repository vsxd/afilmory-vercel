import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import * as React from "react";

import { clsxm } from "../utils/cn";

const HoverCard = HoverCardPrimitive.Root;

const HoverCardTrigger = HoverCardPrimitive.Trigger;

type HoverCardContentProps = React.ComponentPropsWithoutRef<
  typeof HoverCardPrimitive.Content
> & {
  portal?: boolean;
  ref?: React.RefObject<React.ElementRef<
    typeof HoverCardPrimitive.Content
  > | null>;
};

const HoverCardContent = ({
  ref,
  className,
  align = "center",
  portal = true,
  sideOffset = 4,
  ...props
}: HoverCardContentProps) => {
  const content = (
    <HoverCardPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={clsxm(
        "af-popover relative z-50 w-64 overflow-hidden rounded-panel p-4",
        "duration-(--af-duration-fast)",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  );

  if (!portal) {
    return content;
  }

  return <HoverCardPrimitive.Portal>{content}</HoverCardPrimitive.Portal>;
};
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardContent, HoverCardTrigger };
