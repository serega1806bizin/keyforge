export function base64UrlToUtf8(b64url: string): string {
  return Buffer.from(b64url, "base64url").toString("utf8");
}

export function utf8ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(s);
  const out = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  out.set(encoded);
  return out;
}

export function challengeFromClientData(clientDataJSONb64url: string): string | null {
  try {
    const json = JSON.parse(base64UrlToUtf8(clientDataJSONb64url)) as { challenge?: unknown };
    return typeof json.challenge === "string" ? json.challenge : null;
  } catch {
    return null;
  }
}

export function isCloneByCounter(stored: number, incoming: number): boolean {
  if (stored === 0 && incoming === 0) return false;
  return incoming <= stored;
}
