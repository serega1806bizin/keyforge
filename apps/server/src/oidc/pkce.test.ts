import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPkceS256 } from "./pkce";

const challengeFor = (verifier: string): string =>
  createHash("sha256").update(verifier).digest("base64url");

describe("PKCE S256", () => {
  it("accepts a correct verifier/challenge pair", () => {
    const verifier = "a".repeat(64);
    expect(verifyPkceS256(verifier, challengeFor(verifier))).toBe(true);
  });

  it("rejects a wrong verifier", () => {
    expect(verifyPkceS256("b".repeat(64), challengeFor("a".repeat(64)))).toBe(false);
  });

  it("rejects a malformed verifier (too short or illegal chars)", () => {
    expect(verifyPkceS256("short", challengeFor("short"))).toBe(false);
    expect(verifyPkceS256("!".repeat(64), challengeFor("!".repeat(64)))).toBe(false);
  });
});
