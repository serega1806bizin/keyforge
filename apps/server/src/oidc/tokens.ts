import { createHash } from "node:crypto";
import { SignJWT } from "jose";
import { env } from "../config/env";
import { getActiveSigningKey } from "../keys/key-store";

function computeAtHash(accessToken: string): string {
  const digest = createHash("sha256").update(accessToken, "ascii").digest();
  return digest.subarray(0, digest.length / 2).toString("base64url");
}

export async function signAccessToken(params: {
  sub: string;
  clientId: string;
  scope: string;
  jti: string;
  ttl?: number;
}): Promise<{ token: string; expiresIn: number }> {
  const key = await getActiveSigningKey();
  const expiresIn = params.ttl ?? env.ACCESS_TOKEN_TTL;
  const token = await new SignJWT({ scope: params.scope, client_id: params.clientId })
    .setProtectedHeader({ alg: key.alg, kid: key.kid, typ: "at+jwt" })
    .setIssuer(env.ISSUER_URL)
    .setAudience(env.ISSUER_URL)
    .setSubject(params.sub)
    .setJti(params.jti)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(key.privateKey);
  return { token, expiresIn };
}

export async function signIdToken(params: {
  sub: string;
  aud: string;
  authTime: Date;
  accessToken: string;
  nonce?: string;
  amr?: string[];
  acr?: string;
}): Promise<string> {
  const key = await getActiveSigningKey();
  const claims: Record<string, unknown> = {
    at_hash: computeAtHash(params.accessToken),
    auth_time: Math.floor(params.authTime.getTime() / 1000),
    ...(params.nonce ? { nonce: params.nonce } : {}),
    ...(params.amr && params.amr.length ? { amr: params.amr } : {}),
    ...(params.acr ? { acr: params.acr } : {}),
  };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: key.alg, kid: key.kid, typ: "JWT" })
    .setIssuer(env.ISSUER_URL)
    .setAudience(params.aud)
    .setSubject(params.sub)
    .setIssuedAt()
    .setExpirationTime(`${env.ID_TOKEN_TTL}s`)
    .sign(key.privateKey);
}
