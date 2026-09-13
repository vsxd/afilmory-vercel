import { useTranslation } from "react-i18next";

import { ThumbnailImage } from "~/components/ui/ThumbnailImage";

import type { Command, CommandResultGroup } from "./model";

interface CommandResultGroupsProps {
  groups: CommandResultGroup[];
  photoCount: number;
  selectedCommandId?: string;
  getOptionDomId: (id: string) => string;
  onSelect: (command: Command) => void;
  onExecute: (command: Command) => void;
}

export function CommandResultGroups({
  groups,
  photoCount,
  selectedCommandId,
  getOptionDomId,
  onSelect,
  onExecute,
}: CommandResultGroupsProps) {
  const { t } = useTranslation();
  return groups.map((group) => {
    const title =
      group.type === "photos"
        ? t("action.search.photo-results")
        : t("action.search.filter-results");
    return (
      <div
        key={group.type}
        role="group"
        aria-label={title}
        className="border-ui-border space-y-1 not-first:mt-4 not-first:border-t not-first:pt-4"
      >
        <div className="text-ui-secondary flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 pb-2 text-xs">
          <span>
            {title}
            <span className="ml-2 tabular-nums">{group.commands.length}</span>
          </span>
          {group.type === "photos" && (
            <span className="text-ui-muted">
              {t("action.search.photo-scope", { count: photoCount })}
            </span>
          )}
        </div>
        {group.commands.map((command) => (
          <button
            key={command.id}
            type="button"
            id={getOptionDomId(command.id)}
            data-command-result-id={command.id}
            role="option"
            aria-selected={selectedCommandId === command.id}
            aria-description={
              command.active ? t("action.search.filter-applied") : undefined
            }
            onClick={() => onExecute(command)}
            onMouseEnter={() => onSelect(command)}
            onFocus={() => onSelect(command)}
            className="af-command-option group flex min-h-16 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-200 [--af-focus-offset:-2px]"
          >
            {command.thumbnail ? (
              <div
                data-command-preview
                className="bg-ui-subtle flex h-18 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg"
              >
                {/* Fit the placeholder and image to the same uncropped box. */}
                <ThumbnailImage
                  photoId={command.thumbnail.photoId}
                  src={command.thumbnail.src}
                  alt={command.thumbnail.alt}
                  width={command.thumbnail.width}
                  height={command.thumbnail.height}
                  thumbHash={command.thumbnail.thumbHash}
                  style={{
                    aspectRatio: `${command.thumbnail.width} / ${command.thumbnail.height}`,
                    width: `min(100%, ${72 * (command.thumbnail.width / command.thumbnail.height)}px)`,
                    maxHeight: "100%",
                  }}
                  containerClassName="max-w-full"
                  fit="contain"
                  fetchPriority="low"
                />
              </div>
            ) : (
              <span className="af-panel text-ui-secondary flex size-10 shrink-0 items-center justify-center rounded-xl text-lg">
                <i className={command.icon} aria-hidden="true" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-start gap-2">
                <span className="text-ui min-w-0 flex-1 text-sm leading-5 font-medium [overflow-wrap:anywhere] whitespace-normal">
                  {command.title}
                </span>
                {command.badge !== undefined && (
                  <span className="af-panel text-ui-secondary shrink-0 rounded-md px-2 py-0.5 text-xs tabular-nums">
                    {command.badge}
                  </span>
                )}
                {command.active && (
                  <span
                    className="text-accent flex size-5 shrink-0 items-center justify-center"
                    aria-hidden="true"
                  >
                    <i className="i-mingcute-check-line text-sm" />
                  </span>
                )}
              </span>
              {command.subtitle && (
                <span className="text-ui-secondary mt-1 line-clamp-2 text-xs leading-5 [overflow-wrap:anywhere] whitespace-normal">
                  {command.subtitle}
                </span>
              )}
            </span>
            {command.type === "photo" && (
              <i
                className="i-mingcute-right-line text-ui-muted shrink-0 text-sm"
                aria-hidden="true"
              />
            )}
          </button>
        ))}
      </div>
    );
  });
}
