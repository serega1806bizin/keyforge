import { Copy, Download, LogOut, Monitor, Smartphone, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PasskeyButton } from "../components/PasskeyButton";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { AuthCard, Card } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { IconButton } from "../components/ui/IconButton";
import { Skeleton } from "../components/ui/Skeleton";
import {
  apiDelete,
  apiGet,
  apiPost,
  type Me,
  type Passkey,
  type RecoveryCodesResult,
  type SessionInfo,
} from "../lib/api";
import { deviceLabel } from "../lib/device";
import { formatError } from "../lib/errors";
import { useAsyncAction } from "../lib/useAsyncAction";
import { authenticatePasskey, registerPasskey } from "../lib/webauthn";

type LoadState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "error" }
  | { kind: "ready"; me: Me; passkeys: Passkey[]; sessions: SessionInfo[] };

export function AccountPage() {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [codes, setCodes] = useState<string[] | null>(null);
  const [status, setStatus] = useState("");
  const [confirmRegen, setConfirmRegen] = useState(false);

  const refresh = useCallback(async () => {
    setState({ kind: "loading" });
    let me: Me;
    try {
      me = await apiGet<Me>("/account/me");
    } catch {
      setState({ kind: "anonymous" });
      return;
    }
    try {
      const [passkeys, sessions] = await Promise.all([
        apiGet<Passkey[]>("/account/passkeys"),
        apiGet<SessionInfo[]>("/account/sessions"),
      ]);
      setState({ kind: "ready", me, passkeys, sessions });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const { busy: loggingIn, run: login } = useAsyncAction(async () => {
    setStatus(t("account.signInBusy"));
    try {
      await authenticatePasskey();
      setStatus("");
      await refresh();
    } catch (err) {
      setStatus(formatError(err, t));
    }
  });

  const { busy: addingPasskey, run: addPasskey } = useAsyncAction(async () => {
    setStatus(t("account.statusAdding"));
    try {
      await registerPasskey();
      setStatus("");
      toast.success(t("account.toast.added"));
      await refresh();
    } catch (err) {
      const message = formatError(err, t);
      setStatus(message);
      toast.error(message);
    }
  });

  const { busy: removing, run: removePasskey } = useAsyncAction(async (id: string) => {
    try {
      await apiDelete<void>(`/account/passkeys/${id}`);
      toast.success(t("account.toast.removed"));
      await refresh();
    } catch (err) {
      const message = formatError(err, t);
      setStatus(message);
      toast.error(message || t("account.toast.deleteFail"));
    }
  });

  const { busy: revoking, run: revoke } = useAsyncAction(async (id: string) => {
    try {
      await apiDelete<void>(`/account/sessions/${id}`);
      toast.success(t("account.toast.revoked"));
      await refresh();
    } catch (err) {
      const message = formatError(err, t);
      setStatus(message);
      toast.error(message || t("account.toast.revokeFail"));
    }
  });

  const { busy: signingOut, run: signOut } = useAsyncAction(async () => {
    await apiPost<void>("/account/logout", {}).catch(() => undefined);
    setCodes(null);
    await refresh();
  });

  const { busy: generating, run: doGenerate } = useAsyncAction(async () => {
    try {
      const result = await apiPost<RecoveryCodesResult>("/account/recovery-codes", {});
      setCodes(result.codes);
      toast.success(t("account.toast.generated"));
    } catch (err) {
      const message = formatError(err, t);
      setStatus(message);
      toast.error(message || t("account.toast.generateFail"));
    }
  });

  function onGenerateClick(): void {
    if (codes) {
      setConfirmRegen(true);
      return;
    }
    void doGenerate();
  }

  async function copyCodes(): Promise<void> {
    if (!codes) return;
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.success(t("account.toast.copied"));
    } catch {
      toast.error(t("account.toast.copyFail"));
    }
  }

  function downloadCodes(): void {
    if (!codes) return;
    const blob = new Blob([`${codes.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "keyforge-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (state.kind === "loading") {
    return (
      <Card className="space-y-4 p-7 sm:p-8">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <p className="sr-only" role="status" aria-live="polite">
          {t("account.loading")}
        </p>
      </Card>
    );
  }

  if (state.kind === "anonymous") {
    return (
      <AuthCard>
        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-fg">{t("account.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("account.anonHint")}</p>
        </header>
        <PasskeyButton
          type="button"
          onClick={() => void login()}
          loading={loggingIn}
          label={t("account.signIn")}
          loadingLabel={t("account.signInBusy")}
          data-testid="account-login"
        />
        <p className="sr-only" data-testid="status" role="status" aria-live="polite">
          {status}
        </p>
      </AuthCard>
    );
  }

  if (state.kind === "error") {
    return (
      <AuthCard>
        <h1 className="mb-4 text-xl font-semibold tracking-tight text-fg">{t("account.title")}</h1>
        <Alert tone="error">{t("account.loadError")}</Alert>
        <div className="mt-4">
          <Button onClick={() => void refresh()} data-testid="retry">
            {t("account.retry")}
          </Button>
        </div>
      </AuthCard>
    );
  }

  const { me, passkeys, sessions } = state;

  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg">{me.email ?? t("account.title")}</p>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <span>{t("account.signedIn")}</span>
            {me.role === "ADMIN" ? <Badge tone="primary">{t("account.admin")}</Badge> : null}
          </div>
        </div>
        <IconButton
          label={t("account.signOut")}
          onClick={() => void signOut()}
          disabled={signingOut}
        >
          <LogOut size={18} />
        </IconButton>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">{t("account.passkeys")}</h2>
          <Badge>{passkeys.length}</Badge>
        </div>
        <ul data-testid="passkeys" className="space-y-2">
          {passkeys.map((passkey) => {
            const name = passkey.nickname ?? passkey.deviceType ?? t("account.passkeyFallback");
            const synced = passkey.backupState;
            return (
              <li
                key={passkey.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-elevated px-3 py-2.5"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  {synced ? <Smartphone size={16} /> : <Monitor size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{name}</span>
                  <span className="text-xs text-muted">
                    {synced ? t("account.synced") : t("account.deviceBound")}
                  </span>
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void removePasskey(passkey.id)}
                  disabled={removing}
                  aria-label={t("account.deleteAria", { name })}
                >
                  <Trash2 size={14} aria-hidden />
                  {t("account.delete")}
                </Button>
              </li>
            );
          })}
        </ul>
        <div className="mt-3">
          <PasskeyButton
            type="button"
            onClick={() => void addPasskey()}
            loading={addingPasskey}
            label={t("account.addPasskey")}
            loadingLabel={t("account.addPasskeyBusy")}
            data-testid="add-passkey"
          />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-fg">{t("account.sessions")}</h2>
        <ul data-testid="sessions" className="space-y-2">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-elevated px-3 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">
                  {deviceLabel(session.userAgent, t)}
                </span>
                {session.current ? (
                  <span className="text-xs text-success">{t("account.thisDevice")}</span>
                ) : null}
              </span>
              {session.current ? (
                <Badge tone="success">{t("account.current")}</Badge>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void revoke(session.id)}
                  disabled={revoking}
                  aria-label={t("account.revokeAria", { name: deviceLabel(session.userAgent, t) })}
                >
                  {t("account.revoke")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-fg">{t("account.recovery")}</h2>
        <p className="mb-3 mt-1 text-xs text-muted">{t("account.recoveryHint")}</p>
        <Button
          variant={codes ? "secondary" : "primary"}
          onClick={onGenerateClick}
          loading={generating}
          data-testid="gen-recovery"
        >
          {codes ? t("account.regenerate") : t("account.generate")}
        </Button>
        {codes ? (
          <div className="mt-3 space-y-3">
            <Alert tone="error">{t("account.recoveryWarn")}</Alert>
            <pre
              data-testid="recovery-codes"
              className="overflow-x-auto rounded-xl border border-border bg-elevated p-3 font-mono text-sm leading-6 text-fg"
            >
              {codes.join("\n")}
            </pre>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void copyCodes()}
                aria-label={t("account.copyAria")}
              >
                <Copy size={14} aria-hidden />
                {t("account.copy")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={downloadCodes}
                aria-label={t("account.downloadAria")}
              >
                <Download size={14} aria-hidden />
                {t("account.download")}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <p className="sr-only" data-testid="status" role="status" aria-live="polite">
        {status}
      </p>

      <ConfirmDialog
        open={confirmRegen}
        title={t("account.regenTitle")}
        description={t("account.regenDesc")}
        confirmLabel={t("account.regenConfirm")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        onConfirm={() => {
          setConfirmRegen(false);
          void doGenerate();
        }}
        onCancel={() => setConfirmRegen(false)}
      />
    </div>
  );
}
