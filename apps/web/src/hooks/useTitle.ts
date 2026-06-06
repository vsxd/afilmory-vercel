import { useEffect } from "react";

import { siteConfig } from "~/config";

const titleTemplate = `%s | ${siteConfig.name}`;
export const useTitle = (title?: string | null) => {
  useEffect(() => {
    if (!title) return;

    const previousTitle = document.title;
    document.title = titleTemplate.replace("%s", title);

    return () => {
      document.title = previousTitle;
    };
  }, [title]);
};
