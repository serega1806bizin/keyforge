import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  calculateJwkThumbprint,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  importPKCS8,
  type JWK,
} from "jose";
import { env, isProd } from "../config/env";
import { Prisma } from "../generated/prisma/client";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";

const DEFAULT_ALG = "RS256";
const ENC_PREFIX = "enc:v1:";
const KEY_CACHE_TTL_MS = 5 * 60 * 1000;
const DAY_MS = 86_400_000;

const masterKey = createHash("sha256").update(env.KEY_ENCRYPTION_KEY).digest();

function encryptPem(pem: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(pem, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function decryptPem(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) {
    if (isProd) throw new Error("Signing key is not encrypted at rest");
    return stored;
  }
  const [, , ivB64, tagB64, ctB64] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", masterKey, Buffer.from(ivB64 ?? "", "base64"));
  decipher.setAuthTag(Buffer.from(tagB64 ?? "", "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64 ?? "", "base64")),
    decipher.final(),
  ]).toString("utf8");
}

type SigningPrivateKey = Awaited<ReturnType<typeof importPKCS8>>;

export interface ActiveSigningKey {
  kid: string;
  alg: string;
  privateKey: SigningPrivateKey;
}

interface NewKeyMaterial {
  kid: string;
  alg: string;
  publicJwk: JWK;
  privateKeyPem: string;
}

let cachedActiveKey: ActiveSigningKey | null = null;
let cachedActiveKeyAt = 0;
let cachedJwks: { keys: JWK[] } | null = null;
let cachedJwksAt = 0;

async function createKeyMaterial(alg: string = DEFAULT_ALG): Promise<NewKeyMaterial> {
  const { publicKey, privateKey } = await generateKeyPair(alg, { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const kid = await calculateJwkThumbprint(publicJwk);
  publicJwk.kid = kid;
  publicJwk.alg = alg;
  publicJwk.use = "sig";
  const privateKeyPem = await exportPKCS8(privateKey);
  return { kid, alg, publicJwk, privateKeyPem };
}

function activeKeyData(material: NewKeyMaterial): Prisma.SigningKeyCreateInput {
  return {
    kid: material.kid,
    alg: material.alg,
    publicJwk: material.publicJwk as unknown as Prisma.InputJsonValue,
    encryptedPrivateKey: encryptPem(material.privateKeyPem),
    status: "ACTIVE",
  };
}

async function persistKey(material: NewKeyMaterial) {
  const row = await prisma.signingKey.create({ data: activeKeyData(material) });
  cachedJwks = null;
  return row;
}

async function loadActiveKeyRow() {
  const existing = await prisma.signingKey.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  const row = await persistKey(await createKeyMaterial());
  logger.info({ kid: row.kid, alg: row.alg }, "generated initial signing key");
  return row;
}

export async function ensureSigningKey(): Promise<string> {
  const row = await loadActiveKeyRow();
  return row.kid;
}

export async function getActiveSigningKey(): Promise<ActiveSigningKey> {
  if (cachedActiveKey && Date.now() - cachedActiveKeyAt < KEY_CACHE_TTL_MS) return cachedActiveKey;
  const row = await loadActiveKeyRow();
  cachedActiveKey = {
    kid: row.kid,
    alg: row.alg,
    privateKey: await importPKCS8(decryptPem(row.encryptedPrivateKey), row.alg),
  };
  cachedActiveKeyAt = Date.now();
  return cachedActiveKey;
}

export async function getPublicJwks(): Promise<{ keys: JWK[] }> {
  if (cachedJwks && Date.now() - cachedJwksAt < KEY_CACHE_TTL_MS) return cachedJwks;
  await ensureSigningKey();
  const rows = await prisma.signingKey.findMany({
    where: { status: { in: ["ACTIVE", "RETIRING"] } },
    orderBy: { createdAt: "desc" },
  });
  cachedJwks = { keys: rows.map((row) => row.publicJwk as unknown as JWK) };
  cachedJwksAt = Date.now();
  return cachedJwks;
}

export async function rotateSigningKey(): Promise<ActiveSigningKey> {
  const material = await createKeyMaterial();
  const pruneCutoff = new Date(Date.now() - env.KEY_RETENTION_DAYS * DAY_MS);
  await prisma.$transaction([
    prisma.signingKey.updateMany({
      where: { status: "ACTIVE" },
      data: { status: "RETIRING", retiredAt: new Date() },
    }),
    prisma.signingKey.create({ data: activeKeyData(material) }),
    prisma.signingKey.deleteMany({
      where: { status: { in: ["RETIRING", "RETIRED"] }, retiredAt: { lt: pruneCutoff } },
    }),
  ]);
  cachedActiveKey = null;
  cachedJwks = null;
  logger.info({ kid: material.kid }, "rotated signing key");
  return getActiveSigningKey();
}

export async function listKeys() {
  const rows = await prisma.signingKey.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((row) => ({
    kid: row.kid,
    alg: row.alg,
    status: row.status,
    createdAt: row.createdAt,
    retiredAt: row.retiredAt,
  }));
}
