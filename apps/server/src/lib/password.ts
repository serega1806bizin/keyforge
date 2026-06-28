import { hash, verify } from "@node-rs/argon2";

export function hashSecret(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifySecret(hashStr: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashStr, plain);
  } catch {
    return false;
  }
}
