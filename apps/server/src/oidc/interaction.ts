import type { Request, Response } from "express";
import { isProd, env } from "../config/env";
import { getClient } from "../clients/client-service";
import type { AuthRequest } from "../generated/prisma/client";
import { param } from "../lib/http";
import { prisma } from "../lib/prisma";
import { getSession } from "../session/session-service";
import { buildCodeRedirect, issueAuthorizationCode } from "./codes";
import { consentCovers, rememberConsent } from "./consent";

const DEV_USER_EMAIL = "dev@keyforge.local";

async function loadInteraction(req: Request) {
  const interactionId = param(req, "interactionId");
  if (!interactionId) return null;
  const ar = await prisma.authRequest.findUnique({ where: { interactionId } });
  if (!ar || ar.expiresAt < new Date()) return null;
  return ar;
}

export async function finishInteraction(
  ar: AuthRequest,
  userId: string,
  amr: string[],
): Promise<string> {
  await prisma.authRequest.update({
    where: { id: ar.id },
    data: { userId, loginCompleted: true, consentCompleted: true },
  });
  const acr = amr.includes("uv") ? "urn:keyforge:loa2" : "urn:keyforge:loa1";
  const code = await issueAuthorizationCode({
    clientId: ar.clientId,
    userId,
    redirectUri: ar.redirectUri,
    scope: ar.scope,
    codeChallenge: ar.codeChallenge,
    codeChallengeMethod: ar.codeChallengeMethod,
    authTime: new Date(),
    amr,
    acr,
    ...(ar.nonce ? { nonce: ar.nonce } : {}),
  });
  return buildCodeRedirect(ar.redirectUri, code, ar.state ?? undefined);
}

export async function getInteraction(req: Request, res: Response): Promise<void> {
  const ar = await loadInteraction(req);
  if (!ar) {
    res.status(404).json({ error: "interaction_not_found" });
    return;
  }
  const client = await getClient(ar.clientId);
  const scopes = ar.scope.split(" ");
  let needs: "login" | "consent" | "done";
  if (!ar.loginCompleted || !ar.userId) needs = "login";
  else if (!(await consentCovers(ar.userId, ar.clientId, scopes))) needs = "consent";
  else needs = "done";

  res.json({
    interactionId: ar.interactionId,
    client: {
      id: ar.clientId,
      name: client?.name ?? ar.clientId,
      logoUrl: client?.logoUrl ?? null,
      brandColor: client?.brandColor ?? null,
    },
    scopes,
    needs,
    prompt: ar.prompt,
  });
}

export async function handleConsent(req: Request, res: Response): Promise<void> {
  const ar = await loadInteraction(req);
  if (!ar) {
    res.status(400).json({ error: "invalid_interaction" });
    return;
  }
  const session = await getSession(req);
  const userId = ar.userId ?? session?.user.id ?? null;
  if (!userId || !ar.loginCompleted) {
    res.status(401).json({ error: "login_required" });
    return;
  }

  const approve = (req.body as { approve?: unknown }).approve !== false;
  if (!approve) {
    const url = new URL(ar.redirectUri);
    url.searchParams.set("error", "access_denied");
    if (ar.state) url.searchParams.set("state", ar.state);
    res.json({ redirectTo: url.toString() });
    return;
  }

  const scopes = ar.scope.split(" ");
  await rememberConsent(userId, ar.clientId, scopes);
  const redirectTo = await finishInteraction(ar, userId, session?.session.amr ?? []);
  res.json({ redirectTo });
}

export async function completeInteractionStub(req: Request, res: Response): Promise<void> {
  if (isProd || !env.DEV_LOGIN_STUB) {
    res.status(404).end();
    return;
  }
  const ar = await loadInteraction(req);
  if (!ar) {
    res.status(400).json({ error: "invalid_interaction" });
    return;
  }
  const user = await prisma.user.upsert({
    where: { email: DEV_USER_EMAIL },
    update: {},
    create: { email: DEV_USER_EMAIL, emailVerified: true, displayName: "Dev User" },
  });
  const redirectTo = await finishInteraction(ar, user.id, ["dev"]);
  res.redirect(redirectTo);
}
