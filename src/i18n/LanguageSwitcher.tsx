import { supportedLanguages, type Language } from "./provider";
import { useTranslation } from "./useTranslation";

const languageLabels: Record<Language, string> = {
  en: "English",
  hi: "हिन्दी",
  or: "ଓଡ଼ିଆ"
};

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useTranslation();

  return (
    <label>
      <span>{t("settings.language")}</span>
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
