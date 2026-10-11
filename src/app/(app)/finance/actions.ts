"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, payouts, fundSpends, users, expenses } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
type R = { ok?: string; error?: string };

export async function addPayout(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const p = z.object({ userId: z.string().min(1, "اختر الشخص"), projectId: z.string().optional(), amount: z.coerce.number().positive("المبلغ غير صحيح").max(1e9), note: z.string().max(200).optional() })
    .safeParse({ userId: fd.get("userId") || "", projectId: fd.get("projectId") || undefined, amount: fd.get("amount"), note: fd.get("note") || undefined });
  if (!p.success) return { error: p.error.issues[0].message };
  if (!(await db.query.users.findFirst({ where: eq(users.id, p.data.userId) }))) return { error: "الشخص غير موجود." };
  await db.insert(payouts).values({ userId: p.data.userId, projectId: p.data.projectId ?? null, amountEgp: p.data.amount, note: p.data.note });
  await audit(admin.id, "payout_add", `${p.data.userId} ${p.data.amount}`);
  revalidatePath("/finance"); revalidatePath("/my");
  return { ok: "تم تسجيل الصرف." };
}

export async function removePayout(fd: FormData) {
  const admin = await requireAdmin();
  await db.delete(payouts).where(eq(payouts.id, String(fd.get("id"))));
  await audit(admin.id, "payout_delete", String(fd.get("id")));
  revalidatePath("/finance"); revalidatePath("/my");
}

export async function addFundSpend(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const p = z.object({ name: z.string().trim().min(2, "اكتب الاشتراك").max(120), amount: z.coerce.number().positive("المبلغ غير صحيح").max(1e9) }).safeParse({ name: fd.get("name"), amount: fd.get("amount") });
  if (!p.success) return { error: p.error.issues[0].message };
  await db.insert(fundSpends).values({ name: p.data.name, amountEgp: p.data.amount });
  await audit(admin.id, "fund_spend", p.data.name);
  revalidatePath("/finance");
  return { ok: "تم الخصم من الصندوق." };
}

export async function addExpense(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const p = z.object({ name: z.string().trim().min(2, "اكتب المصروف").max(120), amount: z.coerce.number().positive("المبلغ غير صحيح").max(1e9), category: z.enum(["ADS", "TOOLS", "SALARIES", "OTHER"]), date: z.string().optional(), note: z.string().max(200).optional() })
    .safeParse({ name: fd.get("name"), amount: fd.get("amount"), category: fd.get("category") || "OTHER", date: fd.get("date") || undefined, note: fd.get("note") || undefined });
  if (!p.success) return { error: p.error.issues[0].message };
  await db.insert(expenses).values({ name: p.data.name, amountEgp: p.data.amount, category: p.data.category, spentAt: p.data.date ? new Date(p.data.date) : new Date(), note: p.data.note });
  await audit(admin.id, "expense_add", p.data.name);
  revalidatePath("/finance");
  return { ok: "اتسجل المصروف." };
}

export async function removeExpense(fd: FormData) {
  const admin = await requireAdmin();
  await db.delete(expenses).where(eq(expenses.id, String(fd.get("id"))));
  await audit(admin.id, "expense_delete", String(fd.get("id")));
  revalidatePath("/finance");
}
