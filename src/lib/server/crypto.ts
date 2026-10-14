/**
 * Server-only cryptography. AES-256-GCM for tokens at rest (with associated
 * data binding each ciphertext to its owner + provider), HMAC-SHA256 for
 * signed cookies, and PKCE helpers. Never import from client components.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const b64url = (b: Buffer) => b.toString("base64url");

/** Decodes INTEGRATIONS_ENCRYPTION_KEY (base64/base64url, 32 bytes). Returns null when invalid. */
export function loadKey(value: string | undefined): Buffer | null {
  if (!value) return null;
  try {
    const buf = Buffer.from(value.trim(), value.includes("-") || value.includes("_") ? "base64url" : "base64");
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

export function encrypt(key: Buffer, plaintext: string, aad = ""): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1.${b64url(iv)}.${b64url(cipher.getAuthTag())}.${b64url(ct)}`;
}

/** Throws if the blob was tampered with, encrypted with another key, or bound to different AAD. */
export function decrypt(key: Buffer, blob: string, aad = ""): string {
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== "v1" || !iv || !tag || ct === undefined) throw new Error("Malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export const randomToken = (bytes = 32) => b64url(randomBytes(bytes));

export const hmac = (secret: string, value: string) => b64url(createHmac("sha256", secret).update(value).digest());

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** RFC 7636 S256 pair. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(48); // 64 chars, within 43–128
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}
