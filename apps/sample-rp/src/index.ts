import express from "express";
import * as client from "openid-client";

const ISSUER = new URL(process.env["ISSUER_URL"] ?? "http://localhost:3000");
const CLIENT_ID = process.env["CLIENT_ID"] ?? "sample-rp";
const CLIENT_NAME = process.env["CLIENT_NAME"] ?? "keyforge sample RP";
const PORT = Number(process.env["PORT"] ?? 4000);
const PUBLIC_URL = (process.env["PUBLIC_URL"] ?? `http://localhost:${PORT}`).replace(/\/$/, "");
const REDIRECT_URI = `${PUBLIC_URL}/callback`;
const SCOPE = "openid profile email offline_access";
const insecure = ISSUER.protocol === "http:";

type Flow = { codeVerifier: string; nonce: string };

let configPromise: ReturnType<typeof client.discovery> | undefined;
function getConfig(): ReturnType<typeof client.discovery> {
  configPromise ??= client.discovery(
    ISSUER,
    CLIENT_ID,
    undefined,
    client.None(),
    insecure ? { execute: [client.allowInsecureRequests] } : undefined,
  );
  return configPromise;
}

const flows = new Map<string, Flow>();

const html = (res: express.Response, body: string): void => {
  res.type("html").send(body);
};

const app = express();

app.get("/", (_req, res) => {
  html(res, `<h1>${CLIENT_NAME}</h1><p><a href="/login">Login with keyforge</a></p>`);
});

app.get("/login", async (_req, res) => {
  const config = await getConfig();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();
  flows.set(state, { codeVerifier, nonce });

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });
  res.redirect(url.href);
});

app.get("/callback", async (req, res) => {
  const state = String(req.query["state"] ?? "");
  const flow = flows.get(state);
  if (!flow) {
    res.status(400).send("unknown or expired login state");
    return;
  }
  flows.delete(state);

  const config = await getConfig();
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const currentUrl = new URL(`${REDIRECT_URI}${query}`);

  try {
    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: flow.codeVerifier,
      expectedNonce: flow.nonce,
      expectedState: state,
    });
    const claims = tokens.claims();
    const userinfo = claims
      ? await client.fetchUserInfo(config, tokens.access_token, claims.sub)
      : null;
    html(
      res,
      `<h1>Logged in</h1><h2>ID token claims</h2><pre>${JSON.stringify(claims, null, 2)}</pre><h2>UserInfo</h2><pre>${JSON.stringify(userinfo, null, 2)}</pre>`,
    );
  } catch (err) {
    res.status(400);
    html(res, `<h1>Login failed</h1><pre>${String(err)}</pre>`);
  }
});

app.listen(PORT, () => {
  console.log(`sample-rp on http://localhost:${PORT} (issuer ${ISSUER.href})`);
});
