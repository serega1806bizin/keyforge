import { z } from "zod";

export const SCOPES = ["openid", "profile", "email", "offline_access"] as const;
export type Scope = (typeof SCOPES)[number];

export const AuthorizeQuerySchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.url(),
  response_type: z.literal("code"),
  scope: z.string().min(1),
  state: z.string().optional(),
  nonce: z.string().optional(),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256"),
  prompt: z.enum(["none", "login", "consent", "select_account"]).optional(),
  max_age: z.coerce.number().int().nonnegative().optional(),
  login_hint: z.string().optional(),
});
export type AuthorizeQuery = z.infer<typeof AuthorizeQuerySchema>;
