import "dotenv/config";
import { z } from "zod";

const secret = () => z.string().min(32, "must be at least 32 characters");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  ISSUER_URL: z.url(),
  RP_ID: z.string().min(1),
  RP_ORIGIN: z.url(),
  RP_NAME: z.string().min(1).default("keyforge"),

  DATABASE_URL: z.string().min(1),

  KEY_ENCRYPTION_KEY: secret(),
  SESSION_SECRET: secret(),
  COOKIE_SECRET: secret(),

  DEV_LOGIN_STUB: z
    .enum(["true", "false"])
    .default("false")
    .transform((v: "true" | "false") => v === "true"),

  SERVE_WEB: z
    .enum(["true", "false"])
    .default("false")
    .transform((v: "true" | "false") => v === "true"),

  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(2592000),
  ID_TOKEN_TTL: z.coerce.number().int().positive().default(300),
  AUTH_CODE_TTL: z.coerce.number().int().positive().default(60),
  CHALLENGE_TTL: z.coerce.number().int().positive().default(300),
  SESSION_IDLE_TTL: z.coerce.number().int().positive().default(86400),
  SESSION_ABSOLUTE_TTL: z.coerce.number().int().positive().default(2592000),
  KEY_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
