"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, ideas } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { IDEA_AREA, IDEA_STATUS, IDEA_PRIORITY } from "@/lib/labels";

type R = { ok?: string; error?: string };
const keys = (o: object) => Object.keys(o) as [string, ...string[]];
const schema = z.object({
  title: z.string().trim().min(2, "اكتب الفكرة في سطر").max(200),
  details: z.string().trim().max(5000).optional(),
  area: z.enum(keys(IDEA_AREA)).default("COMPANY"),
  priority: z.enum(keys(IDEA_PRIORITY)).default("MID"),
});
const v = (fd: FormData, k: string) => { const x = String(fd.get(k) ?? "").trim(); return x || undefined; };

export async function addIdea(_: R, fd: FormData): Promise<R> {
  const u = await requireAdmin();
  const p = schema.safeParse({ title: v(fd, "title"), details: v(fd, "details"), area: v(fd, "area"), priority: v(fd, "priority") });
  if (!p.success) return { error: p.error.issues[0].message };
  await db.insert(ideas).values({ ...p.data, createdBy: u.id });
  revalidatePath("/ideas");
  return { ok: "اتحفظت الفكرة." };
}

export async function updateIdea(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id"));
  const set: Partial<typeof ideas.$inferInsert> = { updatedAt: new Date() };
  const st = v(fd, "status"), pr = v(fd, "priority"), ar = v(fd, "area"), t = v(fd, "title"), d = fd.has("details") ? (v(fd, "details") ?? null) : undefined;
  if (st && st in IDEA_STATUS) set.status = st;
  if (pr && pr in IDEA_PRIORITY) set.priority = pr;
  if (ar && ar in IDEA_AREA) set.area = ar;
  if (t) set.title = t.slice(0, 200);
  if (d !== undefined) set.details = d?.slice(0, 5000) ?? null;
  await db.update(ideas).set(set).where(eq(ideas.id, id));
  revalidatePath("/ideas");
}

export async function deleteIdea(fd: FormData) {
  await requireAdmin();
  await db.delete(ideas).where(eq(ideas.id, String(fd.get("id"))));
  revalidatePath("/ideas");
}
