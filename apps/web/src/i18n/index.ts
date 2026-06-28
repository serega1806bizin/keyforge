import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import uk from "./locales/uk.json";

export const LOCALES = ["en", "uk"] as const;
export type Locale = (typeof LOCALES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      uk: { translation: uk },
    },
    fallbackLng: "en",
    supportedLngs: [...LOCALES],
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "keyforge-lang",
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export default i18n;
