import { useAtom } from "jotai";
import type { FC, PropsWithChildren } from "react";
import { I18nextProvider } from "react-i18next";

import { i18nAtom } from "../i18n";

export const I18nProvider: FC<PropsWithChildren> = ({ children }) => {
  const [currentI18NInstance] = useAtom(i18nAtom);

  return (
    <I18nextProvider i18n={currentI18NInstance}>{children}</I18nextProvider>
  );
};
