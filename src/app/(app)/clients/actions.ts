"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, clients, clientEvents } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

type R = { ok?: string; error?: string };
const STAGE = z.enum(["NEW", "MEETING_SET", "MEETING_DONE", "BRIEF_SENT", "NEGOTIATION", "AGREED", "ACTIVE", "DONE", "ON_HOLD", "LOST"]);
const opt = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? "").trim(); return v || undefined; };
const date = z.preprocess((v) => (v ? new Date(String(v)) : null), z.date().nullable());

const base = z.object({
  name: z.string().trim().min(2, "اكتب اسم العميل").max(120), company: z.string().max(120).optional(), phone: z.string().max(40).optional(),
  email: z.string().max(120).optional(), country: z.string().max(60).optional(), source: z.string().max(120).optional(), need: z.string().max(4000).optional(),
  stage: STAGE, nextStep: z.string().max(300).optional(), nextDate: date,
});
const read = (fd: FormData) => base.safeParse({ name: opt(fd, "name"), company: opt(fd, "company"), phone: opt(fd, "phone"), email: opt(fd, "email"), country: opt(fd, "country"), source: opt(fd, "source"), need: opt(fd, "need"), stage: opt(fd, "stage") || "NEW", nextStep: opt(fd, "nextStep"), nextDate: opt(fd, "nextDate") });

export async function createClient(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const p = read(fd);
  if (!p.success) return { error: p.error.issues[0].message };
  const [c] = await db.insert(clients).values(p.data).returning();
  await db.insert(clientEvents).values({ clientId: c.id, stage: c.stage, note: "تمت إضافة العميل", by: admin.id });
  await audit(admin.id, "client_create", c.name);
  redirect(`/clients/${c.id}`);
}

export async function updateClient(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const id = String(fd.get("id"));
  const p = read(fd);
  if (!p.success) return { error: p.error.issues[0].message };
  await db.update(clients).set({ ...p.data, updatedAt: new Date() }).where(eq(clients.id, id));
  await audit(admin.id, "client_update", id);
  revalidatePath(`/clients/${id}`); revalidatePath("/clients");
  return { ok: "تم الحفظ." };
}

// Stage change + note: the main day-to-day action. Every change is kept in the history.
export async function logStage(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const id = String(fd.get("id"));
  const p = z.object({ stage: STAGE, note: z.string().max(2000).optional(), nextStep: z.string().max(300).optional(), nextDate: date })
    .safeParse({ stage: opt(fd, "stage"), note: opt(fd, "note"), nextStep: opt(fd, "nextStep"), nextDate: opt(fd, "nextDate") });
  if (!p.success) return { error: "راجع البيانات." };
  const cur = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!cur) return { error: "العميل غير موجود." };
  if (cur.stage === p.data.stage && !p.data.note && p.data.nextStep === undefined && !p.data.nextDate) return { error: "مفيش تغيير تسجله." };
  await db.update(clients).set({ stage: p.data.stage, nextStep: p.data.nextStep ?? null, nextDate: p.data.nextDate, updatedAt: new Date() }).where(eq(clients.id, id));
  await db.insert(clientEvents).values({ clientId: id, stage: cur.stage !== p.data.stage ? p.data.stage : null, note: p.data.note, by: admin.id });
  await audit(admin.id, "client_stage", `${id} ${p.data.stage}`);
  revalidatePath(`/clients/${id}`); revalidatePath("/clients"); revalidatePath("/");
  return { ok: "اتسجل." };
}

export async function deleteClient(fd: FormData) {
  const admin = await requireAdmin();
  if (fd.get("confirm") !== "حذف") return;
  const id = String(fd.get("id"));
  await db.delete(clients).where(eq(clients.id, id));
  await audit(admin.id, "client_delete", id);
  revalidatePath("/clients");
  redirect("/clients");
}
