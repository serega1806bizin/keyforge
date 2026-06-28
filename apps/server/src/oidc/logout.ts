import type { Request, Response } from "express";
import { createLocalJWKSet, jwtVerify } from "jose";
import { getClient } from "../clients/client-service";
import { env } from "../config/env";
import { audit } from "../lib/audit";
import { getPublicJwks } from "../keys/key-store";
import { prisma } from "../lib/prisma";
import type { FormBody } from "../lib/types";
import { clearSessionCookie, getSession } from "../session/session-service";

function audToClientId(aud: unknown): string | undefined {
  if (typeof aud === "string") return aud;
  if (Array.isArray(aud) && typeof aud[0] === "string") return aud[0];
  return undefined;
}

export async function handleLogout(req: Request, res: Response): Promise<void> {
  const q = req.query as FormBody;
  const idTokenHint = q["id_token_hint"];
  const postLogoutRedirectUri = q["post_logout_redirect_uri"];
  const state = q["state"];

  const session = await getSession(req);
  if (session) {
    await prisma.session.update({
      where: { id: session.session.id },
      data: { revokedAt: new Date() },
    });
    await audit("logout", { userId: session.user.id });
  }
  clearSessionCookie(res);

  if (postLogoutRedirectUri && idTokenHint) {
    let clientId: string | undefined;
    try {
      const jwks = createLocalJWKSet(await getPublicJwks());
      const { payload } = await jwtVerify(idTokenHint, jwks, {
        issuer: env.ISSUER_URL,
        algorithms: ["RS256"],
        clockTolerance: 86_400,
      });
      clientId = audToClientId(payload.aud);
    } catch {
      clientId = undefined;
    }
    const client = clientId ? await getClient(clientId) : null;
    if (client && client.postLogoutUris.includes(postLogoutRedirectUri)) {
      const url = new URL(postLogoutRedirectUri);
      if (state) url.searchParams.set("state", state);
      res.redirect(url.toString());
      return;
    }
  }

  res
    .type("html")
    .send(
      '<!doctype html><meta charset="utf-8"><title>Signed out</title><body style="font-family:system-ui;max-width:30rem;margin:4rem auto"><h1>Signed out</h1><p>You have been logged out of keyforge.</p></body>',
    );
}
