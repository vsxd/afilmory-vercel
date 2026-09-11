import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as React from "react";

import { clsxm } from "./utils/cn";

const DropdownMenu: typeof DropdownMenuPrimitive.Root = (props) => {
  return <DropdownMenuPrimitive.Root {...props} />;
};

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuContent = ({
  ref,
  className,
  sideOffset = 4,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & {
  ref?: React.Ref<React.ElementRef<
    typeof DropdownMenuPrimitive.Content
  > | null>;
}) => {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={clsxm(
          "af-popover relative z-60 min-w-32 overflow-hidden rounded-panel p-1",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
};
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = ({
  ref,
  className,
  inset,
  icon,
  active,
  highlightColor: _highlightColor = "accent",
  shortcut: _shortcut,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  icon?:
    React.ReactNode | ((props?: { isActive?: boolean }) => React.ReactNode);
  active?: boolean;
  highlightColor?: "accent" | "gray";
  shortcut?: string;
} & {
  ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Item> | null>;
}) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={clsxm(
      "af-menu-item relative my-0.5 flex min-h-8 cursor-default select-none items-center rounded-lg px-2.5 py-1.5 text-sm",
      inset && "pl-8",
      className,
    )}
    {...props}
  >
    {!!icon && (
      <span className="mr-1.5 inline-flex size-4 items-center justify-center">
        {typeof icon === "function" ? icon({ isActive: active }) : icon}
      </span>
    )}
    {props.children}

    {/* Justify Fill */}
    {!!icon && <span className="ml-1.5 size-4" />}
  </DropdownMenuPrimitive.Item>
);
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuCheckboxItem = ({
  ref,
  className,
  children,
  checked,
  icon,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem> & {
  icon?: React.ReactNode;
  ref?: React.Ref<React.ElementRef<
    typeof DropdownMenuPrimitive.CheckboxItem
  > | null>;
}) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={clsxm(
      "af-menu-item relative flex min-h-8 cursor-default select-none items-center rounded-lg px-2 py-1.5 text-sm",
      className,
    )}
    checked={checked}
    {...props}
  >
    {!!icon && (
      <span className="mr-1.5 inline-flex size-4 items-center justify-center">
        {icon}
      </span>
    )}
    {children}
    <span className="ml-auto flex size-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator className="ml-1 flex items-center justify-center">
        <i aria-hidden="true" className="i-mingcute-check-line size-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
  </DropdownMenuPrimitive.CheckboxItem>
);
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuLabel = ({
  ref,
  className,
  inset,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean;
} & {
  ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Label> | null>;
}) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={clsxm(
      "text-ui-secondary px-2 py-1 text-sm font-semibold",
      inset && "pl-8",
      className,
    )}
    {...props}
  />
);
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator> & {
  ref?: React.Ref<React.ElementRef<
    typeof DropdownMenuPrimitive.Separator
  > | null>;
}) => (
  <DropdownMenuPrimitive.Separator
    className={clsxm("border-ui-border mx-2 my-1 border-t", className)}
    ref={ref}
    {...props}
  />
);
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
