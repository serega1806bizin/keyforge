import {
  type AuthenticatorTransportFuture,
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { Request, Response } from "express";
import { env } from "../config/env";
import { audit } from "../lib/audit";
import { prisma } from "../lib/prisma";
import { ApiError } from "../middlewares/error";
import { consumeChallenge, storeChallenge } from "./challenge-store";
import { challengeFromClientData, utf8ToBytes } from "./codec";

export async function buildRegistrationOptions(
  user: { id: string; email: string | null; displayName: string | null },
  existing: { credentialId: string; transports: string[] }[],
) {
  const options = await generateRegistrationOptions({
    rpName: env.RP_NAME,
    rpID: env.RP_ID,
    userName: user.email ?? user.id,
    userID: utf8ToBytes(user.id),
    userDisplayName: user.displayName ?? user.email ?? "user",
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await storeChallenge({ challenge: options.challenge, type: "registration", userId: user.id });
  return options;
}

export async function registerOptions(req: Request, res: Response): Promise<void> {
  const body = req.body as { email?: unknown; displayName?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const displayName = typeof body.displayName === "string" ? body.displayName : undefined;
  if (!email) throw new ApiError(400, "email is required");

  const existing = await prisma.user.findUnique({
    where: { email },
    include: { credentials: true },
  });
  if (existing && existing.credentials.length > 0) {
    throw new ApiError(409, "account already exists, log in instead");
  }
  const user =
    existing ??
    (await prisma.user.create({ data: { email, ...(displayName ? { displayName } : {}) } }));

  const options = await buildRegistrationOptions(
    { id: user.id, email: user.email, displayName: user.displayName },
    (existing?.credentials ?? []).map((c) => ({
      credentialId: c.credentialId,
      transports: c.transports,
    })),
  );
  res.json(options);
}

export async function registerVerify(req: Request, res: Response): Promise<void> {
  const response = (
    req.body as { response?: { id?: string; response?: { clientDataJSON?: string } } }
  ).response;
  if (!response?.response?.clientDataJSON) throw new ApiError(400, "missing registration response");

  const challenge = challengeFromClientData(response.response.clientDataJSON);
  if (!challenge) throw new ApiError(400, "invalid clientDataJSON");
  const consumed = await consumeChallenge(challenge, "registration");
  if (!consumed?.userId) throw new ApiError(400, "unknown or expired challenge");

  const verification = await verifyRegistrationResponse({
    response: response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
    expectedChallenge: challenge,
    expectedOrigin: env.RP_ORIGIN,
    expectedRPID: env.RP_ID,
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new ApiError(400, "registration verification failed");
  }

  const { credential, aaguid, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  await prisma.webAuthnCredential.create({
    data: {
      userId: consumed.userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      signCount: credential.counter,
      transports: credential.transports ?? [],
      aaguid,
      deviceType: credentialDeviceType,
      backupEligible: credentialDeviceType === "multiDevice",
      backupState: credentialBackedUp,
    },
  });
  await audit("passkey.add", { userId: consumed.userId, ...(req.ip ? { ip: req.ip } : {}) });

  res.status(201).json({ verified: true });
}
