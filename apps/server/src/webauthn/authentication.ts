import {
  type AuthenticatorTransportFuture,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { Request, Response } from "express";
import { env } from "../config/env";
import { audit } from "../lib/audit";
import { prisma } from "../lib/prisma";
import { ApiError } from "../middlewares/error";
import { consentCovers } from "../oidc/consent";
import { finishInteraction } from "../oidc/interaction";
import { createSession } from "../session/session-service";
import { consumeChallenge, storeChallenge } from "./challenge-store";
import { base64UrlToUtf8, challengeFromClientData, isCloneByCounter } from "./codec";

export async function loginOptions(req: Request, res: Response): Promise<void> {
  const body = req.body as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  let allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] = [];
  if (email) {
    const user = await prisma.user.findUnique({ where: { email }, include: { credentials: true } });
    allowCredentials = (user?.credentials ?? []).map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransportFuture[],
    }));
  }

  const options = await generateAuthenticationOptions({
    rpID: env.RP_ID,
    userVerification: "preferred",
    ...(allowCredentials.length ? { allowCredentials } : {}),
  });
  await storeChallenge({ challenge: options.challenge, type: "authentication" });
  res.json(options);
}

export async function loginVerify(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    response?: { id?: string; response?: { clientDataJSON?: string; userHandle?: string } };
    interactionId?: unknown;
  };
  const response = body.response;
  const interactionId = typeof body.interactionId === "string" ? body.interactionId : undefined;
  if (!response?.id || !response.response?.clientDataJSON)
    throw new ApiError(400, "missing response");

  const challenge = challengeFromClientData(response.response.clientDataJSON);
  if (!challenge) throw new ApiError(400, "invalid clientDataJSON");
  if (!(await consumeChallenge(challenge, "authentication"))) {
    throw new ApiError(400, "unknown or expired challenge");
  }

  const cred = await prisma.webAuthnCredential.findUnique({ where: { credentialId: response.id } });
  if (!cred) throw new ApiError(400, "unknown credential");

  const userHandle = response.response.userHandle;
  if (typeof userHandle === "string" && userHandle.length > 0) {
    if (base64UrlToUtf8(userHandle) !== cred.userId)
      throw new ApiError(400, "user handle mismatch");
  }

  const verification = await verifyAuthenticationResponse({
    response: response as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
    expectedChallenge: challenge,
    expectedOrigin: env.RP_ORIGIN,
    expectedRPID: env.RP_ID,
    credential: {
      id: cred.credentialId,
      publicKey: new Uint8Array(cred.publicKey),
      counter: cred.signCount,
      transports: cred.transports as AuthenticatorTransportFuture[],
    },
    requireUserVerification: false,
  });
  if (!verification.verified) throw new ApiError(400, "authentication verification failed");

  const { newCounter, userVerified } = verification.authenticationInfo;
  if (isCloneByCounter(cred.signCount, newCounter)) {
    await audit("login.fail.clone", {
      userId: cred.userId,
      ...(req.ip ? { ip: req.ip } : {}),
      metadata: { credentialId: cred.credentialId, stored: cred.signCount, incoming: newCounter },
    });
    throw new ApiError(400, "possible cloned authenticator (signature counter did not advance)");
  }

  await prisma.webAuthnCredential.update({
    where: { id: cred.id },
    data: { signCount: newCounter, lastUsedAt: new Date() },
  });

  const amr = userVerified ? ["webauthn", "uv"] : ["webauthn"];
  await createSession(req, res, { userId: cred.userId, amr });
  await audit("login.success", { userId: cred.userId, ...(req.ip ? { ip: req.ip } : {}) });

  if (interactionId) {
    const ar = await prisma.authRequest.findUnique({ where: { interactionId } });
    if (ar && ar.expiresAt >= new Date()) {
      await prisma.authRequest.update({
        where: { id: ar.id },
        data: { userId: cred.userId, loginCompleted: true },
      });
      if (await consentCovers(cred.userId, ar.clientId, ar.scope.split(" "))) {
        const redirectTo = await finishInteraction(ar, cred.userId, amr);
        res.json({ verified: true, redirectTo });
        return;
      }
      res.json({ verified: true, needsConsent: true, interactionId });
      return;
    }
  }
  res.json({ verified: true, userId: cred.userId });
}
