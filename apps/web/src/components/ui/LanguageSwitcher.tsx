import { ChevronDown, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage === "uk" ? "uk" : "en";
  return (
    <div className="relative">
      <Languages
        size={16}
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
      />
      <select
        aria-label={t("lang.label")}
        value={current}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        className="h-9 cursor-pointer appearance-none rounded-lg border border-border bg-surface pl-8 pr-7 text-sm text-fg outline-none transition hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        <option value="en">{t("lang.en")}</option>
        <option value="uk">{t("lang.uk")}</option>
      </select>
      <ChevronDown
        size={14}
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
