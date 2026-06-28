import type { Request, Response } from "express";
import { env, isProd } from "../config/env";
import type { Session, User } from "../generated/prisma/client";
import { randomToken, sha256 } from "../lib/crypto";
import { prisma } from "../lib/prisma";

export const SESSION_COOKIE = isProd ? "__Host-kf_sid" : "kf_sid";

export async function createSession(
  req: Request,
  res: Response,
  params: { userId: string; amr: string[] },
): Promise<void> {
  const token = randomToken(32);
  const userAgent = req.get("user-agent");
  await prisma.session.create({
    data: {
      userId: params.userId,
      sessionHash: sha256(token),
      amr: params.amr,
      absoluteExp: new Date(Date.now() + env.SESSION_ABSOLUTE_TTL * 1000),
      ...(userAgent ? { userAgent } : {}),
      ...(req.ip ? { ip: req.ip } : {}),
    },
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd || req.secure,
    path: "/",
    maxAge: env.SESSION_ABSOLUTE_TTL * 1000,
  });
}

export async function getSession(req: Request): Promise<{ session: Session; user: User } | null> {
  const token = (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length === 0) return null;

  const session = await prisma.session.findUnique({
    where: { sessionHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt) return null;

  const now = new Date();
  if (session.absoluteExp < now) return null;
  if (now.getTime() - session.lastSeenAt.getTime() > env.SESSION_IDLE_TTL * 1000) return null;

  await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  return { session, user: session.user };
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: isProd, path: "/" });
}
