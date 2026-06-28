
import { env } from "../config/env";
import { prisma } from "../lib/prisma";

type ChallengeType = "registration" | "authentication";

export async function storeChallenge(params: {
  challenge: string;
  type: ChallengeType;
  userId?: string;
}): Promise<void> {
  await prisma.webAuthnChallenge.create({
    data: {
      challenge: params.challenge,
      type: params.type,
      expiresAt: new Date(Date.now() + env.CHALLENGE_TTL * 1000),
      ...(params.userId ? { userId: params.userId } : {}),
    },
  });
}

export async function consumeChallenge(
  challenge: string,
  type: ChallengeType,
): Promise<{ userId: string | null } | null> {
  const row = await prisma.webAuthnChallenge.findUnique({ where: { challenge } });
  if (!row || row.type !== type || row.expiresAt < new Date()) return null;
  const del = await prisma.webAuthnChallenge.deleteMany({ where: { id: row.id } });
  if (del.count !== 1) return null;
  return { userId: row.userId };
}
