import { createHash } from "node:crypto";
import { safeEqual } from "../lib/crypto";

const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!VERIFIER_RE.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return safeEqual(computed, challenge);
}
