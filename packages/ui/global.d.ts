import "react";

declare global {
  const APP_NAME: string;
  /**
   * This function is a macro, will replace in the build stage.
   */
  export function tw(strings: TemplateStringsArray, ...values: any[]): string;
}

declare module "react" {
  export interface AriaAttributes {
    "data-testid"?: string;
    "data-hide-in-print"?: boolean;
  }
}
