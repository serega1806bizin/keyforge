import { SCOPES } from "@keyforge/shared";
import { Router } from "express";
import { env } from "../config/env";
import { getPublicJwks } from "../keys/key-store";

export const wellKnownRouter: Router = Router();

wellKnownRouter.get("/.well-known/openid-configuration", (_req, res) => {
  const issuer = env.ISSUER_URL;
  res.json({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    revocation_endpoint: `${issuer}/revoke`,
    introspection_endpoint: `${issuer}/introspect`,
    registration_endpoint: `${issuer}/register`,
    end_session_endpoint: `${issuer}/logout`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [...SCOPES],
    claims_supported: [
      "sub",
      "email",
      "email_verified",
      "name",
      "picture",
      "auth_time",
      "acr",
      "amr",
    ],
    acr_values_supported: ["urn:keyforge:loa1", "urn:keyforge:loa2"],
    authorization_response_iss_parameter_supported: true,
  });
});

wellKnownRouter.get("/.well-known/jwks.json", async (_req, res) => {
  const jwks = await getPublicJwks();
  res.set("Cache-Control", "public, max-age=300");
  res.json(jwks);
});
