import * as client from "openid-client";
import { describe, expect, it } from "vitest";

const ISSUER = new URL(process.env["ISSUER_URL"] ?? "http://localhost:3000");
const CLIENT_ID = "sample-rp";
const REDIRECT_URI = "http://localhost:4000/callback";
const SCOPE = "openid profile email offline_access";
const HDRS = { "content-type": "application/x-www-form-urlencoded" };

function getConfig(): ReturnType<typeof client.discovery> {
  return client.discovery(ISSUER, CLIENT_ID, undefined, client.None(), {
    execute: [client.allowInsecureRequests],
  });
}

async function driveToCallback(authUrl: URL): Promise<URL> {
  const r1 = await fetch(authUrl, { redirect: "manual" });
  expect(r1.status).toBe(302);
  const loginLoc = r1.headers.get("location");
  expect(loginLoc).toContain("/login/");
  const interactionId = new URL(loginLoc!).pathname.split("/login/")[1];

  const r2 = await fetch(new URL(`/interaction/${interactionId}/complete`, ISSUER), {
    method: "POST",
    redirect: "manual",
  });
  expect(r2.status).toBe(302);
  const callbackLoc = r2.headers.get("location");
  expect(callbackLoc).toContain(`${REDIRECT_URI}?`);
  return new URL(callbackLoc!);
}

function randHex(): string {
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

function rawAuthorizeUrl(params: Record<string, string>): URL {
  const url = new URL("/authorize", ISSUER);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}

describe("keyforge OIDC/OAuth conformance", () => {
  it("publishes a discovery document with all REQUIRED fields and an exact issuer", async () => {
    const res = await fetch(new URL("/.well-known/openid-configuration", ISSUER));
    expect(res.status).toBe(200);
    const meta = (await res.json()) as Record<string, unknown>;

    expect(meta["issuer"]).toBe(ISSUER.origin);

    expect(typeof meta["authorization_endpoint"]).toBe("string");
    expect(typeof meta["token_endpoint"]).toBe("string");
    expect(typeof meta["jwks_uri"]).toBe("string");

    expect(meta["response_types_supported"]).toContain("code");
    expect(Array.isArray(meta["subject_types_supported"])).toBe(true);
    expect((meta["subject_types_supported"] as unknown[]).length).toBeGreaterThan(0);

    expect(meta["id_token_signing_alg_values_supported"]).toContain("RS256");

    expect(meta["code_challenge_methods_supported"]).toEqual(["S256"]);
  });

  it("serves a JWKS with at least one RSA signing key and no private material", async () => {
    const res = await fetch(new URL("/.well-known/jwks.json", ISSUER));
    expect(res.status).toBe(200);
    const jwks = (await res.json()) as { keys: Array<Record<string, unknown>> };
    expect(Array.isArray(jwks.keys)).toBe(true);

    const rsaSig = jwks.keys.filter(
      (k) => k["kty"] === "RSA" && (k["use"] === "sig" || k["use"] === undefined),
    );
    expect(rsaSig.length).toBeGreaterThanOrEqual(1);

    for (const k of jwks.keys) {
      expect(typeof k["kid"]).toBe("string");
      expect((k["kid"] as string).length).toBeGreaterThan(0);
      expect(k["d"]).toBeUndefined();
      expect(k["p"]).toBeUndefined();
      expect(k["q"]).toBeUndefined();
    }
    const rsa = rsaSig[0]!;
    expect(typeof rsa["n"]).toBe("string");
    expect(typeof rsa["e"]).toBe("string");
  });

  it("issues an id_token that validates and contains iss/aud/sub/exp/iat/nonce/at_hash/auth_time", async () => {
    const config = await getConfig();
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const nonce = client.randomNonce();

    const authUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      nonce,
    });

    const callbackUrl = await driveToCallback(authUrl);
    expect(callbackUrl.searchParams.get("state")).toBe(state);

    const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState: state,
    });
    expect(tokens.id_token).toBeTruthy();
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.token_type?.toLowerCase()).toBe("bearer");

    const claims = tokens.claims()!;
    expect(claims.iss).toBe(ISSUER.origin);
    expect(claims.aud).toBe(CLIENT_ID);
    expect(typeof claims.sub).toBe("string");
    expect(claims.sub).toBeTruthy();
    expect(typeof claims.exp).toBe("number");
    expect(typeof claims.iat).toBe("number");
    expect(claims.exp).toBeGreaterThan(claims.iat as number);
    expect(claims.nonce).toBe(nonce);
    expect(typeof claims["at_hash"]).toBe("string");
    expect(typeof claims["auth_time"]).toBe("number");
  });

  it("rejects an /authorize that omits code_challenge (PKCE required)", async () => {
    const authUrl = rawAuthorizeUrl({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "openid",
      state: randHex(),
      nonce: randHex(),
    });
    const r = await fetch(authUrl, { redirect: "manual" });
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.get("location")!);
    expect(loc.pathname).not.toContain("/login/");
    expect(loc.searchParams.get("error")).toBe("invalid_request");
  });

  it("rejects a /token exchange that presents the wrong PKCE code_verifier", async () => {
    const config = await getConfig();
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const authUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: REDIRECT_URI,
      scope: "openid",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state: client.randomState(),
      nonce: client.randomNonce(),
    });
    const code = (await driveToCallback(authUrl)).searchParams.get("code")!;

    const bad = await fetch(new URL("/token", ISSUER), {
      method: "POST",
      headers: HDRS,
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: client.randomPKCECodeVerifier(),
        client_id: CLIENT_ID,
      }),
    });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error?: string }).error).toBe("invalid_grant");
  });

  it("rejects code_challenge_method=plain at /authorize (S256 only)", async () => {
    const codeChallenge = "plainchallengevaluethatislongenough43chars_aaaa";
    const authUrl = rawAuthorizeUrl({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "openid",
      code_challenge: codeChallenge,
      code_challenge_method: "plain",
      state: randHex(),
      nonce: randHex(),
    });
    const r = await fetch(authUrl, { redirect: "manual" });
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.get("location")!);
    expect(loc.pathname).not.toContain("/login/");
    expect(loc.searchParams.get("error")).toBe("invalid_request");
  });

  it("returns {error:'unsupported_grant_type'} for an unknown grant_type", async () => {
    const r = await fetch(new URL("/token", ISSUER), {
      method: "POST",
      headers: HDRS,
      body: new URLSearchParams({ grant_type: "password", client_id: CLIENT_ID }),
    });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error?: string }).error).toBe("unsupported_grant_type");
  });

  it("returns {error:'invalid_request'} for an authorization_code grant missing the code", async () => {
    const r = await fetch(new URL("/token", ISSUER), {
      method: "POST",
      headers: HDRS,
      body: new URLSearchParams({
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
        code_verifier: client.randomPKCECodeVerifier(),
        client_id: CLIENT_ID,
      }),
    });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error?: string }).error).toBe("invalid_request");
  });

  it("enforces a Bearer access token at /userinfo (401 without, claims with)", async () => {
    const noAuth = await fetch(new URL("/userinfo", ISSUER));
    expect(noAuth.status).toBe(401);

    const config = await getConfig();
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const nonce = client.randomNonce();
    const authUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: REDIRECT_URI,
      scope: "openid profile email",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      nonce,
    });
    const callbackUrl = await driveToCallback(authUrl);
    const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState: state,
    });
    const claims = tokens.claims()!;

    const ok = await fetch(new URL("/userinfo", ISSUER), {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(ok.status).toBe(200);
    const info = (await ok.json()) as { sub?: string };
    expect(info.sub).toBe(claims.sub);
  });

  it("includes iss == issuer in the authorization response (RFC 9207)", async () => {
    const verifier = client.randomPKCECodeVerifier();
    const challenge = await client.calculatePKCECodeChallenge(verifier);
    const authUrl = rawAuthorizeUrl({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: SCOPE,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: randHex(),
      nonce: randHex(),
    });
    const cb = await driveToCallback(authUrl);
    expect(cb.searchParams.get("iss")).toBe(ISSUER.origin);
  });
});
