import { KeyRound } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PasskeyButton } from "../components/PasskeyButton";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { AuthCard } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Skeleton } from "../components/ui/Skeleton";
import { apiGet, apiPost, type InteractionInfo, type VerifyResult } from "../lib/api";
import { formatError } from "../lib/errors";
import { KNOWN_SCOPES, scopeIcon } from "../lib/scopes";
import { useAsyncAction } from "../lib/useAsyncAction";
import { authenticatePasskey } from "../lib/webauthn";

async function conditionalUIAvailable(): Promise<boolean> {
  return (
    typeof PublicKeyCredential !== "undefined" &&
    (await PublicKeyCredential.isConditionalMediationAvailable?.()) === true
  );
}

function fade(reduce: boolean | null) {
  if (reduce) return { initial: false as const };
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.2, ease: "easeOut" as const },
  };
}

export function LoginPage({ interactionId }: { interactionId: string }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<InteractionInfo | null>(null);
  const [step, setStep] = useState<"login" | "consent">("login");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const reduce = useReducedMotion();
  const consentHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<InteractionInfo>(`/interaction/${interactionId}`)
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        if (data.needs === "consent") setStep("consent");
      })
      .catch(() => {
        if (!cancelled) setError(t("login.invalid"));
      });
    return () => {
      cancelled = true;
    };
  }, [interactionId, t]);

  useEffect(() => {
    if (step === "consent") consentHeadingRef.current?.focus();
  }, [step]);

  function applyVerify(data: VerifyResult): void {
    if (data.redirectTo) {
      window.location.href = data.redirectTo;
      return;
    }
    if (data.needsConsent) {
      setError("");
      setStatus("");
      setStep("consent");
      return;
    }
    setStatus(t("login.statusSignedIn"));
  }

  useEffect(() => {
    if (step !== "login") return;
    let cancelled = false;
    void (async () => {
      try {
        if (!(await conditionalUIAvailable())) return;
        const data = await authenticatePasskey(interactionId, true);
        if (!cancelled) applyVerify(data);
      } catch {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, interactionId]);

  const { busy: loggingIn, run: login } = useAsyncAction(async () => {
    setError("");
    setStatus(t("login.statusAuth"));
    try {
      applyVerify(await authenticatePasskey(interactionId));
    } catch (err) {
      const message = formatError(err, t);
      setStatus(message);
      setError(message);
    }
  });

  const { busy: deciding, run: decide } = useAsyncAction(async (approve: boolean) => {
    setError("");
    setStatus(approve ? t("login.statusGranting") : t("login.statusCancelling"));
    try {
      const data = await apiPost<VerifyResult>(`/interaction/${interactionId}/consent`, {
        approve,
      });
      if (data.redirectTo) {
        window.location.href = data.redirectTo;
        return;
      }
      setError(t("login.consentFailed"));
    } catch (err) {
      const message = formatError(err, t);
      setStatus(message);
      setError(message);
    }
  });

  const clientName = info?.client.name;
  const scopes = info?.scopes ?? [];

  return (
    <AuthCard>
      {step === "login" ? (
        <motion.div key="login" {...fade(reduce)} className="space-y-5">
          <header className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {t("login.eyebrow")}
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-fg">
              {clientName ?? <Skeleton className="inline-block h-6 w-44 align-middle" />}
            </h1>
          </header>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void login();
            }}
          >
            <label className="sr-only" htmlFor="login-autofill">
              {t("login.autofillLabel")}
            </label>
            <Input
              id="login-autofill"
              type="text"
              autoComplete="webauthn"
              placeholder={t("login.autofillPlaceholder")}
              icon={<KeyRound size={16} />}
              data-testid="autofill"
            />
            <PasskeyButton
              type="submit"
              loading={loggingIn}
              label={t("login.submit")}
              loadingLabel={t("login.submitBusy")}
              data-testid="login"
            />
          </form>

          {error ? <Alert tone="error">{error}</Alert> : null}

          <p className="text-center text-sm text-muted">
            {t("login.needAccount")}{" "}
            <a className="font-medium text-primary hover:underline" href="/signup">
              {t("common.signUp")}
            </a>
          </p>
        </motion.div>
      ) : (
        <motion.div key="consent" {...fade(reduce)} className="space-y-5">
          <header className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {t("login.consentEyebrow")}
            </p>
            <h1
              ref={consentHeadingRef}
              tabIndex={-1}
              className="text-xl font-semibold tracking-tight text-fg outline-none"
            >
              {clientName ?? t("login.thisApp")}
            </h1>
            <p className="text-sm text-muted">{t("login.consentWants")}</p>
          </header>

          <ul className="space-y-2">
            {scopes.map((scope) => {
              const Icon = scopeIcon(scope);
              const known = KNOWN_SCOPES.includes(scope);
              const label = known ? t(`scopes.${scope}.label`) : scope;
              const desc = known ? t(`scopes.${scope}.desc`) : t("scopes.fallbackDesc", { scope });
              return (
                <li
                  key={scope}
                  className="flex items-start gap-3 rounded-xl border border-border bg-elevated px-3 py-2.5"
                >
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <Icon size={16} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg">{label}</span>
                    <span className="block text-xs text-muted">{desc}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <span className="sr-only" data-testid="consent-scopes">
            {scopes.join(" ")}
          </span>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => void decide(true)}
              loading={deciding}
              data-testid="consent-allow"
            >
              {t("login.allow")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void decide(false)}
              disabled={deciding}
              data-testid="consent-deny"
            >
              {t("login.deny")}
            </Button>
          </div>

          {error ? <Alert tone="error">{error}</Alert> : null}
        </motion.div>
      )}

      <p className="sr-only" data-testid="status" role="status" aria-live="polite">
        {status}
      </p>
    </AuthCard>
  );
}
