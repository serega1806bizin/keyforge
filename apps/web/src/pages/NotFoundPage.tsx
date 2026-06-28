import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { AuthCard } from "../components/ui/Card";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <AuthCard className="text-center">
      <h1 className="text-xl font-semibold tracking-tight text-fg">{t("notFound.title")}</h1>
      <p className="mt-2 text-sm text-muted">{t("notFound.subtitle")}</p>
      <div className="mt-6">
        <Button
          onClick={() => {
            window.location.href = "/signup";
          }}
        >
          {t("notFound.cta")}
        </Button>
      </div>
    </AuthCard>
  );
}
