import { verify as argonVerify } from "@node-rs/argon2";
import type { OidcClient } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

export function getClient(clientId: string): Promise<OidcClient | null> {
  return prisma.oidcClient.findUnique({ where: { clientId } });
}

export function redirectUriAllowed(client: OidcClient, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri);
}

export function intersectScopes(requested: string[], allowed: string[]): string[] {
  return requested.filter((s) => allowed.includes(s));
}

export async function verifyClientSecret(client: OidcClient, secret: string): Promise<boolean> {
  if (!client.clientSecretHash) return false;
  try {
    return await argonVerify(client.clientSecretHash, secret);
  } catch {
    return false;
  }
}
