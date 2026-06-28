import type { Request, Response } from "express";
import { createLocalJWKSet, jwtVerify } from "jose";
import { env } from "../config/env";
import { getPublicJwks } from "../keys/key-store";
import { prisma } from "../lib/prisma";
import { OAuthError } from "../middlewares/error";

export async function handleUserInfo(req: Request, res: Response): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    throw new OAuthError("invalid_token", 401, "missing bearer access token");
  }
  const token = auth.slice("Bearer ".length);

  const jwks = createLocalJWKSet(await getPublicJwks());
  let sub: string | undefined;
  let scope: string[] = [];
  try {
    const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      issuer: env.ISSUER_URL,
      audience: env.ISSUER_URL,
      algorithms: ["RS256"],
      clockTolerance: 60,
    });
    if (protectedHeader.typ !== "at+jwt") {
      throw new OAuthError("invalid_token", 401, "not an access token");
    }
    sub = payload.sub;
    if (typeof payload["scope"] === "string") scope = payload["scope"].split(" ");
  } catch (err) {
    if (err instanceof OAuthError) throw err;
    throw new OAuthError("invalid_token", 401, "invalid access token");
  }

  if (!sub) throw new OAuthError("invalid_token", 401, "token has no subject");
  const user = await prisma.user.findUnique({ where: { id: sub } });
  if (!user) throw new OAuthError("invalid_token", 401, "unknown subject");

  const claims: Record<string, unknown> = { sub: user.id };
  if (scope.includes("profile")) {
    claims["name"] = user.displayName;
    claims["picture"] = user.picture;
  }
  if (scope.includes("email")) {
    claims["email"] = user.email;
    claims["email_verified"] = user.emailVerified;
  }
  res.json(claims);
}
