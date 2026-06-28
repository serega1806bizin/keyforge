import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { sessionRow, sessionUser } from "../middlewares/auth";
import { audit } from "../lib/audit";
import { param } from "../lib/http";
import { hashSecret, verifySecret } from "../lib/password";
import { prisma } from "../lib/prisma";
import { ApiError } from "../middlewares/error";
import { clearSessionCookie, createSession } from "../session/session-service";
import { buildRegistrationOptions } from "../webauthn/registration";

function recoveryCode(): string {
  const hex = randomBytes(10).toString("hex");
  return (hex.match(/.{1,5}/g) ?? [hex]).join("-");
}

let dummyHash: string | null = null;
async function dummyVerify(code: string): Promise<void> {
  dummyHash ??= await hashSecret("keyforge-recovery-timing-probe");
  await verifySecret(dummyHash, code).catch(() => false);
}

export function getMe(_req: Request, res: Response): void {
  const user = sessionUser(res);
  res.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    role: user.role,
  });
}

export async function listPasskeys(_req: Request, res: Response): Promise<void> {
  const user = sessionUser(res);
  const creds = await prisma.webAuthnCredential.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  res.json(
    creds.map((c) => ({
      id: c.id,
      nickname: c.nickname,
      deviceType: c.deviceType,
      backupState: c.backupState,
      transports: c.transports,
      lastUsedAt: c.lastUsedAt,
      createdAt: c.createdAt,
    })),
  );
}

export async function addPasskeyOptions(_req: Request, res: Response): Promise<void> {
  const user = sessionUser(res);
  const existing = await prisma.webAuthnCredential.findMany({ where: { userId: user.id } });
  const options = await buildRegistrationOptions(
    { id: user.id, email: user.email, displayName: user.displayName },
    existing.map((c) => ({ credentialId: c.credentialId, transports: c.transports })),
  );
  res.json(options);
}

export async function renamePasskey(req: Request, res: Response): Promise<void> {
  const user = sessionUser(res);
  const id = param(req, "id");
  const body = req.body as { nickname?: unknown };
  const nickname = typeof body.nickname === "string" ? body.nickname.slice(0, 64) : null;
  const cred = await prisma.webAuthnCredential.findUnique({ where: { id } });
  if (!cred || cred.userId !== user.id) throw new ApiError(404, "passkey not found");
  await prisma.webAuthnCredential.update({ where: { id }, data: { nickname } });
  res.json({ ok: true });
}

export async function deletePasskey(req: Request, res: Response): Promise<void> {
  const user = sessionUser(res);
  const id = param(req, "id");
  const cred = await prisma.webAuthnCredential.findUnique({ where: { id } });
  if (!cred || cred.userId !== user.id) throw new ApiError(404, "passkey not found");

  const remainingPasskeys = await prisma.webAuthnCredential.count({ where: { userId: user.id } });
  const unusedRecovery = await prisma.recoveryCode.count({
    where: { userId: user.id, usedAt: null },
  });
  if (remainingPasskeys <= 1 && unusedRecovery === 0) {
    throw new ApiError(
      409,
      "cannot remove your last sign-in factor; add another passkey or recovery codes first",
    );
  }
  await prisma.webAuthnCredential.delete({ where: { id } });
  await audit("passkey.remove", { userId: user.id });
  res.json({ ok: true });
}

export async function listSessions(_req: Request, res: Response): Promise<void> {
  const user = sessionUser(res);
  const current = sessionRow(res);
  const sessions = await prisma.session.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
  });
  res.json(
    sessions.map((s) => ({
      id: s.id,
      current: s.id === current.id,
      userAgent: s.userAgent,
      ip: s.ip,
      amr: s.amr,
      lastSeenAt: s.lastSeenAt,
      createdAt: s.createdAt,
    })),
  );
}

export async function revokeSession(req: Request, res: Response): Promise<void> {
  const user = sessionUser(res);
  const id = param(req, "id");
  const s = await prisma.session.findUnique({ where: { id } });
  if (!s || s.userId !== user.id) throw new ApiError(404, "session not found");
  await prisma.session.update({ where: { id }, data: { revokedAt: new Date() } });
  res.json({ ok: true });
}

export async function logout(_req: Request, res: Response): Promise<void> {
  const current = sessionRow(res);
  await prisma.session.update({ where: { id: current.id }, data: { revokedAt: new Date() } });
  clearSessionCookie(res);
  res.json({ ok: true });
}

export async function generateRecoveryCodes(_req: Request, res: Response): Promise<void> {
  const user = sessionUser(res);
  await prisma.recoveryCode.deleteMany({ where: { userId: user.id } });
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const code = recoveryCode();
    codes.push(code);
    await prisma.recoveryCode.create({
      data: { userId: user.id, codeHash: await hashSecret(code) },
    });
  }
  await audit("recovery.generate", { userId: user.id });
  res.json({ codes });
}

export async function recoveryLogin(req: Request, res: Response): Promise<void> {
  const body = req.body as { email?: unknown; code?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const invalid = new ApiError(401, "invalid email or recovery code");
  if (!email || !code) throw invalid;

  const user = await prisma.user.findUnique({ where: { email } });
  const candidates = user
    ? await prisma.recoveryCode.findMany({ where: { userId: user.id, usedAt: null } })
    : [];

  let matched: (typeof candidates)[number] | undefined;
  for (const rc of candidates) {
    if (await verifySecret(rc.codeHash, code)) {
      matched = rc;
      break;
    }
  }

  if (!user || !matched) {
    if (!user) await dummyVerify(code);
    await audit("login.recovery.fail", {
      ...(user ? { userId: user.id } : {}),
      ...(req.ip ? { ip: req.ip } : {}),
    });
    throw invalid;
  }

  await prisma.recoveryCode.update({ where: { id: matched.id }, data: { usedAt: new Date() } });
  await createSession(req, res, { userId: user.id, amr: ["recovery"] });
  await audit("login.recovery", { userId: user.id, ...(req.ip ? { ip: req.ip } : {}) });
  res.json({ ok: true });
}
