import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseEncryptionKey } from "../src/integrations/secrets.ts";

const key = randomBytes(32);
const otherKey = randomBytes(32);
const token = "EAAG-token-de-pagina-123";

describe("secrets", () => {
  it("cifra y descifra con la misma clave", () => {
    const sealed = encryptSecret(token, key);
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain(token);
    expect(decryptSecret(sealed, key)).toEqual({ ok: true, data: token });
  });

  it("usa un IV distinto en cada cifrado", () => {
    expect(encryptSecret(token, key)).not.toBe(encryptSecret(token, key));
  });

  it("con otra clave devuelve un error en lugar de lanzar", () => {
    const result = decryptSecret(encryptSecret(token, key), otherKey);
    expect(result.ok).toBe(false);
  });

  it("detecta un sobre alterado", () => {
    const [version, iv, tag, data = ""] = encryptSecret(token, key).split(":");
    // The first character always maps to whole bits of the first byte (the last one may be padding).
    const flipped = `${data.startsWith("A") ? "B" : "A"}${data.slice(1)}`;
    expect(decryptSecret([version, iv, tag, flipped].join(":"), key).ok).toBe(false);
    expect(decryptSecret("texto-plano", key).ok).toBe(false);
  });

  it("exige una clave de 32 bytes", () => {
    expect(parseEncryptionKey(key.toString("base64")).ok).toBe(true);
    expect(parseEncryptionKey(randomBytes(16).toString("base64")).ok).toBe(false);
  });
});
