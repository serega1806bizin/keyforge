import { SCOPES } from "@keyforge/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { audit } from "../lib/audit";
import { randomToken } from "../lib/crypto";
import { hashSecret } from "../lib/password";
import { prisma } from "../lib/prisma";
import { OAuthError } from "../middlewares/error";

const RegisterSchema = z.object({
  client_name: z.string().min(1).max(120).optional(),
  redirect_uris: z.array(z.url()).min(1).max(20),
  token_endpoint_auth_method: z
    .enum(["none", "client_secret_basic", "client_secret_post"])
    .default("none"),
  scope: z.string().optional(),
  post_logout_redirect_uris: z.array(z.url()).max(20).optional(),
});

export async function handleRegister(req: Request, res: Response): Promise<void> {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new OAuthError("invalid_client_metadata", 400, parsed.error.issues[0]?.message);
  }
  const d = parsed.data;
  const type = d.token_endpoint_auth_method === "none" ? "PUBLIC" : "CONFIDENTIAL";
  const clientId = randomToken(12);
  const requested = d.scope ? d.scope.split(" ").filter(Boolean) : [...SCOPES];
  const scopes = requested.filter((s) => (SCOPES as readonly string[]).includes(s));
  if (!scopes.includes("openid")) scopes.unshift("openid");

  let secret: string | undefined;
  let clientSecretHash: string | null = null;
  if (type === "CONFIDENTIAL") {
    secret = randomToken(24);
    clientSecretHash = await hashSecret(secret);
  }

  await prisma.oidcClient.create({
    data: {
      clientId,
      clientSecretHash,
      name: d.client_name ?? "Dynamic Client",
      type,
      redirectUris: d.redirect_uris,
      postLogoutUris: d.post_logout_redirect_uris ?? [],
      allowedScopes: scopes,
      tokenAuthMethod: d.token_endpoint_auth_method,
    },
  });
  await audit("client.register.dynamic", { clientId });

  res.status(201).json({
    client_id: clientId,
    ...(secret ? { client_secret: secret } : {}),
    client_name: d.client_name ?? "Dynamic Client",
    redirect_uris: d.redirect_uris,
    token_endpoint_auth_method: d.token_endpoint_auth_method,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: scopes.join(" "),
  });
}
