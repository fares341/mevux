"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, clients, clientEvents, clientFiles, installments, projects, projectPayments } from "@/lib/db";
import { and } from "drizzle-orm";
import { checkFile, saveFile, removeStored } from "@/lib/storage";
import { getSettings } from "@/lib/settings";
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
  const p = z.object({ stage: STAGE, customStage: z.string().max(80).optional(), note: z.string().max(2000).optional(), nextStep: z.string().max(300).optional(), nextDate: date })
    .safeParse({ stage: opt(fd, "stage"), customStage: opt(fd, "customStage"), note: opt(fd, "note"), nextStep: opt(fd, "nextStep"), nextDate: opt(fd, "nextDate") });
  if (!p.success) return { error: "راجع البيانات." };
  const cur = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!cur) return { error: "العميل غير موجود." };
  const custom = p.data.customStage ?? null;
  const stageChanged = cur.stage !== p.data.stage, customChanged = (cur.customStage ?? null) !== custom;
  if (!stageChanged && !customChanged && !p.data.note && (p.data.nextStep ?? null) === cur.nextStep && +(p.data.nextDate ?? 0) === +(cur.nextDate ?? 0)) return { error: "مفيش تغيير تسجله." };
  await db.update(clients).set({ stage: p.data.stage, customStage: custom, nextStep: p.data.nextStep ?? null, nextDate: p.data.nextDate, updatedAt: new Date() }).where(eq(clients.id, id));
  await db.insert(clientEvents).values({ clientId: id, stage: stageChanged ? p.data.stage : null, customStage: customChanged ? custom : null, note: p.data.note, by: admin.id });
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

const clientRefresh = (id: string) => { revalidatePath(`/clients/${id}`); revalidatePath("/clients"); };

export async function uploadClientFile(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const clientId = String(fd.get("clientId"));
  const file = fd.get("file") as File;
  const err = checkFile(file); if (err) return { error: err };
  const kind = ["BRIEF", "CONTRACT", "OTHER"].includes(String(fd.get("kind"))) ? String(fd.get("kind")) : "OTHER";
  const s = await saveFile(file);
  await db.insert(clientFiles).values({ clientId, kind, uploadedBy: admin.id, originalName: s.name, storedName: s.stored, size: s.size, mime: s.mime, note: opt(fd, "note") });
  await audit(admin.id, "client_file_upload", `${clientId} ${s.name}`);
  clientRefresh(clientId);
  return { ok: "تم رفع الملف." };
}

export async function deleteClientFile(fd: FormData) {
  const admin = await requireAdmin();
  const f = await db.query.clientFiles.findFirst({ where: eq(clientFiles.id, String(fd.get("id"))) });
  if (!f) return;
  await db.delete(clientFiles).where(eq(clientFiles.id, f.id));
  await removeStored(f.storedName);
  await audit(admin.id, "client_file_delete", f.originalName);
  clientRefresh(f.clientId);
}

export async function addInstallment(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const p = z.object({ clientId: z.string().min(1), label: z.string().trim().min(2, "اكتب اسم الدفعة").max(120), amount: z.coerce.number().positive("المبلغ غير صحيح").max(1e10), currency: z.enum(["EGP", "SAR", "USD"]), dueNote: z.string().max(200).optional(), projectId: z.string().optional() })
    .safeParse({ clientId: opt(fd, "clientId"), label: opt(fd, "label"), amount: opt(fd, "amount"), currency: opt(fd, "currency") || "EGP", dueNote: opt(fd, "dueNote"), projectId: opt(fd, "projectId") });
  if (!p.success) return { error: p.error.issues[0].message };
  if (p.data.projectId) {
    const pr = await db.query.projects.findFirst({ where: and(eq(projects.id, p.data.projectId), eq(projects.clientId, p.data.clientId)) });
    if (!pr) return { error: "المشروع ده مش تبع العميل." };
  }
  const n = (await db.select().from(installments).where(eq(installments.clientId, p.data.clientId))).length;
  await db.insert(installments).values({ ...p.data, projectId: p.data.projectId ?? null, sort: n });
  await audit(admin.id, "installment_add", `${p.data.clientId} ${p.data.label}`);
  clientRefresh(p.data.clientId);
  return { ok: "تمت إضافة الدفعة للاتفاق." };
}

export async function deleteInstallment(fd: FormData) {
  const admin = await requireAdmin();
  const it = await db.query.installments.findFirst({ where: eq(installments.id, String(fd.get("id"))) });
  if (!it) return;
  if (it.paymentId) await db.delete(projectPayments).where(eq(projectPayments.id, it.paymentId));
  await db.delete(installments).where(eq(installments.id, it.id));
  await audit(admin.id, "installment_delete", it.label);
  clientRefresh(it.clientId);
  if (it.projectId) revalidatePath(`/projects/${it.projectId}`);
}

// Tick / untick "paid". Linked to a project → mirrors into that project's payments.
export async function togglePaid(fd: FormData) {
  const admin = await requireAdmin();
  const it = await db.query.installments.findFirst({ where: eq(installments.id, String(fd.get("id"))) });
  if (!it) return;
  if (it.paidAt) {
    if (it.paymentId) await db.delete(projectPayments).where(eq(projectPayments.id, it.paymentId));
    await db.update(installments).set({ paidAt: null, paymentId: null }).where(eq(installments.id, it.id));
    await db.insert(clientEvents).values({ clientId: it.clientId, note: `إلغاء تسجيل دفع: ${it.label}`, by: admin.id });
  } else {
    let paymentId: string | null = null;
    if (it.projectId) {
      const pr = await db.query.projects.findFirst({ where: eq(projects.id, it.projectId) });
      if (pr) {
        const s = await getSettings();
        const toEgp = (c: string) => (c === "SAR" ? Number(s.rateSAR) : c === "USD" ? Number(s.rateUSD) : 1);
        const amount = it.currency === pr.currency ? it.amount : (it.amount * toEgp(it.currency)) / pr.rate;
        paymentId = (await db.insert(projectPayments).values({ projectId: pr.id, amount: Math.round(amount * 100) / 100, note: it.label }).returning())[0].id;
      }
    }
    await db.update(installments).set({ paidAt: new Date(), paymentId }).where(eq(installments.id, it.id));
    await db.insert(clientEvents).values({ clientId: it.clientId, note: `تم دفع: ${it.label} (${it.amount.toLocaleString("en-US")} ${({ EGP: "ج", SAR: "ريال", USD: "$" } as Record<string, string>)[it.currency]})`, by: admin.id });
  }
  await audit(admin.id, "installment_toggle", it.id);
  clientRefresh(it.clientId);
  if (it.projectId) { revalidatePath(`/projects/${it.projectId}`); revalidatePath("/finance"); }
}
