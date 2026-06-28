import { env } from "../config/env";
import { randomToken, sha256 } from "../lib/crypto";
import { prisma } from "../lib/prisma";

export function buildCodeRedirect(redirectUri: string, code: string, state?: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  url.searchParams.set("iss", env.ISSUER_URL);
  return url.toString();
}

export async function issueAuthorizationCode(params: {
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  authTime: Date;
  nonce?: string;
  amr?: string[];
  acr?: string;
}): Promise<string> {
  const code = randomToken(32);
  await prisma.authorizationCode.create({
    data: {
      codeHash: sha256(code),
      clientId: params.clientId,
      userId: params.userId,
      redirectUri: params.redirectUri,
      scope: params.scope,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      authTime: params.authTime,
      amr: params.amr ?? [],
      ...(params.nonce ? { nonce: params.nonce } : {}),
      ...(params.acr ? { acr: params.acr } : {}),
      expiresAt: new Date(Date.now() + env.AUTH_CODE_TTL * 1000),
    },
  });
  return code;
}
