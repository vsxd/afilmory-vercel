import {
  Button,
  clsxm,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@afilmory/ui";
import type { SetStateAction } from "jotai";
import { useRef, useState } from "react";
import { Drawer } from "vaul";

import type { GallerySetting } from "~/atoms/app";
import { useDialogFocusManagement } from "~/hooks/useDialogFocusManagement";
import { useMobile } from "~/hooks/useMobile";
import { useModalIsolation } from "~/hooks/useModalIsolation";
import { useGallerySettings } from "~/navigation/hooks";

// 通用的操作按钮组件
export const ActionButton = ({
  icon,
  title,
  badge,
  onClick,
  ref,
  ...props
}: {
  icon: string;
  title: string;
  badge?: number | string;
  onClick: () => void;
  ref?: React.Ref<HTMLButtonElement>;
}) => {
  return (
    <Button
      variant="surface"
      size="sm"
      className="af-control relative h-11 w-11 rounded-full"
      aria-label={title}
      title={title}
      onClick={onClick}
      ref={ref}
      {...props}
    >
      <i className={clsxm(icon, "text-lg")} aria-hidden="true" />
      {badge && (
        <span className="bg-accent text-accent-content absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium shadow-sm">
          {badge}
        </span>
      )}
    </Button>
  );
};

// 桌面端的下拉菜单按钮
export const DesktopActionButton = ({
  icon,
  title,
  badge,
  children,
  contentClassName,
  open,
  onOpenChange,
}: {
  icon: string;
  title: string;
  badge?: number | string;
  children: React.ReactNode;
  contentClassName?: string;
  open?: boolean;
  onOpenChange?: (
    open: boolean,
    setGallerySetting: (setting: SetStateAction<GallerySetting>) => void,
  ) => void;
}) => {
  const [, setGallerySetting] = useGallerySettings();
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(open) => {
        onOpenChange?.(open, setGallerySetting);
      }}
    >
      <DropdownMenuTrigger asChild>
        <ActionButton
          icon={icon}
          title={title}
          badge={badge}
          onClick={() => {}}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        collisionPadding={16}
        sideOffset={10}
        className={contentClassName}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// 移动端的抽屉按钮
export const MobileActionButton = ({
  icon,
  title,
  badge,
  children,
  open,
  onOpenChange,
}: {
  icon: string;
  title: string;
  badge?: number | string;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useModalIsolation(open);
  useDialogFocusManagement({
    dialogRef: contentRef,
    isOpen: open,
    returnFocusElement: triggerRef.current,
  });

  return (
    <Drawer.Root autoFocus open={open} onOpenChange={onOpenChange}>
      <Drawer.Trigger asChild>
        <ActionButton
          icon={icon}
          title={title}
          badge={badge}
          onClick={() => {}}
          ref={triggerRef}
        />
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Drawer.Content
          ref={contentRef}
          tabIndex={-1}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus({ preventScroll: true });
          }}
          className="af-popover fixed right-0 bottom-0 left-0 z-50 flex max-h-[88dvh] flex-col overflow-hidden overscroll-contain rounded-t-3xl"
        >
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          <div className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing">
            <div
              className="bg-ui-hover h-1.5 w-12 rounded-full"
              aria-hidden="true"
            />
          </div>
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};

// 响应式操作按钮组件
export const ResponsiveActionButton = ({
  icon,
  title,
  badge,
  children,
  contentClassName,
  globalOpen,
  onGlobalOpenChange,
}: {
  icon: string;
  title: string;
  badge?: number | string;
  children: React.ReactNode;
  contentClassName?: string;
  globalOpen?: boolean;
  onGlobalOpenChange?: (
    open: boolean,
    setGallerySetting: (setting: SetStateAction<GallerySetting>) => void,
  ) => void;
}) => {
  const isMobile = useMobile();
  const [open, setOpen] = useState(false);
  const [, setGallerySetting] = useGallerySettings();

  if (isMobile) {
    return (
      <MobileActionButton
        icon={icon}
        title={title}
        badge={badge}
        open={globalOpen ?? open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          onGlobalOpenChange?.(nextOpen, setGallerySetting);
        }}
      >
        {children}
      </MobileActionButton>
    );
  }

  return (
    <DesktopActionButton
      icon={icon}
      title={title}
      badge={badge}
      contentClassName={contentClassName}
      open={globalOpen}
      onOpenChange={onGlobalOpenChange}
    >
      {children}
    </DesktopActionButton>
  );
};
