import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { atom } from "jotai";
import { initReactI18next } from "react-i18next";

import { currentSupportedLanguages } from "./@types/constants";
import { resources } from "./@types/resources";
import { siteConfig } from "./config";
import { jotaiStore } from "./lib/jotai";
import {
  getFallbackLanguages,
  normalizeDetectedLanguage,
  resolveSupportedLanguage,
} from "./lib/language";

const i18n = i18next.createInstance();
const fallbackLanguages = getFallbackLanguages(siteConfig.language);

const syncDocumentLanguage = (language: string | undefined) => {
  if (typeof document === "undefined") return;

  const resolvedLanguage =
    resolveSupportedLanguage(language) ??
    resolveSupportedLanguage(fallbackLanguages[0]) ??
    "en";
  document.documentElement.lang = resolvedLanguage;
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: fallbackLanguages,
    defaultNS: "app",
    detection: {
      caches: [],
      convertDetectedLanguage: normalizeDetectedLanguage,
      order: ["navigator", "htmlTag"],
    },
    nonExplicitSupportedLngs: false,
    resources,
    supportedLngs: currentSupportedLanguages,
  })
  .then(() => {
    syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language);
  });

i18n.on("languageChanged", (language) => {
  syncDocumentLanguage(language);
});

export const i18nAtom = atom(i18n);

export const getI18n = () => {
  return jotaiStore.get(i18nAtom);
};
