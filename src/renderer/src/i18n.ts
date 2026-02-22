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
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next.
  .use(initReactI18next)
  // Initialize i18next
  .init({
    resources,
    ns: ["translation", "changelog"],
    defaultNS: "translation",
    fallbackLng: "en",
    debug: false,
    interpolation: {
      escapeValue: false, // Not needed for React
    },
  });

export default i18n;
