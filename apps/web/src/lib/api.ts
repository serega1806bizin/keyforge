import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (code !== undefined) this.code = code;
  }
}

interface ErrorBody {
  error?: string;
  message?: string;
}

async function readJSON<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(res.status, `Malformed JSON response from ${res.url}`);
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      credentials: "same-origin",
      signal: controller.signal,
      ...init,
    });

    if (!res.ok) {
      const body = await readJSON<ErrorBody>(res).catch(() => undefined);
      const code = body?.error;
      const message = body?.message ?? code ?? `Request to ${path} failed (${res.status})`;
      throw new ApiError(res.status, message, code);
    }

    return await readJSON<T>(res);
  } finally {
    clearTimeout(timer);
  }
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

export interface VerifyResult {
  redirectTo?: string;
  needsConsent?: boolean;
}

export interface InteractionInfo {
  client: { name: string };
  scopes: string[];
  needs: "login" | "consent" | "done";
}

export interface Me {
  email: string | null;
  role: string;
}

export interface Passkey {
  id: string;
  nickname: string | null;
  deviceType: string | null;
  backupState: boolean;
}

export interface SessionInfo {
  id: string;
  current: boolean;
  userAgent: string | null;
}

export interface RecoveryCodesResult {
  codes: string[];
}

export type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
};
