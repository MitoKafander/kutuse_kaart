import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import et from './locales/et.json';
import en from './locales/en.json';
import ru from './locales/ru.json';
import fi from './locales/fi.json';
import lv from './locales/lv.json';
import lt from './locales/lt.json';

const LOCALE_DATA = { et, en, ru, fi, lv, lt } as const;

export const ALL_LANGUAGES: ReadonlyArray<{
  code: keyof typeof LOCALE_DATA;
  nativeName: string;
  flag: string;
}> = [
  { code: 'et', nativeName: 'Eesti', flag: '🇪🇪' },
  { code: 'en', nativeName: 'English', flag: '🇬🇧' },
  { code: 'ru', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'fi', nativeName: 'Suomi', flag: '🇫🇮' },
  { code: 'lv', nativeName: 'Latviešu', flag: '🇱🇻' },
  { code: 'lt', nativeName: 'Lietuvių', flag: '🇱🇹' },
];

export type SupportedLanguage = (typeof ALL_LANGUAGES)[number]['code'];

// Only surface languages whose locale file has been populated. ET is always
// active (source language + ultimate fallback). As ru/fi/lv/lt translations
// land, those languages auto-appear in the picker without code changes.
export const LANGUAGES = ALL_LANGUAGES.filter(
  ({ code }) => code === 'et' || Object.keys(LOCALE_DATA[code]).length > 0
);

export const SUPPORTED_LANGUAGES = LANGUAGES.map(l => l.code);

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      et: { translation: et },
      en: { translation: en },
      ru: { translation: ru },
      fi: { translation: fi },
      lv: { translation: lv },
      lt: { translation: lt },
    },
    fallbackLng: 'et',
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'kyts-language',
      caches: ['localStorage'],
    },
    returnNull: false,
  });

export default i18n;
