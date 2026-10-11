"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { createSession, destroySession, getUser } from "@/lib/auth";
import { audit, clientIp } from "@/lib/audit";
import { rateLimit, isLimited } from "@/lib/ratelimit";

// Wrong passwords from one place lock that place out of that account (5 tries / 15 min), so a stranger
// can't lock the real person out from elsewhere. Only a big total (30) locks the whole account.
const MAX_FAILS = 30, LOCK_MIN = 15, PER_IP = 5, PER_IP_WIN = 15 * 60 * 1000;
const GENERIC = "اسم المستخدم أو كلمة المرور غير صحيحة.";

export async function login(_: unknown, fd: FormData): Promise<{ error?: string; username?: string }> {
  const ip = await clientIp();
  if (!rateLimit("login:" + ip, 10, 10 * 60 * 1000)) return { error: "محاولات كثيرة. حاول بعد 10 دقائق." };
  const username = String(fd.get("username") || "").trim().toLowerCase().slice(0, 64);
  const password = String(fd.get("password") || "").slice(0, 200);
  const keep = <T extends { error?: string }>(r: T) => ({ ...r, username });
  const ipKey = `lf:${username}|${ip}`;
  if (isLimited(ipKey, PER_IP, PER_IP_WIN)) return keep({ error: GENERIC });
  const u = await db.query.users.findFirst({ where: eq(users.username, username) });
  // Constant-ish work even when user doesn't exist
  const hash = u?.passwordHash ?? "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.Hn1Zl3JpN1yb0b6CjvYxw5H9F7Wi";
  const ok = await bcrypt.compare(password, hash);
  if (!u || !u.active) { rateLimit(ipKey, PER_IP, PER_IP_WIN); await audit(null, "login_failed", username); return keep({ error: GENERIC }); }
  // Same message as a wrong password, so nobody can tell which usernames exist.
  if (u.lockedUntil && u.lockedUntil > new Date()) { await audit(u.id, "login_while_locked"); return keep({ error: GENERIC }); }
  if (!ok) {
    rateLimit(ipKey, PER_IP, PER_IP_WIN);
    const fails = u.failedLogins + 1;
    await db.update(users).set({ failedLogins: fails >= MAX_FAILS ? 0 : fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60000) : null }).where(eq(users.id, u.id));
    await audit(u.id, "login_failed");
    return keep({ error: GENERIC });
  }
  await db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, u.id));
  await createSession(u.id, u.sessionVersion);
  await audit(u.id, "login");
  redirect("/");
}

export async function logout() {
  const u = await getUser();
  if (u) { await audit(u.id, "logout"); await db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, u.id)); } // old cookie copies stop working
  await destroySession();
  redirect("/login");
}
