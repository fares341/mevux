import { headers } from "next/headers";
import { db, auditLog } from "./db";
export async function clientIp(): Promise<string> {
  const h = await headers();
  // The left part of X-Forwarded-For is whatever the client sent; our proxy (Caddy) appends the real address last.
  const xff = h.get("x-forwarded-for")?.split(",").map((x) => x.trim()).filter(Boolean);
  return (xff?.[xff.length - 1] || h.get("x-real-ip") || "unknown").trim();
}
export async function audit(userId: string | null, action: string, details?: string) {
  try {
    await db.insert(auditLog).values({ userId, action, details, ip: await clientIp() });
  } catch {}
}
