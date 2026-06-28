import type { Request } from "express";
import type { OidcClient } from "../generated/prisma/client";
import type { FormBody } from "../lib/types";
import { OAuthError } from "../middlewares/error";
import { getClient, verifyClientSecret } from "./client-service";

export async function authenticateClient(req: Request, body: FormBody): Promise<OidcClient> {
  let clientId: string | undefined;
  let clientSecret: string | undefined;

  const auth = req.headers.authorization;
  if (auth?.startsWith("Basic ")) {
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    clientId = decodeURIComponent(decoded.slice(0, sep));
    clientSecret = decodeURIComponent(decoded.slice(sep + 1));
  } else {
    clientId = body["client_id"];
    clientSecret = body["client_secret"];
  }

  if (!clientId) throw new OAuthError("invalid_client", 401, "missing client_id");
  const client = await getClient(clientId);
  if (!client) throw new OAuthError("invalid_client", 401, "unknown client");

  if (client.type === "CONFIDENTIAL") {
    if (!clientSecret || !(await verifyClientSecret(client, clientSecret))) {
      throw new OAuthError("invalid_client", 401, "client authentication failed");
    }
  }
  return client;
}
