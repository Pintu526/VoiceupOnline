import { createContext, useCallback, useMemo, useState, type ReactNode } from "react";
import en from "./locales/en.json";
import hi from "./locales/hi.json";
import or from "./locales/or.json";

export const supportedLanguages = ["en", "hi", "or"] as const;
export type Language = (typeof supportedLanguages)[number];

type TranslationTree = { [key: string]: string | TranslationTree };

const translations: Record<Language, TranslationTree> = { en, hi, or };
const languageStorageKey = "voiceup-language";

export interface TranslationContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
}

export const TranslationContext = createContext<TranslationContextValue | null>(null);

function isSupportedLanguage(value: string | null): value is Language {
  return supportedLanguages.some((language) => language === value);
}

function readStoredLanguage(): Language {
  try {
    const storedLanguage = window.localStorage.getItem(languageStorageKey);
    return isSupportedLanguage(storedLanguage) ? storedLanguage : "en";
  } catch {
    return "en";
  }
}

function findTranslation(tree: TranslationTree, key: string): string | undefined {
  const value = key.split(".").reduce<string | TranslationTree | undefined>((current, segment) => {
    if (!current || typeof current === "string") return undefined;
    return current[segment];
  }, tree);
  return typeof value === "string" ? value : undefined;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  const setLanguage = useCallback((nextLanguage: Language) => {
    const safeLanguage = isSupportedLanguage(nextLanguage) ? nextLanguage : "en";
    setLanguageState(safeLanguage);
    try {
      window.localStorage.setItem(languageStorageKey, safeLanguage);
    } catch {
      // Language selection remains available in memory when storage is unavailable.
    }
  }, []);

  const t = useCallback(
    (key: string) =>
      findTranslation(translations[language], key) ??
      findTranslation(translations.en, key) ??
      key,
    [language]
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}
