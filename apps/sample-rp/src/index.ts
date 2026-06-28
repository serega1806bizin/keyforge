import express from "express";
import * as client from "openid-client";

const ISSUER = new URL(process.env["ISSUER_URL"] ?? "http://localhost:3000");
const CLIENT_ID = process.env["CLIENT_ID"] ?? "sample-rp";
const CLIENT_NAME = process.env["CLIENT_NAME"] ?? "Demo App";
const PORT = Number(process.env["PORT"] ?? 4000);
const PUBLIC_URL = (
  process.env["PUBLIC_URL"] ??
  process.env["RENDER_EXTERNAL_URL"] ??
  `http://localhost:${PORT}`
).replace(/\/$/, "");
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

const KEY = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9.5" cy="9.5" r="3.5"/><path d="M12 12l7 7"/><path d="M16 18l1.4 1.4M18 15.6l1.4 1.4"/></svg>`;
const CHECK = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

const STYLE = `:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:1.5rem;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#eef1fb;background:#06070e;background-image:radial-gradient(55rem 55rem at 50% -25%,#13152e,transparent 60%)}main{width:100%;max-width:32rem;background:#0f1120;border:1px solid #232843;border-radius:1.25rem;padding:2rem;box-shadow:0 24px 60px -16px rgba(0,0,0,.7)}.brand{display:inline-flex;align-items:center;gap:.5rem;font-weight:600;font-size:.85rem;color:#aab2d5;margin-bottom:1.25rem}.logo{display:grid;place-items:center;width:1.9rem;height:1.9rem;border-radius:.55rem;background:linear-gradient(135deg,#6d7bff,#b06bff);color:#fff}h1{font-size:1.5rem;margin:.25rem 0 .5rem;letter-spacing:-.02em}p.sub{color:#99a0bd;margin:0 0 1.5rem;font-size:.95rem;line-height:1.55}a.btn,button.btn{display:flex;align-items:center;justify-content:center;gap:.5rem;width:100%;padding:.85rem 1rem;border:0;border-radius:.7rem;font:inherit;font-weight:600;font-size:.95rem;color:#fff;text-decoration:none;cursor:pointer;background:linear-gradient(135deg,#6d7bff,#b06bff);box-shadow:0 8px 24px -10px rgba(124,131,255,.7);transition:filter .15s ease,transform .05s ease}a.btn:hover{filter:brightness(1.1)}a.btn:active{transform:translateY(1px)}a.btn.secondary{background:#1a1d31;color:#cdd3ee;border:1px solid #2a2f4d;box-shadow:none}.user{display:flex;align-items:center;gap:.85rem;padding:1rem;border:1px solid #232843;border-radius:.85rem;background:#0c0f1c;margin-bottom:1rem}.avatar{flex:0 0 auto;display:grid;place-items:center;width:2.75rem;height:2.75rem;border-radius:50%;background:linear-gradient(135deg,#6d7bff,#b06bff);color:#fff;font-weight:600;font-size:1.1rem;text-transform:uppercase}.email{font-weight:600;word-break:break-all}.muted{color:#99a0bd;font-size:.85rem}.ok{display:inline-flex;align-items:center;gap:.4rem;color:#34d399;font-weight:600;font-size:.85rem;margin-bottom:.6rem}details{margin:.75rem 0;border:1px solid #232843;border-radius:.7rem;overflow:hidden}summary{cursor:pointer;padding:.7rem .9rem;font-size:.85rem;color:#aab2d5;user-select:none;background:#0c0f1c}pre{margin:0;padding:.9rem;overflow:auto;font-size:.8rem;line-height:1.5;color:#cdd3ee;background:#0a0c17;border-top:1px solid #232843}.row{display:flex;gap:.6rem;margin-top:1.25rem}.row .btn{flex:1}footer{margin-top:1.5rem;text-align:center;color:#6b7398;font-size:.78rem}footer a{color:#9aa3c7;text-decoration:none}footer a:hover{color:#cdd3ee;text-decoration:underline}`;

const REPO_URL = "https://github.com/serega1806bizin/keyforge";

function esc(value: string): string {
  return value.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}

const BRAND = `<div class="brand"><span class="logo">${KEY}</span> keyforge</div>`;

function send(res: express.Response, status: number, title: string, body: string): void {
  res.status(status).type("html").send(page(title, body));
}

const app = express();

app.get("/", (_req, res) => {
  send(
    res,
    200,
    `${CLIENT_NAME}`,
    `${BRAND}
    <h1>${esc(CLIENT_NAME)}</h1>
    <p class="sub">A demo client app. It signs you in with a passkey through <strong>keyforge</strong> — a self-hosted OpenID Connect identity provider (the project behind this demo).</p>
    <a class="btn" href="/login">${KEY} Login with keyforge</a>
    <footer><a href="${ISSUER.origin}/signup">Open keyforge ↗</a> · <a href="${REPO_URL}">Source on GitHub ↗</a></footer>`,
  );
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
    send(
      res,
      400,
      "Sign-in failed",
      `${BRAND}<h1>Session expired</h1><p class="sub">This sign-in link is no longer valid.</p><a class="btn" href="/login">Try again</a>`,
    );
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

    const email =
      userinfo && typeof userinfo["email"] === "string"
        ? userinfo["email"]
        : (claims?.sub ?? "user");
    const initial = esc(email.charAt(0) || "u");
    const amrClaim = claims?.["amr"];
    const amr = Array.isArray(amrClaim) ? amrClaim.join(" + ") : "passkey";

    const logoutUrl = tokens.id_token
      ? `${ISSUER.origin}/logout?id_token_hint=${tokens.id_token}&post_logout_redirect_uri=${encodeURIComponent(PUBLIC_URL)}`
      : "/";

    send(
      res,
      200,
      "Signed in",
      `${BRAND}
      <span class="ok">${CHECK} Signed in</span>
      <h1>Welcome back</h1>
      <div class="user"><div class="avatar">${initial}</div><div><div class="email">${esc(email)}</div><div class="muted">Authenticated via ${esc(amr)}</div></div></div>
      <details><summary>ID token claims</summary><pre>${esc(JSON.stringify(claims, null, 2))}</pre></details>
      <details><summary>UserInfo</summary><pre>${esc(JSON.stringify(userinfo, null, 2))}</pre></details>
      <div class="row"><a class="btn secondary" href="${esc(logoutUrl)}">Sign out</a><a class="btn" href="/login">Sign in again</a></div>
      <footer><a href="${ISSUER.origin}/settings">Manage your keyforge account ↗</a> · <a href="${REPO_URL}">Source ↗</a></footer>`,
    );
  } catch (err) {
    send(
      res,
      400,
      "Sign-in failed",
      `${BRAND}<h1>Sign-in failed</h1><p class="sub">${esc(String(err))}</p><a class="btn" href="/login">Try again</a>`,
    );
  }
});

app.listen(PORT, () => {
  console.log(`sample-rp on http://localhost:${PORT} (issuer ${ISSUER.href})`);
});
