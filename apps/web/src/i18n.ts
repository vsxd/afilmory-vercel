import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { atom } from "jotai";
import { initReactI18next } from "react-i18next";

import { currentSupportedLanguages } from "./@types/constants";
import { resources } from "./@types/resources";
import { siteConfig } from "./config";
import { jotaiStore } from "./lib/jotai";

const i18n = i18next.createInstance();
const defaultLanguage = siteConfig.language || "en";
const fallbackLanguages =
  defaultLanguage === "en" ? ["en"] : [defaultLanguage, "en"];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: fallbackLanguages,
    defaultNS: "app",
    detection: {
      caches: [],
      order: ["navigator", "htmlTag"],
    },
    nonExplicitSupportedLngs: true,
    resources,
    supportedLngs: currentSupportedLanguages,
  });

export const i18nAtom = atom(i18n);

export const getI18n = () => {
  return jotaiStore.get(i18nAtom);
};
