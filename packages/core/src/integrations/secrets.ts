import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { err, ok, type Result } from "../result.ts";

// AES-256-GCM for integration credentials (ad platform tokens, webhook keys). The sealed form is
// `v1:<iv>:<tag>:<ciphertext>` in base64url, so the version can change without a data migration.
// The key comes from INTEGRATIONS_ENCRYPTION_KEY (32 random bytes, base64) and never reaches the DB.

const VERSION = "v1";
const IV_BYTES = 12;

export function parseEncryptionKey(base64: string): Result<Buffer> {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) return err("INTERNAL", "La clave de cifrado debe tener 32 bytes");
  return ok(key);
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const parts = [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url"));
  return [VERSION, ...parts].join(":");
}

// A wrong key or a tampered envelope fails the GCM tag check; report it instead of throwing.
export function decryptSecret(sealed: string, key: Buffer): Result<string> {
  const [version, iv, tag, data] = sealed.split(":");
  if (version !== VERSION || !iv || !tag || data === undefined) {
    return err("INTERNAL", "Credencial cifrada con un formato desconocido");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]);
    return ok(plain.toString("utf8"));
  } catch {
    return err("INTERNAL", "No se pudo descifrar la credencial");
  }
}
