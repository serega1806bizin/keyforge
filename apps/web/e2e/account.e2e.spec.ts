import { randomBytes } from "node:crypto";
import { type CDPSession, expect, test } from "@playwright/test";

async function addAuthenticator(cdp: CDPSession, transport: "internal" | "usb"): Promise<void> {
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport,
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

test("account passkey self-management: add, delete, last-factor guard, recovery", async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await addAuthenticator(cdp, "internal");

  const email = `acc-${randomBytes(4).toString("hex")}@keyforge.local`;

  await page.goto("/signup");
  await page.getByTestId("email").fill(email);
  await page.getByTestId("register").click();
  await expect(page.getByTestId("status")).toContainText("registered", { timeout: 15_000 });

  await page.goto("/settings");
  await page.getByTestId("account-login").click();
  await expect(page.getByTestId("passkeys")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("passkeys").locator("li")).toHaveCount(1);

  await addAuthenticator(cdp, "usb");
  await page.getByTestId("add-passkey").click();
  await expect(page.getByTestId("passkeys").locator("li")).toHaveCount(2, { timeout: 15_000 });

  await page.getByTestId("passkeys").getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByTestId("passkeys").locator("li")).toHaveCount(1);

  await page.getByTestId("passkeys").getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByTestId("status")).toContainText("last sign-in factor");
  await expect(page.getByTestId("passkeys").locator("li")).toHaveCount(1);

  await page.getByTestId("gen-recovery").click();
  await expect(page.getByTestId("recovery-codes")).toBeVisible();
  const lines = (await page.getByTestId("recovery-codes").innerText()).trim().split("\n");
  expect(lines).toHaveLength(10);
});
