import { CircleCheck, Mail } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PasskeyButton } from "../components/PasskeyButton";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { AuthCard } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { Input } from "../components/ui/Input";
import { formatError } from "../lib/errors";
import { useAsyncAction } from "../lib/useAsyncAction";
import { registerPasskey } from "../lib/webauthn";

export function SignupPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const { busy, run: register } = useAsyncAction(async () => {
    setError("");
    setStatus(t("signup.statusCreating"));
    try {
      await registerPasskey(email);
      setStatus(t("signup.statusRegistered"));
      setDone(true);
    } catch (err) {
      const message = formatError(err, t);
      setStatus(message);
      setError(message);
    }
  });

  return (
    <AuthCard>
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-fg">{t("signup.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("signup.subtitle")}</p>
      </header>

      {done ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="space-y-5"
        >
          <div className="flex items-center gap-3 rounded-xl border border-transparent bg-success-soft px-4 py-3 text-success">
            <CircleCheck size={20} aria-hidden />
            <span className="text-sm font-medium">{t("signup.successFor", { email })}</span>
          </div>
          <Button
            className="w-full"
            onClick={() => {
              window.location.href = "/settings";
            }}
          >
            {t("signup.continue")}
          </Button>
        </motion.div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void register();
          }}
        >
          <Field label={t("signup.emailLabel")}>
            {(id) => (
              <Input
                id={id}
                type="email"
                required
                autoComplete="email"
                placeholder={t("signup.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={<Mail size={16} />}
                invalid={Boolean(error)}
                data-testid="email"
              />
            )}
          </Field>
          <PasskeyButton
            type="submit"
            loading={busy}
            label={t("signup.submit")}
            loadingLabel={t("signup.submitBusy")}
            data-testid="register"
          />
          {error ? <Alert tone="error">{error}</Alert> : null}
          <p className="text-center text-sm text-muted">
            {t("signup.haveAccount")}{" "}
            <a className="font-medium text-primary hover:underline" href="/settings">
              {t("common.signIn")}
            </a>
          </p>
        </form>
      )}

      <p className="sr-only" data-testid="status" role="status" aria-live="polite">
        {status}
      </p>
    </AuthCard>
  );
}
