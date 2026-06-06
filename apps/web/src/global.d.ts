import type { AfilmoryBrowserRuntime } from "./runtime/browser-runtime";

declare global {
  /**
   * This function is a macro, will replace in the build stage.
   */
  export function tw(strings: TemplateStringsArray, ...values: any[]): string;

  interface Window {
    __AFILMORY__?: AfilmoryBrowserRuntime;
  }
}

declare module "react" {
  export interface AriaAttributes {
    "data-testid"?: string;
    "data-hide-in-print"?: boolean;
  }
}
