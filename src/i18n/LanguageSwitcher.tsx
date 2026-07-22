import { supportedLanguages, type Language } from "./provider";
import { useTranslation } from "./useTranslation";
import { Globe2 } from "lucide-react";

const languageLabels: Record<Language, string> = {
  en: "English",
  hi: "हिन्दी",
  or: "ଓଡ଼ିଆ"
};

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useTranslation();

  return (
    <label className="language-switcher" aria-label={t("settings.language")}>
      <span className="sr-only">{t("settings.language")}</span>
      <Globe2 size={16} aria-hidden="true" />
      <select
        aria-label={t("settings.language")}
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
      >
        {supportedLanguages.map((languageCode) => (
          <option key={languageCode} value={languageCode}>
            {languageLabels[languageCode]}
          </option>
        ))}
      </select>
    </label>
  );
}
