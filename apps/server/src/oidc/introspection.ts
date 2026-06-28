import type { Request, Response } from "express";
import { createLocalJWKSet, jwtVerify } from "jose";
import { env } from "../config/env";
import { authenticateClient } from "../clients/client-auth";
import { getPublicJwks } from "../keys/key-store";
import { sha256 } from "../lib/crypto";
import { prisma } from "../lib/prisma";
import type { FormBody } from "../lib/types";

async function introspectAccessToken(
  token: string,
  ownerClientId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const jwks = createLocalJWKSet(await getPublicJwks());
    const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      issuer: env.ISSUER_URL,
      algorithms: ["RS256"],
      clockTolerance: 60,
    });
    if (protectedHeader.typ !== "at+jwt" || payload["client_id"] !== ownerClientId) return null;
    return {
      active: true,
      token_type: "Bearer",
      sub: payload.sub,
      scope: payload["scope"],
      client_id: payload["client_id"],
      iss: payload.iss,
      aud: payload.aud,
      exp: payload.exp,
      iat: payload.iat,
      jti: payload.jti,
    };
  } catch {
    return null;
  }
}

async function introspectRefreshToken(
  token: string,
  ownerClientId: string,
): Promise<Record<string, unknown> | null> {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (
    !row ||
    row.clientId !== ownerClientId ||
    row.revokedAt ||
    row.usedAt ||
    row.expiresAt <= new Date()
  ) {
    return null;
  }
  return {
    active: true,
    token_type: "refresh_token",
    sub: row.userId,
    scope: row.scope,
    client_id: row.clientId,
    exp: Math.floor(row.expiresAt.getTime() / 1000),
  };
}

export async function handleIntrospect(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as FormBody;
  const client = await authenticateClient(req, body);
  const token = body["token"];
  if (!token) {
    res.json({ active: false });
    return;
  }

  const result = (await introspectAccessToken(token, client.clientId)) ??
    (await introspectRefreshToken(token, client.clientId)) ?? { active: false };
  res.json(result);
}
