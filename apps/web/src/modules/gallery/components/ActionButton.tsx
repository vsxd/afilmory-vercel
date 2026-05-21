import {
  Button,
  clsxm,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@afilmory/ui";
import type { SetStateAction } from "jotai";
import { useSetAtom } from "jotai";
import { useState } from "react";
import { Drawer } from "vaul";

import type { GallerySetting } from "~/atoms/app";
import { gallerySettingAtom } from "~/atoms/app";
import { useMobile } from "~/hooks/useMobile";

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
  ref?: React.RefObject<HTMLButtonElement>;
}) => {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="bg-material-medium border-fill-tertiary hover:bg-fill-secondary focus-visible:ring-accent/45 focus-visible:ring-offset-background relative h-10 w-10 rounded-full border shadow-sm backdrop-blur-xl transition-[background-color,border-color,box-shadow,color,transform] duration-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-offset-2"
      aria-label={title}
      title={title}
      onClick={onClick}
      ref={ref}
      {...props}
    >
      <i className={clsxm(icon, "text-text-secondary text-base")} />
      {badge && (
        <span className="bg-accent absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium text-white shadow-sm">
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
  const setGallerySetting = useSetAtom(gallerySettingAtom);
  return (
    <DropdownMenu
      defaultOpen={open}
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
      <DropdownMenuContent align="center" className={contentClassName}>
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
  return (
    <>
      <ActionButton
        icon={icon}
        title={title}
        badge={badge}
        onClick={() => onOpenChange(!open)}
      />
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm" />
          <Drawer.Content className="bg-material-thick border-fill-tertiary fixed right-0 bottom-0 left-0 z-50 flex flex-col rounded-t-2xl border-t p-4 shadow-xl backdrop-blur-2xl">
            <div className="bg-fill-tertiary mx-auto mb-4 h-1.5 w-12 flex-shrink-0 rounded-full" />
            {children}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
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

  if (isMobile) {
    return (
      <MobileActionButton
        icon={icon}
        title={title}
        badge={badge}
        open={open}
        onOpenChange={setOpen}
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
