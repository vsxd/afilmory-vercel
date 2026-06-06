import type { JSX, PropsWithChildren, ReactNode } from "react";
import { cloneElement } from "react";

type ProviderComposerProps = PropsWithChildren<{
  contexts: JSX.Element[];
}>;

export const ProviderComposer = ({ contexts, children }: ProviderComposerProps) =>
  contexts.reduceRight(
    (kids: ReactNode, parent: JSX.Element) =>
      cloneElement(parent, { children: kids }),
    children,
  );
