import { AuthorizeQuerySchema } from "@keyforge/shared";
import type { Request, Response } from "express";
import { env } from "../config/env";
import { getClient, intersectScopes, redirectUriAllowed } from "../clients/client-service";
import { randomToken } from "../lib/crypto";
import { prisma } from "../lib/prisma";
import type { FormBody } from "../lib/types";
import { getSession } from "../session/session-service";
import { buildCodeRedirect, issueAuthorizationCode } from "./codes";
import { consentCovers } from "./consent";

const INTERACTION_TTL_MS = 10 * 60 * 1000;

function errorPage(message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>keyforge error</title><body style="font-family:system-ui;max-width:32rem;margin:4rem auto"><h1>Authorization error</h1><p>${message}</p></body>`;
}

function redirectError(
  res: Response,
  redirectUri: string,
  error: string,
  description: string | undefined,
  state: string | undefined,
): void {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (description) url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  res.redirect(url.toString());
}

export async function handleAuthorize(req: Request, res: Response): Promise<void> {
  const raw = req.query as FormBody;
  const state = raw["state"];

  const clientId = raw["client_id"];
  if (!clientId) {
    res.status(400).type("html").send(errorPage("missing client_id"));
    return;
  }
  const client = await getClient(clientId);
  if (!client) {
    res.status(400).type("html").send(errorPage("unknown client_id"));
    return;
  }
  const redirectUri = raw["redirect_uri"];
  if (!redirectUri || !redirectUriAllowed(client, redirectUri)) {
    res.status(400).type("html").send(errorPage("invalid redirect_uri (exact match required)"));
    return;
  }

  const parsed = AuthorizeQuerySchema.safeParse(raw);
  if (!parsed.success) {
    redirectError(res, redirectUri, "invalid_request", parsed.error.issues[0]?.message, state);
    return;
  }
  const q = parsed.data;

  const requested = q.scope.split(" ").filter(Boolean);
  if (!requested.includes("openid")) {
    redirectError(res, redirectUri, "invalid_scope", "scope must include openid", state);
    return;
  }
  const granted = intersectScopes(requested, client.allowedScopes);
  if (!granted.includes("openid")) {
    redirectError(res, redirectUri, "invalid_scope", "openid not permitted for this client", state);
    return;
  }

  const grantedScope = granted.join(" ");
  const forceLogin = q.prompt === "login";
  const forceConsent = q.prompt === "consent";
  const session = await getSession(req);
  const sessionTooOld =
    q.max_age !== undefined &&
    session !== null &&
    (Date.now() - session.session.createdAt.getTime()) / 1000 > q.max_age;
  const baseData = {
    clientId,
    redirectUri,
    scope: grantedScope,
    codeChallenge: q.code_challenge,
    codeChallengeMethod: q.code_challenge_method,
    responseType: q.response_type,
    expiresAt: new Date(Date.now() + INTERACTION_TTL_MS),
    ...(q.state ? { state: q.state } : {}),
    ...(q.nonce ? { nonce: q.nonce } : {}),
    ...(q.prompt ? { prompt: q.prompt } : {}),
    ...(q.max_age !== undefined ? { maxAge: q.max_age } : {}),
    ...(q.login_hint ? { loginHint: q.login_hint } : {}),
  };

  if (session !== null && !forceLogin && !sessionTooOld) {
    const userId = session.user.id;
    const consentOk = !forceConsent && (await consentCovers(userId, clientId, granted));
    if (consentOk) {
      const code = await issueAuthorizationCode({
        clientId,
        userId,
        redirectUri,
        scope: grantedScope,
        codeChallenge: q.code_challenge,
        codeChallengeMethod: q.code_challenge_method,
        authTime: session.session.createdAt,
        amr: session.session.amr,
        acr: session.session.amr.includes("uv") ? "urn:keyforge:loa2" : "urn:keyforge:loa1",
        ...(q.nonce ? { nonce: q.nonce } : {}),
      });
      res.redirect(buildCodeRedirect(redirectUri, code, q.state));
      return;
    }
    if (q.prompt === "none") {
      redirectError(res, redirectUri, "consent_required", "consent is required", state);
      return;
    }
    const interactionId = randomToken(24);
    await prisma.authRequest.create({
      data: { ...baseData, interactionId, userId, loginCompleted: true },
    });
    res.redirect(`${env.ISSUER_URL}/login/${interactionId}`);
    return;
  }

  if (q.prompt === "none") {
    redirectError(res, redirectUri, "login_required", "authentication is required", state);
    return;
  }

  const interactionId = randomToken(24);
  await prisma.authRequest.create({ data: { ...baseData, interactionId } });
  res.redirect(`${env.ISSUER_URL}/login/${interactionId}`);
}
