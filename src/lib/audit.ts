import { headers } from "next/headers";
import { db, auditLog } from "./db";
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}
export async function audit(userId: string | null, action: string, details?: string) {
  try {
    await db.insert(auditLog).values({ userId, action, details, ip: await clientIp() });
  } catch {}
}
