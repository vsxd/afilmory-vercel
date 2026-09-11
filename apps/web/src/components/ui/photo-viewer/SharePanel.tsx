import { clsxm, RootPortal, Spring } from "@afilmory/ui";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, m } from "motion/react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { buildPhotoDetailPathname } from "~/lib/photo-detail-route";
import type { PhotoManifest } from "~/types/photo";

import { copyTextToClipboard } from "./clipboard-text";

interface SharePanelProps {
  photo: PhotoManifest;
  trigger: React.ReactNode;
  blobSrc?: string;
}

interface ShareOption {
  id: string;
  label: string;
  icon: string;
  action: () => Promise<void> | void;
  color?: string;
  bgColor?: string;
}

interface SocialShareOption {
  id: string;
  label: string;
  icon: string;
  url: string;
  color: string;
  bgColor: string;
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function canShareImageFiles(): boolean {
  if (typeof navigator.canShare !== "function" || typeof File === "undefined") {
    return false;
  }

  try {
    const probeFile = new File([""], "photo.jpg", { type: "image/jpeg" });
    return navigator.canShare({ files: [probeFile] });
  } catch {
    return false;
  }
}

export const SharePanel = ({ photo, trigger, blobSrc }: SharePanelProps) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  // 社交媒体分享选项
  const socialOptions: SocialShareOption[] = [
    {
      id: "twitter",
      label: "Twitter",
      icon: "i-mingcute-twitter-fill",
      url: "https://twitter.com/intent/tweet?text={text}&url={url}",
      color: "text-white",
      bgColor: "bg-sky-500",
    },
    {
      id: "facebook",
      label: "Facebook",
      icon: "i-mingcute-facebook-line",
      url: "https://www.facebook.com/sharer/sharer.php?u={url}",
      color: "text-white",
      bgColor: "bg-[#1877F2]",
    },
    {
      id: "telegram",
      label: "Telegram",
      icon: "i-mingcute-telegram-line",
      url: "https://t.me/share/url?url={url}&text={text}",
      color: "text-white",
      bgColor: "bg-[#0088CC]",
    },
    {
      id: "weibo",
      label: t("photo.share.weibo"),
      icon: "i-mingcute-weibo-line",
      url: "https://service.weibo.com/share/share.php?url={url}&title={text}",
      color: "text-white",
      bgColor: "bg-[#E6162D]",
    },
  ];

  const handleNativeShare = useCallback(async () => {
    const shareUrl = `${window.location.origin}${buildPhotoDetailPathname(photo.id)}`;
    const shareTitle = photo.title || t("photo.share.default.title");
    const shareText = t("photo.share.text", { title: shareTitle });
    const sharePayload = {
      title: shareTitle,
      text: shareText,
      url: shareUrl,
    };

    try {
      if (canShareImageFiles()) {
        const imageUrl = blobSrc || photo.originalUrl;
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch shared image: ${response.status}`);
        }
        const blob = await response.blob();
        const file = new File([blob], `${photo.title || "photo"}.jpg`, {
          type: blob.type || "image/jpeg",
        });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            ...sharePayload,
            files: [file],
          });
          setIsOpen(false);
          return;
        }
      }

      await navigator.share(sharePayload);
      setIsOpen(false);
    } catch (error) {
      if (isAbortLikeError(error)) {
        setIsOpen(false);
        return;
      }

      if (await copyTextToClipboard(shareUrl)) {
        toast.success(t("photo.share.link.copied"));
        setIsOpen(false);
        return;
      }

      toast.error(t("photo.share.copy.failed"));
    }
  }, [photo.id, photo.title, blobSrc, photo.originalUrl, t]);

  const handleCopyLink = useCallback(async () => {
    if (
      await copyTextToClipboard(
        `${window.location.origin}${buildPhotoDetailPathname(photo.id)}`,
      )
    ) {
      toast.success(t("photo.share.link.copied"));
      setIsOpen(false);
      return;
    }

    toast.error(t("photo.share.copy.failed"));
  }, [photo.id, t]);

  const handleSocialShare = useCallback(
    (url: string) => {
      const shareUrl = encodeURIComponent(
        `${window.location.origin}${buildPhotoDetailPathname(photo.id)}`,
      );
      const defaultTitle = t("photo.share.default.title");
      const shareTitle = encodeURIComponent(photo.title || defaultTitle);
      const shareText = encodeURIComponent(
        t("photo.share.text", { title: photo.title || defaultTitle }),
      );

      const finalUrl = url
        .replace("{url}", shareUrl)
        .replace("{title}", shareTitle)
        .replace("{text}", shareText);

      const shareWindow = window.open(
        finalUrl,
        "_blank",
        "width=600,height=400,noopener,noreferrer",
      );
      if (shareWindow) {
        shareWindow.opener = null;
      }
      setIsOpen(false);
    },
    [photo.id, photo.title, t],
  );

  // 功能选项
  const actionOptions: ShareOption[] = [
    ...(typeof navigator !== "undefined" && "share" in navigator
      ? [
          {
            id: "native-share",
            label: t("photo.share.system"),
            icon: "i-mingcute-share-2-line",
            action: handleNativeShare,
            color: "text-blue-500",
          },
        ]
      : []),
    {
      id: "copy-link",
      label: t("photo.share.copy.link"),
      icon: "i-mingcute-link-line",
      action: handleCopyLink,
    },
  ];

  return (
    <DropdownMenuPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuPrimitive.Trigger asChild>
        {trigger}
      </DropdownMenuPrimitive.Trigger>

      <AnimatePresence>
        {isOpen && (
          <RootPortal>
            <DropdownMenuPrimitive.Content
              align="end"
              sideOffset={8}
              className="z-10000 max-h-[var(--radix-dropdown-menu-content-available-height)] w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto will-change-[opacity,transform]"
              asChild
            >
              <m.div
                data-photo-viewer-nested-overlay=""
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={Spring.presets.smooth}
                className="af-popover rounded-2xl p-4"
              >
                {/* 标题区域 */}
                <div className="relative mb-4">
                  <h3 className="text-text text-sm font-semibold">
                    {t("photo.share.title")}
                  </h3>
                  {photo.title && (
                    <p className="text-text-secondary mt-1 line-clamp-1 text-sm">
                      {photo.title}
                    </p>
                  )}
                </div>

                {/* 社交媒体分享 - 第一排 */}
                <div className="relative mb-4">
                  <div className="mb-3">
                    <h4 className="text-text-secondary text-xs font-medium">
                      {t("photo.share.social.media")}
                    </h4>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {socialOptions.map((option) => (
                      <DropdownMenuPrimitive.Item
                        key={option.id}
                        asChild
                        onSelect={() => handleSocialShare(option.url)}
                      >
                        <button
                          type="button"
                          className="af-control group data-[highlighted]:bg-fill-secondary flex min-w-0 flex-col items-center gap-2 rounded-xl px-1 py-2"
                          aria-label={option.label}
                        >
                          <div
                            className={clsxm(
                              "flex size-10 shrink-0 items-center justify-center rounded-full",
                              option.bgColor,
                            )}
                          >
                            <i
                              className={clsxm(
                                option.icon,
                                "size-5",
                                option.color,
                              )}
                              aria-hidden="true"
                            />
                          </div>
                          <span className="text-text-secondary text-xs font-medium">
                            {option.label}
                          </span>
                        </button>
                      </DropdownMenuPrimitive.Item>
                    ))}
                  </div>
                </div>

                {/* 功能选项 - 第二排 */}
                <div className="relative">
                  <div className="mb-3">
                    <h4 className="text-text-secondary text-xs font-medium">
                      {t("photo.share.actions")}
                    </h4>
                  </div>
                  <div className="grid gap-2">
                    {actionOptions.map((option) => (
                      <DropdownMenuPrimitive.Item
                        key={option.id}
                        asChild
                        onSelect={(event) => {
                          event.preventDefault();
                          void option.action();
                        }}
                      >
                        <button
                          type="button"
                          className="af-control group data-[highlighted]:bg-fill-secondary relative flex min-h-11 cursor-pointer items-center rounded-xl px-3 py-2 text-sm select-none"
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex size-5 shrink-0 items-center justify-center">
                              <i
                                className={clsxm(
                                  option.icon,
                                  "size-5",
                                  option.color || "text-text-secondary",
                                )}
                                aria-hidden="true"
                              />
                            </div>
                            <span className="text-text text-[13px] font-medium">
                              {option.label}
                            </span>
                          </div>
                        </button>
                      </DropdownMenuPrimitive.Item>
                    ))}
                  </div>
                </div>
              </m.div>
            </DropdownMenuPrimitive.Content>
          </RootPortal>
        )}
      </AnimatePresence>
    </DropdownMenuPrimitive.Root>
  );
};
