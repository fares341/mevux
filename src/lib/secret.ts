import { createHash } from "crypto";
export function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error("APP_SECRET must be set (at least 32 characters)");
  return s;
}
export function derivedKey(purpose: string): Buffer {
  return createHash("sha256").update(appSecret() + ":" + purpose).digest();
}
