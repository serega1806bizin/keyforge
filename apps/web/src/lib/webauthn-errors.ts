import { WebAuthnError } from "@simplewebauthn/browser";

type Ceremony = "registration" | "authentication";

function domErrorName(err: unknown): string | undefined {
  if (err instanceof WebAuthnError && err.cause instanceof Error) return err.cause.name;
  if (err instanceof Error) return err.name;
  return undefined;
}

export function webauthnErrorKey(err: unknown, ceremony: Ceremony = "authentication"): string {
  console.error("[webauthn]", err);

  const name = domErrorName(err);
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  const lowered = text.toLowerCase();

  if (name === "NotAllowedError" || name === "AbortError") return "errors.cancelled";
  if (ceremony === "registration" && name === "InvalidStateError") return "errors.exists";
  if (
    lowered.includes("no-credential") ||
    lowered.includes("no_credential") ||
    lowered.includes("not found")
  ) {
    return "errors.notFound";
  }
  return "errors.generic";
}
