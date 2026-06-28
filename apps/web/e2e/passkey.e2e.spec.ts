import { createHash, randomBytes } from "node:crypto";
import { type Server, createServer } from "node:http";
import { type Page, expect, test } from "@playwright/test";

let rpA: Server;
let rpB: Server;
test.beforeAll(() => {
  rpA = createServer((_req, res) => res.writeHead(200).end("captured A")).listen(4000);
  rpB = createServer((_req, res) => res.writeHead(200).end("captured B")).listen(4001);
});
test.afterAll(() => {
  rpA.close();
  rpB.close();
});

const ISSUER = "http://localhost:5173";
const IDP_DIRECT = "http://localhost:3000";
const RP_A = { clientId: "sample-rp", redirectUri: "http://localhost:4000/callback" };
const RP_B = { clientId: "sample-rp-2", redirectUri: "http://localhost:4001/callback" };

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

function authUrl(
  rp: { clientId: string; redirectUri: string },
  challenge: string,
  state: string,
): string {
  return (
    `${ISSUER}/authorize?client_id=${rp.clientId}&redirect_uri=${encodeURIComponent(rp.redirectUri)}` +
    `&response_type=code&scope=${encodeURIComponent("openid profile email")}` +
    `&code_challenge=${challenge}&code_challenge_method=S256&state=${state}&nonce=${randomBytes(8).toString("hex")}`
  );
}

async function exchange(
  page: Page,
  rp: { clientId: string; redirectUri: string },
  code: string,
  verifier: string,
) {
  const res = await page.request.post(`${IDP_DIRECT}/token`, {
    form: {
      grant_type: "authorization_code",
      code,
      redirect_uri: rp.redirectUri,
      code_verifier: verifier,
      client_id: rp.clientId,
    },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { id_token?: string; access_token?: string };
}

test("passkey login, consent, and cross-RP SSO", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  const email = `pw-${randomBytes(4).toString("hex")}@keyforge.local`;
  await page.goto("/signup");
  await page.getByTestId("email").fill(email);
  await page.getByTestId("register").click();
  await expect(page.getByTestId("status")).toContainText("registered", { timeout: 15_000 });

  const a1 = pkce();
  const stateA1 = randomBytes(8).toString("hex");
  await page.goto(authUrl(RP_A, a1.challenge, stateA1));
  await expect(page).toHaveURL(/\/login\//);
  const loginButton = page.getByTestId("login");
  const consentAllow = page.getByTestId("consent-allow");
  await expect(loginButton.or(consentAllow)).toBeVisible({ timeout: 15_000 });
  if (await loginButton.isVisible().catch(() => false)) {
    await loginButton.click({ timeout: 5_000 }).catch(() => undefined);
  }
  await consentAllow.click({ timeout: 15_000 });
  await page.waitForURL(/localhost:4000\/callback/, { timeout: 15_000 });
  const codeA1 = new URL(page.url()).searchParams.get("code");
  expect(codeA1, "RP A code").toBeTruthy();
  expect(new URL(page.url()).searchParams.get("state")).toBe(stateA1);
  const tokensA = await exchange(page, RP_A, codeA1!, a1.verifier);
  expect(tokensA.id_token).toBeTruthy();
  expect(tokensA.access_token).toBeTruthy();

  const a2 = pkce();
  await page.goto(authUrl(RP_A, a2.challenge, randomBytes(8).toString("hex")));
  await page.waitForURL(/localhost:4000\/callback/, { timeout: 15_000 });
  expect(new URL(page.url()).searchParams.get("code"), "RP A silent SSO code").toBeTruthy();

  const b = pkce();
  await page.goto(authUrl(RP_B, b.challenge, randomBytes(8).toString("hex")));
  await expect(page).toHaveURL(/\/login\//);
  await expect(page.getByTestId("consent-allow")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("login")).toHaveCount(0);
  await page.getByTestId("consent-allow").click();
  await page.waitForURL(/localhost:4001\/callback/, { timeout: 15_000 });
  const codeB = new URL(page.url()).searchParams.get("code");
  expect(codeB, "RP B code via SSO").toBeTruthy();
  const tokensB = await exchange(page, RP_B, codeB!, b.verifier);
  expect(tokensB.id_token).toBeTruthy();
});
