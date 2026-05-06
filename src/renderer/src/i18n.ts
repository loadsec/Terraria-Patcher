import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Import translation files
import enTranslation from "./locales/en/translation.json";
import ptBRTranslation from "./locales/pt-BR/translation.json";
import enChangelog from "./locales/en/changelog.json";
import ptBRChangelog from "./locales/pt-BR/changelog.json";

const resources = {
  en: {
    translation: enTranslation,
    changelog: enChangelog,
  },
  "pt-BR": {
    translation: ptBRTranslation,
    changelog: ptBRChangelog,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    ns: ["translation", "changelog"],
    defaultNS: "translation",
    fallbackLng: "en",
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["navigator"],
      caches: [],
    },
  });

export default i18n;
