"use server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export type R = { ok?: string; error?: string };
const pw = z.string().min(10, "كلمة المرور 10 أحرف على الأقل").max(200);
const uname = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, "اسم المستخدم: حروف إنجليزية صغيرة وأرقام فقط (3–32)");

export async function createMember(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const p = z.object({ name: z.string().trim().min(2).max(80), username: uname, password: pw, jobTitle: z.string().trim().max(80).optional(), phone: z.string().trim().max(30).optional(), role: z.enum(["ADMIN", "TEAM_LEAD", "MEMBER"]) })
    .safeParse({ name: fd.get("name"), username: fd.get("username"), password: fd.get("password"), jobTitle: fd.get("jobTitle") || undefined, phone: fd.get("phone") || undefined, role: fd.get("role") || "MEMBER" });
  if (!p.success) return { error: p.error.issues[0].message };
  if (await db.query.users.findFirst({ where: eq(users.username, p.data.username) })) return { error: "اسم المستخدم مستخدم بالفعل." };
  const { password, ...rest } = p.data;
  await db.insert(users).values({ ...rest, passwordHash: await bcrypt.hash(password, 12) });
  await audit(admin.id, "user_create", p.data.username);
  revalidatePath("/team");
  return { ok: `تم إنشاء حساب ${p.data.name}.` };
}

export async function resetPassword(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const id = String(fd.get("id"));
  const p = pw.safeParse(fd.get("password"));
  if (!p.success) return { error: p.error.issues[0].message };
  // bumping sessionVersion logs the user out everywhere
  await db.update(users).set({ passwordHash: await bcrypt.hash(p.data, 12), sessionVersion: sql`${users.sessionVersion} + 1`, failedLogins: 0, lockedUntil: null }).where(eq(users.id, id));
  await audit(admin.id, "user_reset_password", id);
  return { ok: "تم تغيير كلمة المرور وتسجيل خروجه من كل الأجهزة." };
}

export async function setActive(fd: FormData) {
  const admin = await requireAdmin();
  const id = String(fd.get("id"));
  const active = fd.get("active") === "1";
  if (id === admin.id) return;
  await db.update(users).set({ active, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, id));
  await audit(admin.id, active ? "user_activate" : "user_deactivate", id);
  revalidatePath("/team");
}

export async function deleteMember(fd: FormData) {
  const admin = await requireAdmin();
  const id = String(fd.get("id"));
  if (id === admin.id || fd.get("confirm") !== "حذف") return;
  await db.delete(users).where(eq(users.id, id));
  await audit(admin.id, "user_delete", id);
  revalidatePath("/team");
}
