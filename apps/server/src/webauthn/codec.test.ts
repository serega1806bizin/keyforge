import { describe, expect, it } from "vitest";
import { challengeFromClientData, isCloneByCounter } from "./codec";

describe("isCloneByCounter (signature-counter clone detection)", () => {
  it("allows the all-zero passkey case (counter never implemented)", () => {
    expect(isCloneByCounter(0, 0)).toBe(false);
  });
  it("allows a strictly increasing counter", () => {
    expect(isCloneByCounter(5, 6)).toBe(false);
    expect(isCloneByCounter(0, 1)).toBe(false);
  });
  it("flags a non-advancing or regressing counter as a clone", () => {
    expect(isCloneByCounter(5, 5)).toBe(true);
    expect(isCloneByCounter(5, 4)).toBe(true);
  });
});

describe("challengeFromClientData", () => {
  it("extracts the base64url challenge from clientDataJSON", () => {
    const clientData = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge: "abc-123_XY",
        origin: "http://localhost:5173",
      }),
    ).toString("base64url");
    expect(challengeFromClientData(clientData)).toBe("abc-123_XY");
  });
  it("returns null on malformed input", () => {
    expect(challengeFromClientData("!!!not-base64-json")).toBeNull();
  });
});
