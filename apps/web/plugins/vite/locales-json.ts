import { set } from "es-toolkit/compat";
import type { Plugin } from "vite";

import { MONOREPO_ROOT_PATH } from "./__internal__/constants";

export function localesJsonPlugin(): Plugin {
  return {
    name: "locales-json-transform",
    enforce: "pre",

    async transform(code, id) {
      if (!id.includes(MONOREPO_ROOT_PATH) || !id.endsWith(".json")) {
        return null;
      }

      const content = JSON.parse(code) as Record<string, unknown>;
      const obj: Record<string, unknown> = {};

      const keys = Object.keys(content);
      for (const accessorKey of keys) {
        set(obj, accessorKey, content[accessorKey]);
      }

      return {
        code: JSON.stringify(obj),
        map: null,
      };
    },
  };
}
