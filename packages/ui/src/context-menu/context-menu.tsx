import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import * as React from "react";

import { clsxm } from "../utils/cn";

const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuGroup = ContextMenuPrimitive.Group;
const ContextMenuSub = ContextMenuPrimitive.Sub;
const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;
const RootPortal = ContextMenuPrimitive.Portal;

const ContextMenuSubTrigger = ({
  ref,
  className,
  inset,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
  inset?: boolean;
} & {
  ref?: React.Ref<React.ElementRef<
    typeof ContextMenuPrimitive.SubTrigger
  > | null>;
}) => (
  <ContextMenuPrimitive.SubTrigger
    ref={ref}
    className={clsxm(
      "af-menu-item flex min-h-8 cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm",
      inset && "pl-8",
      className,
    )}
    {...props}
  >
    {children}
    <i
      aria-hidden="true"
      className="i-mingcute-right-line -mr-1 ml-auto size-3.5"
    />
  </ContextMenuPrimitive.SubTrigger>
);
ContextMenuSubTrigger.displayName = ContextMenuPrimitive.SubTrigger.displayName;

const ContextMenuSubContent = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent> & {
  ref?: React.Ref<React.ElementRef<
    typeof ContextMenuPrimitive.SubContent
  > | null>;
}) => (
  <RootPortal>
    <ContextMenuPrimitive.SubContent
      ref={ref}
      className={clsxm(
        "af-popover relative z-10061 min-w-32 overflow-hidden rounded-panel p-1",
        className,
      )}
      {...props}
    />
  </RootPortal>
);
ContextMenuSubContent.displayName = ContextMenuPrimitive.SubContent.displayName;

const ContextMenuContent = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content> & {
  ref?: React.Ref<React.ElementRef<typeof ContextMenuPrimitive.Content> | null>;
}) => (
  <RootPortal>
    <ContextMenuPrimitive.Content
      ref={ref}
      className={clsxm(
        "af-popover relative z-10060 min-w-32 overflow-hidden rounded-panel p-1",
        className,
      )}
      {...props}
    />
  </RootPortal>
);
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName;

const ContextMenuItem = ({
  ref,
  className,
  inset,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean;
} & {
  ref?: React.Ref<React.ElementRef<typeof ContextMenuPrimitive.Item> | null>;
}) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={clsxm(
      "af-menu-item relative flex min-h-8 cursor-default select-none items-center rounded-lg px-2.5 py-1.5 text-sm",
      inset && "pl-8",
      className,
    )}
    {...props}
  />
);
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName;

const ContextMenuCheckboxItem = ({
  ref,
  className,
  children,
  checked,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem> & {
  ref?: React.Ref<React.ElementRef<
    typeof ContextMenuPrimitive.CheckboxItem
  > | null>;
}) => (
  <ContextMenuPrimitive.CheckboxItem
    ref={ref}
    className={clsxm(
      "af-menu-item relative flex min-h-8 cursor-default select-none items-center rounded-lg px-8 py-1.5 text-sm",
      className,
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator asChild>
        <i aria-hidden="true" className="i-mingcute-check-line size-3.5" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.CheckboxItem>
);
ContextMenuCheckboxItem.displayName =
  ContextMenuPrimitive.CheckboxItem.displayName;

const ContextMenuLabel = ({
  ref,
  className,
  inset,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & {
  inset?: boolean;
} & {
  ref?: React.Ref<React.ElementRef<typeof ContextMenuPrimitive.Label> | null>;
}) => (
  <ContextMenuPrimitive.Label
    ref={ref}
    className={clsxm(
      "text-ui-secondary px-2 py-1.5 text-sm font-semibold",
      inset && "pl-8",
      className,
    )}
    {...props}
  />
);
ContextMenuLabel.displayName = ContextMenuPrimitive.Label.displayName;

const ContextMenuSeparator = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator> & {
  ref?: React.Ref<React.ElementRef<
    typeof ContextMenuPrimitive.Separator
  > | null>;
}) => (
  <ContextMenuPrimitive.Separator
    className={clsxm("border-ui-border mx-2 my-1 border-t", className)}
    ref={ref}
    {...props}
  />
);
ContextMenuSeparator.displayName = ContextMenuPrimitive.Separator.displayName;

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  RootPortal as ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
};
