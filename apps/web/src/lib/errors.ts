import type { TFunction } from "i18next";
import { ApiError } from "./api";

export class WebAuthnUIError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(key);
    this.name = "WebAuthnUIError";
    this.key = key;
  }
}

export function formatError(err: unknown, t: TFunction): string {
  if (err instanceof WebAuthnUIError) return t(err.key);
  if (err instanceof ApiError) return err.message;
  return t("errors.generic");
}
