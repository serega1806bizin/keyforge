import { SCOPES } from "@keyforge/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import type { OidcClient } from "../generated/prisma/client";
import { listKeys, rotateSigningKey } from "../keys/key-store";
import { audit } from "../lib/audit";
import { randomToken } from "../lib/crypto";
import { param } from "../lib/http";
import { hashSecret } from "../lib/password";
import { prisma } from "../lib/prisma";
import { ApiError } from "../middlewares/error";

export const ClientInput = z.object({
  name: z.string().min(1),
  type: z.enum(["PUBLIC", "CONFIDENTIAL"]).default("PUBLIC"),
  redirectUris: z.array(z.url()).min(1).max(20),
  postLogoutUris: z.array(z.url()).max(20).default([]),
  allowedScopes: z.array(z.enum(SCOPES)).default([...SCOPES]),
  accessTokenTtl: z.number().int().positive().optional(),
  refreshTokenTtl: z.number().int().positive().optional(),
  logoUrl: z.url().optional(),
  brandColor: z.string().optional(),
});
export const ClientUpdateInput = ClientInput.partial();
type ClientCreate = z.infer<typeof ClientInput>;
type ClientUpdate = z.infer<typeof ClientUpdateInput>;

function redact(c: OidcClient) {
  return {
    id: c.id,
    clientId: c.clientId,
    name: c.name,
    type: c.type,
    redirectUris: c.redirectUris,
    postLogoutUris: c.postLogoutUris,
    allowedScopes: c.allowedScopes,
    tokenAuthMethod: c.tokenAuthMethod,
    accessTokenTtl: c.accessTokenTtl,
    refreshTokenTtl: c.refreshTokenTtl,
    logoUrl: c.logoUrl,
    brandColor: c.brandColor,
    createdAt: c.createdAt,
    hasSecret: c.clientSecretHash !== null,
  };
}

export async function listClients(_req: Request, res: Response): Promise<void> {
  const clients = await prisma.oidcClient.findMany({ orderBy: { createdAt: "desc" } });
  res.json(clients.map(redact));
}

export async function createClient(req: Request, res: Response): Promise<void> {
  const d = req.body as ClientCreate;

  const clientId = randomToken(12);
  let secret: string | undefined;
  let clientSecretHash: string | null = null;
  if (d.type === "CONFIDENTIAL") {
    secret = randomToken(24);
    clientSecretHash = await hashSecret(secret);
  }

  const client = await prisma.oidcClient.create({
    data: {
      clientId,
      clientSecretHash,
      name: d.name,
      type: d.type,
      redirectUris: d.redirectUris,
      postLogoutUris: d.postLogoutUris,
      allowedScopes: d.allowedScopes,
      tokenAuthMethod: d.type === "PUBLIC" ? "none" : "client_secret_basic",
      ...(d.accessTokenTtl ? { accessTokenTtl: d.accessTokenTtl } : {}),
      ...(d.refreshTokenTtl ? { refreshTokenTtl: d.refreshTokenTtl } : {}),
      ...(d.logoUrl ? { logoUrl: d.logoUrl } : {}),
      ...(d.brandColor ? { brandColor: d.brandColor } : {}),
    },
  });
  await audit("client.create", { clientId, metadata: { name: d.name } });
  res.status(201).json({ ...redact(client), ...(secret ? { clientSecret: secret } : {}) });
}

export async function getOneClient(req: Request, res: Response): Promise<void> {
  const client = await prisma.oidcClient.findUnique({
    where: { clientId: param(req, "clientId") },
  });
  if (!client) throw new ApiError(404, "client not found");
  res.json(redact(client));
}

export async function updateClient(req: Request, res: Response): Promise<void> {
  const clientId = param(req, "clientId");
  if (!(await prisma.oidcClient.findUnique({ where: { clientId } }))) {
    throw new ApiError(404, "client not found");
  }
  const d = req.body as ClientUpdate;

  const client = await prisma.oidcClient.update({
    where: { clientId },
    data: {
      ...(d.name ? { name: d.name } : {}),
      ...(d.type
        ? { type: d.type, tokenAuthMethod: d.type === "PUBLIC" ? "none" : "client_secret_basic" }
        : {}),
      ...(d.redirectUris ? { redirectUris: d.redirectUris } : {}),
      ...(d.postLogoutUris ? { postLogoutUris: d.postLogoutUris } : {}),
      ...(d.allowedScopes ? { allowedScopes: d.allowedScopes } : {}),
      ...(d.accessTokenTtl ? { accessTokenTtl: d.accessTokenTtl } : {}),
      ...(d.refreshTokenTtl ? { refreshTokenTtl: d.refreshTokenTtl } : {}),
      ...(d.logoUrl ? { logoUrl: d.logoUrl } : {}),
      ...(d.brandColor ? { brandColor: d.brandColor } : {}),
    },
  });
  await audit("client.update", { clientId });
  res.json(redact(client));
}

export async function deleteClient(req: Request, res: Response): Promise<void> {
  const clientId = param(req, "clientId");
  if (!(await prisma.oidcClient.findUnique({ where: { clientId } }))) {
    throw new ApiError(404, "client not found");
  }
  await prisma.oidcClient.delete({ where: { clientId } });
  await audit("client.delete", { clientId });
  res.json({ ok: true });
}

export async function listKeysHandler(_req: Request, res: Response): Promise<void> {
  res.json(await listKeys());
}

export async function rotateKeyHandler(_req: Request, res: Response): Promise<void> {
  const key = await rotateSigningKey();
  await audit("key.rotate", { metadata: { kid: key.kid } });
  res.json({ kid: key.kid, alg: key.alg });
}
