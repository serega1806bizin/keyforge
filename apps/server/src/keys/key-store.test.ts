import { createLocalJWKSet, jwtVerify, SignJWT } from "jose";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { ensureSigningKey, getActiveSigningKey, getPublicJwks } from "./key-store";

describe("key-store (integration)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("ensures an ACTIVE signing key on demand", async () => {
    const kid = await ensureSigningKey();
    expect(kid).toBeTruthy();
  });

  it("publishes a public JWKS with no private material", async () => {
    const { keys } = await getPublicJwks();
    expect(keys.length).toBeGreaterThanOrEqual(1);
    const k = keys[0]!;
    expect(k.kid).toBeTruthy();
    expect(k.alg).toBe("RS256");
    expect(k.kty).toBe("RSA");
    expect(k.use).toBe("sig");
    expect((k as Record<string, unknown>)["d"]).toBeUndefined();
  });

  it("stores the private key AES-256-GCM-encrypted at rest", async () => {
    const { kid } = await getActiveSigningKey();
    const row = await prisma.signingKey.findUniqueOrThrow({ where: { kid } });
    expect(row.encryptedPrivateKey.startsWith("enc:v1:")).toBe(true);
  });

  it("signs a JWT that verifies against the published JWKS by kid", async () => {
    const key = await getActiveSigningKey();
    const jwt = await new SignJWT({ hello: "keyforge" })
      .setProtectedHeader({ alg: key.alg, kid: key.kid, typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("60s")
      .sign(key.privateKey);

    const jwks = createLocalJWKSet(await getPublicJwks());
    const { payload, protectedHeader } = await jwtVerify(jwt, jwks);
    expect(protectedHeader.kid).toBe(key.kid);
    expect(payload["hello"]).toBe("keyforge");
  });
});
