import * as client from "openid-client";
import { describe, expect, it } from "vitest";

const ISSUER = new URL(process.env["ISSUER_URL"] ?? "http://localhost:3000");
const CLIENT_ID = "sample-rp";
const REDIRECT_URI = "http://localhost:4000/callback";
const SCOPE = "openid profile email offline_access";

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

describe("sample-rp OIDC end-to-end", () => {
  it("completes authorization-code + PKCE and reads userinfo", async () => {
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
    expect(callbackUrl.searchParams.get("code")).toBeTruthy();

    const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState: state,
    });
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.id_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();

    const claims = tokens.claims()!;
    expect(claims.iss).toBe(ISSUER.origin);
    expect(claims.aud).toBe(CLIENT_ID);
    expect(claims.nonce).toBe(nonce);
    expect(claims.sub).toBeTruthy();

    const info = await client.fetchUserInfo(config, tokens.access_token, claims.sub);
    expect(info.sub).toBe(claims.sub);
    expect(info.email).toBe("dev@keyforge.local");
  });

  it("rejects authorization-code replay (single-use)", async () => {
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
    const callbackUrl = await driveToCallback(authUrl);
    const code = callbackUrl.searchParams.get("code")!;

    const tokenBody = (): URLSearchParams =>
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
        client_id: CLIENT_ID,
      });
    const headers = { "content-type": "application/x-www-form-urlencoded" };

    const first = await fetch(new URL("/token", ISSUER), {
      method: "POST",
      headers,
      body: tokenBody(),
    });
    expect(first.status).toBe(200);

    const replay = await fetch(new URL("/token", ISSUER), {
      method: "POST",
      headers,
      body: tokenBody(),
    });
    expect(replay.status).toBe(400);
    const replayBody = (await replay.json()) as { error?: string };
    expect(replayBody.error).toBe("invalid_grant");
  });

  it("rejects PKCE verifier mismatch", async () => {
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
    const callbackUrl = await driveToCallback(authUrl);
    const code = callbackUrl.searchParams.get("code")!;

    const bad = await fetch(new URL("/token", ISSUER), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
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

  it("rotates refresh tokens and revokes the whole family on reuse", async () => {
    const config = await getConfig();
    const verifier = client.randomPKCECodeVerifier();
    const challenge = await client.calculatePKCECodeChallenge(verifier);
    const authUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: client.randomState(),
      nonce: client.randomNonce(),
    });
    const code = (await driveToCallback(authUrl)).searchParams.get("code")!;

    const token = (params: Record<string, string>) =>
      fetch(new URL("/token", ISSUER), {
        method: "POST",
        headers: HDRS,
        body: new URLSearchParams(params),
      });

    const first = await (
      await token({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
        client_id: CLIENT_ID,
      })
    ).json();
    expect(first.refresh_token, "offline_access yields a refresh token").toBeTruthy();
    const rt1 = first.refresh_token as string;

    const rotated = await token({
      grant_type: "refresh_token",
      refresh_token: rt1,
      client_id: CLIENT_ID,
    });
    expect(rotated.status).toBe(200);
    const rt2 = ((await rotated.json()) as { refresh_token: string }).refresh_token;
    expect(rt2).toBeTruthy();
    expect(rt2).not.toBe(rt1);

    const reuse = await token({
      grant_type: "refresh_token",
      refresh_token: rt1,
      client_id: CLIENT_ID,
    });
    expect(reuse.status).toBe(400);
    expect(((await reuse.json()) as { error?: string }).error).toBe("invalid_grant");

    const after = await token({
      grant_type: "refresh_token",
      refresh_token: rt2,
      client_id: CLIENT_ID,
    });
    expect(after.status).toBe(400);
    expect(((await after.json()) as { error?: string }).error).toBe("invalid_grant");
  });

  it("revokes the issued refresh family when the authorization code is replayed", async () => {
    const config = await getConfig();
    const verifier = client.randomPKCECodeVerifier();
    const challenge = await client.calculatePKCECodeChallenge(verifier);
    const authUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: client.randomState(),
      nonce: client.randomNonce(),
    });
    const code = (await driveToCallback(authUrl)).searchParams.get("code")!;
    const token = (params: Record<string, string>) =>
      fetch(new URL("/token", ISSUER), {
        method: "POST",
        headers: HDRS,
        body: new URLSearchParams(params),
      });

    const issued = (await (
      await token({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
        client_id: CLIENT_ID,
      })
    ).json()) as { refresh_token: string };
    const rt = issued.refresh_token;
    expect(rt).toBeTruthy();

    const replay = await token({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      client_id: CLIENT_ID,
    });
    expect(replay.status).toBe(400);
    expect(((await replay.json()) as { error?: string }).error).toBe("invalid_grant");

    const useRt = await token({
      grant_type: "refresh_token",
      refresh_token: rt,
      client_id: CLIENT_ID,
    });
    expect(useRt.status).toBe(400);
    expect(((await useRt.json()) as { error?: string }).error).toBe("invalid_grant");
  });

  function authUrlFor(
    clientId: string,
    redirectUri: string,
    challenge: string,
    state: string,
  ): string {
    return (
      `${ISSUER.origin}/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code&scope=${encodeURIComponent(SCOPE)}&code_challenge=${challenge}` +
      `&code_challenge_method=S256&state=${state}&nonce=${randHex()}`
    );
  }
  const tok = (p: Record<string, string>) =>
    fetch(new URL("/token", ISSUER), {
      method: "POST",
      headers: HDRS,
      body: new URLSearchParams(p),
    });

  it("includes iss in the authorization response (RFC 9207)", async () => {
    const verifier = client.randomPKCECodeVerifier();
    const challenge = await client.calculatePKCECodeChallenge(verifier);
    const cb = await driveToCallback(
      new URL(authUrlFor(CLIENT_ID, REDIRECT_URI, challenge, randHex())),
    );
    expect(cb.searchParams.get("iss")).toBe(ISSUER.origin);
  });

  it("registers a client dynamically (RFC 7591) that can complete a flow", async () => {
    const reg = await fetch(new URL("/register", ISSUER), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Dyn",
        redirect_uris: [REDIRECT_URI],
        token_endpoint_auth_method: "none",
      }),
    });
    expect(reg.status).toBe(201);
    const reg2 = (await reg.json()) as { client_id: string };
    expect(reg2.client_id).toBeTruthy();

    const verifier = client.randomPKCECodeVerifier();
    const challenge = await client.calculatePKCECodeChallenge(verifier);
    const cb = await driveToCallback(
      new URL(authUrlFor(reg2.client_id, REDIRECT_URI, challenge, randHex())),
    );
    const code = cb.searchParams.get("code")!;
    const tokens = (await (
      await tok({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
        client_id: reg2.client_id,
      })
    ).json()) as { id_token?: string };
    expect(tokens.id_token).toBeTruthy();
  });

  it("introspects (RFC 7662) and revokes (RFC 7009) tokens", async () => {
    const verifier = client.randomPKCECodeVerifier();
    const challenge = await client.calculatePKCECodeChallenge(verifier);
    const cb = await driveToCallback(
      new URL(authUrlFor(CLIENT_ID, REDIRECT_URI, challenge, randHex())),
    );
    const code = cb.searchParams.get("code")!;
    const tokens = (await (
      await tok({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
        client_id: CLIENT_ID,
      })
    ).json()) as { access_token: string; refresh_token: string };

    const introspect = (p: Record<string, string>) =>
      fetch(new URL("/introspect", ISSUER), {
        method: "POST",
        headers: HDRS,
        body: new URLSearchParams(p),
      }).then((r) => r.json());

    const active = (await introspect({ token: tokens.access_token, client_id: CLIENT_ID })) as {
      active: boolean;
      token_type?: string;
    };
    expect(active.active).toBe(true);
    expect(active.token_type).toBe("Bearer");
    const inactive = (await introspect({ token: "not-a-real-token", client_id: CLIENT_ID })) as {
      active: boolean;
    };
    expect(inactive.active).toBe(false);

    const rev = await fetch(new URL("/revoke", ISSUER), {
      method: "POST",
      headers: HDRS,
      body: new URLSearchParams({ token: tokens.refresh_token, client_id: CLIENT_ID }),
    });
    expect(rev.status).toBe(200);
    const afterRevoke = await tok({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: CLIENT_ID,
    });
    expect(afterRevoke.status).toBe(400);
  });

  it("RP-initiated logout redirects to a registered post_logout_redirect_uri", async () => {
    const config = await getConfig();
    const verifier = client.randomPKCECodeVerifier();
    const challenge = await client.calculatePKCECodeChallenge(verifier);
    const state = client.randomState();
    const nonce = client.randomNonce();
    const cb = await driveToCallback(
      client.buildAuthorizationUrl(config, {
        redirect_uri: REDIRECT_URI,
        scope: "openid",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        nonce,
      }),
    );
    const tokens = await client.authorizationCodeGrant(config, cb, {
      pkceCodeVerifier: verifier,
      expectedState: state,
      expectedNonce: nonce,
    });
    const logoutUrl = new URL("/logout", ISSUER);
    logoutUrl.searchParams.set("id_token_hint", tokens.id_token!);
    logoutUrl.searchParams.set("post_logout_redirect_uri", "http://localhost:4000");
    logoutUrl.searchParams.set("state", "bye");
    const r = await fetch(logoutUrl, { redirect: "manual" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("http://localhost:4000/?state=bye");
  });
});

function randHex(): string {
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

const HDRS = { "content-type": "application/x-www-form-urlencoded" };
