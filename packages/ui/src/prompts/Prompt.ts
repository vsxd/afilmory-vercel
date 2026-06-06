import { useMemo } from "react";

import { useModalManager } from "../modal";
import type { PromptOptions } from "./BasePrompt";
import { BasePrompt } from "./BasePrompt";
import type { InputPromptOptions } from "./InputPrompt";
import { InputPrompt } from "./InputPrompt";

export function usePrompt() {
  const modal = useModalManager();

  return useMemo(
    () => ({
      prompt(options: PromptOptions) {
        return modal.present(BasePrompt, options);
      },
      input(options: InputPromptOptions): Promise<string | null> {
        return new Promise((resolve) => {
          modal.present(InputPrompt, {
            ...options,
            onConfirm: async (value: string) => {
              await options.onConfirm?.(value);
              resolve(value);
            },
            onCancel: async () => {
              await options.onCancel?.();
              resolve(null);
            },
          });
        });
      },
    }),
    [modal],
  );
}

const removedGlobalPromptError = () => {
  throw new Error("Global Prompt is removed. Use usePrompt() inside ModalProvider.");
};

export const Prompt = {
  prompt(_options: PromptOptions) {
    return removedGlobalPromptError();
  },
  input(_options: InputPromptOptions): Promise<string | null> {
    return removedGlobalPromptError();
  },
};
