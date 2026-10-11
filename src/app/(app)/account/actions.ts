"use server";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { requireUser, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
export async function changePassword(_: { ok?: string; error?: string }, fd: FormData): Promise<{ ok?: string; error?: string }> {
  const me = await requireUser();
  const cur = String(fd.get("current") || ""), next = String(fd.get("next") || ""), rep = String(fd.get("repeat") || "");
  if (next.length < 10 || next.length > 200) return { error: "كلمة المرور الجديدة 10 أحرف على الأقل." };
  if (next !== rep) return { error: "كلمتا المرور غير متطابقتين." };
  const u = await db.query.users.findFirst({ where: eq(users.id, me.id) });
  if (!u) return { error: "الحساب غير موجود." };
  if (!(await bcrypt.compare(cur, u.passwordHash))) return { error: "كلمة المرور الحالية غير صحيحة." };
  const [updated] = await db.update(users).set({ passwordHash: await bcrypt.hash(next, 12), sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, me.id)).returning();
  await createSession(me.id, updated.sessionVersion);
  await audit(me.id, "password_change");
  return { ok: "تم تغيير كلمة المرور، وتم تسجيل خروجك من باقي الأجهزة." };
}
