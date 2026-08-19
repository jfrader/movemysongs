import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/server/crypto";

describe("token crypto", () => {
  it("round-trips", () => {
    const secret = "some-oauth-token-value";
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it("uses a random IV per encryption", () => {
    expect(encrypt("x")).not.toBe(encrypt("x"));
  });

  it("rejects tampered payloads", () => {
    const enc = encrypt("x");
    const [iv, tag, data] = enc.split(".");
    const tampered = [iv, tag, Buffer.from("evil").toString("base64")].join(".");
    expect(() => decrypt(tampered)).toThrow();
    expect(() => decrypt(`${iv}.${data}`)).toThrow();
  });
});
