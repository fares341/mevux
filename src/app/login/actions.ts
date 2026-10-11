"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { createSession, destroySession, getUser } from "@/lib/auth";
import { audit, clientIp } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";

const MAX_FAILS = 5, LOCK_MIN = 15;
const GENERIC = "اسم المستخدم أو كلمة المرور غير صحيحة.";

export async function login(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const ip = await clientIp();
  if (!rateLimit("login:" + ip, 10, 10 * 60 * 1000)) return { error: "محاولات كثيرة. حاول بعد 10 دقائق." };
  const username = String(fd.get("username") || "").trim().toLowerCase().slice(0, 64);
  const password = String(fd.get("password") || "").slice(0, 200);
  const u = await db.query.users.findFirst({ where: eq(users.username, username) });
  // Constant-ish work even when user doesn't exist
  const hash = u?.passwordHash ?? "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.Hn1Zl3JpN1yb0b6CjvYxw5H9F7Wi";
  const ok = await bcrypt.compare(password, hash);
  if (!u || !u.active) { await audit(null, "login_failed", username); return { error: GENERIC }; }
  if (u.lockedUntil && u.lockedUntil > new Date()) return { error: `الحساب مقفول مؤقتاً. حاول بعد ${LOCK_MIN} دقيقة.` };
  if (!ok) {
    const fails = u.failedLogins + 1;
    await db.update(users).set({ failedLogins: fails >= MAX_FAILS ? 0 : fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60000) : null }).where(eq(users.id, u.id));
    await audit(u.id, "login_failed");
    return { error: fails >= MAX_FAILS ? `تم قفل الحساب ${LOCK_MIN} دقيقة بعد ${MAX_FAILS} محاولات خاطئة.` : GENERIC };
  }
  await db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, u.id));
  await createSession(u.id, u.sessionVersion);
  await audit(u.id, "login");
  redirect("/");
}

export async function logout() {
  const u = await getUser();
  if (u) await audit(u.id, "logout");
  await destroySession();
  redirect("/login");
}
