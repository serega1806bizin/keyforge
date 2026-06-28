import type { OidcClient } from "../generated/prisma/client";
import type { Request, Response } from "express";
import { env } from "../config/env";
import { authenticateClient } from "../clients/client-auth";
import { audit } from "../lib/audit";
import { randomToken, safeEqual, sha256 } from "../lib/crypto";
import { prisma } from "../lib/prisma";
import type { FormBody } from "../lib/types";
import { OAuthError } from "../middlewares/error";
import { verifyPkceS256 } from "./pkce";
import { signAccessToken, signIdToken } from "./tokens";

async function revokeFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

function issueAccessToken(params: {
  sub: string;
  client: OidcClient;
  scope: string;
}): Promise<{ token: string; expiresIn: number }> {
  return signAccessToken({
    sub: params.sub,
    clientId: params.client.clientId,
    scope: params.scope,
    jti: randomToken(16),
    ...(params.client.accessTokenTtl ? { ttl: params.client.accessTokenTtl } : {}),
  });
}

async function handleAuthorizationCodeGrant(
  req: Request,
  res: Response,
  body: FormBody,
): Promise<void> {
  const code = body["code"];
  const redirectUri = body["redirect_uri"];
  const codeVerifier = body["code_verifier"];
  if (!code) throw new OAuthError("invalid_request", 400, "missing code");
  if (!redirectUri) throw new OAuthError("invalid_request", 400, "missing redirect_uri");
  if (!codeVerifier) throw new OAuthError("invalid_request", 400, "missing code_verifier");

  const client = await authenticateClient(req, body);

  const codeRow = await prisma.authorizationCode.findUnique({ where: { codeHash: sha256(code) } });
  if (!codeRow) throw new OAuthError("invalid_grant", 400, "unknown or invalid code");

  if (codeRow.consumedAt) {
    if (codeRow.refreshFamilyId) {
      await revokeFamily(codeRow.refreshFamilyId);
      await audit("code.replay", {
        userId: codeRow.userId,
        clientId: codeRow.clientId,
        metadata: { familyId: codeRow.refreshFamilyId },
      });
    }
    throw new OAuthError("invalid_grant", 400, "code already used");
  }
  if (codeRow.clientId !== client.clientId)
    throw new OAuthError("invalid_grant", 400, "client mismatch");
  if (codeRow.expiresAt < new Date()) throw new OAuthError("invalid_grant", 400, "code expired");
  if (!safeEqual(codeRow.redirectUri, redirectUri)) {
    throw new OAuthError("invalid_grant", 400, "redirect_uri mismatch");
  }
  if (
    codeRow.codeChallengeMethod !== "S256" ||
    !verifyPkceS256(codeVerifier, codeRow.codeChallenge)
  ) {
    throw new OAuthError("invalid_grant", 400, "PKCE verification failed");
  }

  const consumed = await prisma.authorizationCode.updateMany({
    where: { id: codeRow.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) throw new OAuthError("invalid_grant", 400, "code already used");

  const { token: accessToken, expiresIn } = await issueAccessToken({
    sub: codeRow.userId,
    client,
    scope: codeRow.scope,
  });
  const idToken = await signIdToken({
    sub: codeRow.userId,
    aud: client.clientId,
    authTime: codeRow.authTime,
    accessToken,
    ...(codeRow.nonce ? { nonce: codeRow.nonce } : {}),
    ...(codeRow.amr.length ? { amr: codeRow.amr } : {}),
    ...(codeRow.acr ? { acr: codeRow.acr } : {}),
  });

  const scopes = codeRow.scope.split(" ");
  let refreshToken: string | undefined;
  if (scopes.includes("offline_access")) {
    const familyId = randomToken(16);
    refreshToken = randomToken(32);
    await prisma.refreshToken.create({
      data: {
        tokenHash: sha256(refreshToken),
        userId: codeRow.userId,
        clientId: client.clientId,
        scope: codeRow.scope,
        familyId,
        expiresAt: new Date(Date.now() + (client.refreshTokenTtl ?? env.REFRESH_TOKEN_TTL) * 1000),
      },
    });
    await prisma.authorizationCode.update({
      where: { id: codeRow.id },
      data: { refreshFamilyId: familyId },
    });
  }
  await audit("token.issue", {
    userId: codeRow.userId,
    clientId: client.clientId,
    metadata: { grant: "authorization_code" },
  });

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
    id_token: idToken,
    scope: codeRow.scope,
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
  });
}

async function handleRefreshTokenGrant(req: Request, res: Response, body: FormBody): Promise<void> {
  const presented = body["refresh_token"];
  if (!presented) throw new OAuthError("invalid_request", 400, "missing refresh_token");
  const client = await authenticateClient(req, body);

  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(presented) } });
  if (!row) throw new OAuthError("invalid_grant", 400, "unknown refresh token");
  if (row.clientId !== client.clientId)
    throw new OAuthError("invalid_grant", 400, "client mismatch");

  if (row.usedAt || row.revokedAt) {
    await revokeFamily(row.familyId);
    await audit("token.refresh.reuse", {
      userId: row.userId,
      clientId: row.clientId,
      metadata: { familyId: row.familyId },
    });
    throw new OAuthError(
      "invalid_grant",
      400,
      "refresh token reuse detected, token family revoked",
    );
  }
  if (row.expiresAt < new Date())
    throw new OAuthError("invalid_grant", 400, "refresh token expired");

  const consumed = await prisma.refreshToken.updateMany({
    where: { id: row.id, usedAt: null, revokedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) {
    await revokeFamily(row.familyId);
    await audit("token.refresh.reuse", {
      userId: row.userId,
      clientId: row.clientId,
      metadata: { familyId: row.familyId, race: true },
    });
    throw new OAuthError("invalid_grant", 400, "refresh token reuse detected");
  }

  const rotated = randomToken(32);
  await prisma.refreshToken.create({
    data: {
      tokenHash: sha256(rotated),
      userId: row.userId,
      clientId: row.clientId,
      scope: row.scope,
      familyId: row.familyId,
      rotatedFrom: row.id,
      expiresAt: row.expiresAt,
    },
  });

  const { token: accessToken, expiresIn } = await issueAccessToken({
    sub: row.userId,
    client,
    scope: row.scope,
  });
  await audit("token.refresh", {
    userId: row.userId,
    clientId: client.clientId,
    metadata: { familyId: row.familyId },
  });

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
    refresh_token: rotated,
    scope: row.scope,
  });
}

export async function handleToken(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as FormBody;
  const grantType = body["grant_type"];
  if (grantType === "authorization_code") {
    await handleAuthorizationCodeGrant(req, res, body);
    return;
  }
  if (grantType === "refresh_token") {
    await handleRefreshTokenGrant(req, res, body);
    return;
  }
  throw new OAuthError(
    "unsupported_grant_type",
    400,
    `unsupported grant_type: ${grantType ?? "(none)"}`,
  );
}
