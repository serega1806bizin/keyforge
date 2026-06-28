import { prisma } from "../lib/prisma";

export async function consentCovers(
  userId: string,
  clientId: string,
  requested: string[],
): Promise<boolean> {
  const consent = await prisma.consent.findUnique({
    where: { userId_clientId: { userId, clientId } },
  });
  if (!consent) return false;
  return requested.every((scope) => consent.scopes.includes(scope));
}

export async function rememberConsent(
  userId: string,
  clientId: string,
  scopes: string[],
): Promise<void> {
  await prisma.consent.upsert({
    where: { userId_clientId: { userId, clientId } },
    update: { scopes },
    create: { userId, clientId, scopes },
  });
}
