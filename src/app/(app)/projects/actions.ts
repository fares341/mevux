"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { db, projects, projectPayments, projectCosts, projectRoles, roleMembers, deductions, bans, users, suppliers, clients, clientEvents } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";

export type R = { ok?: string; error?: string };
const date = z.preprocess((v) => (v ? new Date(String(v)) : null), z.date().nullable());
const money = z.coerce.number().min(0).max(1e10);
const done = (id: string) => { revalidatePath("/projects"); revalidatePath(`/projects/${id}`); revalidatePath("/finance"); revalidatePath("/my"); };
const f = (fd: FormData, k: string) => { const v = fd.get(k); return v === null || v === "" ? undefined : String(v); };

async function rateFor(currency: string) {
  const s = await getSettings();
  return currency === "SAR" ? Number(s.rateSAR) : currency === "USD" ? Number(s.rateUSD) : 1;
}

export async function createProject(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const p = z.object({
    name: z.string().trim().min(2, "اكتب اسم المشروع").max(120), client: z.string().trim().min(2, "اختر العميل أو اكتب اسمه").max(120),
    currency: z.enum(["EGP", "SAR", "USD"]), price: money, size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
    status: z.enum(["MEETING", "BRIEF", "APPROVED", "IN_PROGRESS"]), billing: z.enum(["ONE_TIME", "SUBSCRIPTION"]).default("ONE_TIME"), monthlyFee: z.coerce.number().min(0).max(1e9).optional(), freeMessages: z.coerce.number().int().min(0).max(1e7).optional(), startDate: date, dueDate: date, description: z.string().max(4000).optional(),
  }).safeParse({ name: f(fd, "name"), client: f(fd, "client") || (f(fd, "clientId") ? (await db.query.clients.findFirst({ where: eq(clients.id, f(fd, "clientId")!) }))?.name : undefined), currency: f(fd, "currency"), price: f(fd, "price"), size: f(fd, "size"), status: f(fd, "status"), billing: f(fd, "billing"), monthlyFee: f(fd, "monthlyFee"), freeMessages: f(fd, "freeMessages"), startDate: f(fd, "startDate"), dueDate: f(fd, "dueDate"), description: f(fd, "description") });
  if (!p.success) return { error: p.error.issues[0].message };
  if (p.data.billing === "SUBSCRIPTION" && !p.data.monthlyFee) return { error: "اكتب قيمة الاشتراك الشهري." };
  const clientId = f(fd, "clientId");
  const cl = clientId ? await db.query.clients.findFirst({ where: eq(clients.id, clientId) }) : null;
  const s = await getSettings();
  const [row] = await db.insert(projects).values({ ...p.data, clientId: cl?.id ?? null, rate: await rateFor(p.data.currency), fundPct: Number(s.fundPct), ownerPct: Number(s.ownerPct), teamCapPct: Number(s.teamCapPct) }).returning();
  // "Banned from the next project": every open ban is consumed by this new project.
  await db.update(bans).set({ consumedByProject: row.id }).where(isNull(bans.consumedByProject));
  if (cl && !["ACTIVE", "DONE"].includes(cl.stage)) {
    await db.update(clients).set({ stage: "ACTIVE", updatedAt: new Date() }).where(eq(clients.id, cl.id));
    await db.insert(clientEvents).values({ clientId: cl.id, stage: "ACTIVE", note: `بدأ مشروع: ${row.name}`, by: admin.id });
  }
  await audit(admin.id, "project_create", row.name);
  redirect(`/projects/${row.id}`);
}

export async function updateProject(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const id = String(fd.get("id"));
  const p = z.object({
    name: z.string().trim().min(2).max(120), client: z.string().trim().min(2).max(120), price: money,
    rate: z.coerce.number().positive().max(10000), size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
    status: z.enum(["MEETING", "BRIEF", "APPROVED", "IN_PROGRESS", "DELIVERED", "CLOSED", "CANCELLED"]),
    billing: z.enum(["ONE_TIME", "SUBSCRIPTION"]).default("ONE_TIME"), monthlyFee: z.coerce.number().min(0).max(1e9).optional(), freeMessages: z.coerce.number().int().min(0).max(1e7).optional(), startDate: date, dueDate: date, description: z.string().max(4000).optional(),
  }).safeParse({ billing: f(fd, "billing"), monthlyFee: f(fd, "monthlyFee"), freeMessages: f(fd, "freeMessages"), name: f(fd, "name"), client: f(fd, "client"), price: f(fd, "price"), rate: f(fd, "rate"), size: f(fd, "size"), status: f(fd, "status"), startDate: f(fd, "startDate"), dueDate: f(fd, "dueDate"), description: f(fd, "description") });
  if (!p.success) return { error: "راجع البيانات: " + p.error.issues[0].path.join(".") };
  const cur = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!cur) return { error: "المشروع غير موجود." };
  await db.update(projects).set({ ...p.data, closedAt: p.data.status === "CLOSED" ? (cur.closedAt ?? new Date()) : null }).where(eq(projects.id, id));
  await audit(admin.id, "project_update", `${id} → ${p.data.status}`);
  done(id);
  return { ok: "تم حفظ المشروع." };
}

export async function deleteProject(fd: FormData) {
  const admin = await requireAdmin();
  const id = String(fd.get("id"));
  if (fd.get("confirm") !== "حذف") return;
  await db.delete(projects).where(eq(projects.id, id));
  await audit(admin.id, "project_delete", id);
  revalidatePath("/projects");
  redirect("/projects");
}

export async function addPayment(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const projectId = String(fd.get("projectId"));
  const p = z.object({ amount: z.coerce.number().positive("المبلغ غير صحيح").max(1e10), paidAt: date, note: z.string().max(200).optional() }).safeParse({ amount: f(fd, "amount"), paidAt: f(fd, "paidAt"), note: f(fd, "note") });
  if (!p.success) return { error: p.error.issues[0].message };
  await db.insert(projectPayments).values({ projectId, amount: p.data.amount, paidAt: p.data.paidAt ?? new Date(), note: p.data.note });
  await audit(admin.id, "payment_add", `${projectId} ${p.data.amount}`);
  done(projectId);
  return { ok: "تم تسجيل الدفعة." };
}

export async function addCost(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const projectId = String(fd.get("projectId"));
  let name = f(fd, "name");
  const supplierId = f(fd, "supplierId");
  if (supplierId) {
    const s = await db.query.suppliers.findFirst({ where: eq(suppliers.id, supplierId) });
    if (s) name = name || `${s.provider} · ${s.item}`;
  }
  const p = z.object({ name: z.string().trim().min(1, "اكتب اسم التكلفة").max(160), amount: z.coerce.number().positive("المبلغ غير صحيح").max(1e10) }).safeParse({ name, amount: f(fd, "amount") });
  if (!p.success) return { error: p.error.issues[0].message };
  await db.insert(projectCosts).values({ projectId, name: p.data.name, amountEgp: p.data.amount });
  await audit(admin.id, "cost_add", `${projectId} ${p.data.amount}`);
  done(projectId);
  return { ok: "تمت إضافة التكلفة." };
}

export async function removeRow(fd: FormData) {
  const admin = await requireAdmin();
  const kind = String(fd.get("kind")), id = String(fd.get("id")), projectId = String(fd.get("projectId"));
  if (kind === "payment") await db.delete(projectPayments).where(and(eq(projectPayments.id, id), eq(projectPayments.projectId, projectId)));
  if (kind === "cost") await db.delete(projectCosts).where(and(eq(projectCosts.id, id), eq(projectCosts.projectId, projectId)));
  if (kind === "role") await db.delete(projectRoles).where(and(eq(projectRoles.id, id), eq(projectRoles.projectId, projectId)));
  await audit(admin.id, `${kind}_delete`, id);
  done(projectId);
}

// Members of a role: parallel arrays userId[] / share[]; first checked "lead" is the primary owner.
export async function saveRole(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const projectId = String(fd.get("projectId"));
  const roleId = f(fd, "roleId");
  const p = z.object({
    title: z.string().trim().min(2, "اكتب اسم الدور").max(80), fee: money, scope: z.string().max(4000).optional(),
    deliverables: z.string().max(4000).optional(), dueDate: date,
  }).safeParse({ title: f(fd, "title"), fee: f(fd, "fee"), scope: f(fd, "scope"), deliverables: f(fd, "deliverables"), dueDate: f(fd, "dueDate") });
  if (!p.success) return { error: p.error.issues[0].message };
  const userIds = fd.getAll("userId").map(String).filter(Boolean);
  const shares = fd.getAll("share").map(Number);
  const lead = f(fd, "lead");
  const members = userIds.map((u, i) => ({ userId: u, sharePct: shares[i] || 0 }));
  if (!members.length) return { error: "اختر شخصاً واحداً على الأقل للدور." };
  if (new Set(userIds).size !== userIds.length) return { error: "نفس الشخص مكرر في الدور." };
  const total = members.reduce((a, m) => a + m.sharePct, 0);
  if (Math.abs(total - 100) > 0.01) return { error: `مجموع نسب أعضاء الدور لازم يساوي 100% (الحالي ${total}%).` };
  const valid = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, userIds), eq(users.active, true)));
  if (valid.length !== userIds.length) return { error: "فيه شخص غير موجود أو حسابه موقوف." };
  const banned = await db.select({ userId: bans.userId }).from(bans).where(and(eq(bans.consumedByProject, projectId), inArray(bans.userId, userIds)));
  if (banned.length) return { error: "فيه شخص محروم من المشروع ده بسبب خصم سابق." };
  let id = roleId;
  if (id) await db.update(projectRoles).set(p.data).where(and(eq(projectRoles.id, id), eq(projectRoles.projectId, projectId)));
  else id = (await db.insert(projectRoles).values({ ...p.data, projectId }).returning())[0].id;
  await db.delete(roleMembers).where(eq(roleMembers.roleId, id!));
  await db.insert(roleMembers).values(members.map((m, i) => ({ roleId: id!, ...m, isLead: lead ? m.userId === lead : i === 0 })));
  await audit(admin.id, roleId ? "role_update" : "role_create", `${projectId} ${p.data.title}`);
  done(projectId);
  return { ok: roleId ? "تم تحديث الدور." : "تمت إضافة الدور." };
}

export async function setDelivered(fd: FormData) {
  const admin = await requireAdmin();
  const id = String(fd.get("roleId")), projectId = String(fd.get("projectId"));
  const at = f(fd, "deliveredAt");
  await db.update(projectRoles).set({ deliveredAt: at ? new Date(at) : null, progress: at ? 100 : undefined }).where(and(eq(projectRoles.id, id), eq(projectRoles.projectId, projectId)));
  await audit(admin.id, "role_delivered", id);
  done(projectId);
}

// A member may update progress only on a role they belong to.
export async function updateProgress(fd: FormData) {
  const me = await requireUser();
  const roleId = String(fd.get("roleId"));
  const progress = Math.max(0, Math.min(100, Math.round(Number(fd.get("progress")) || 0)));
  const role = await db.query.projectRoles.findFirst({ where: eq(projectRoles.id, roleId) });
  if (!role) return;
  const mine = await db.query.roleMembers.findFirst({ where: and(eq(roleMembers.roleId, roleId), eq(roleMembers.userId, me.id)) });
  if (!mine && me.role !== "ADMIN") return;
  await db.update(projectRoles).set({ progress }).where(eq(projectRoles.id, roleId));
  await audit(me.id, "role_progress", `${roleId} ${progress}%`);
  done(role.projectId);
}

const DED_KEY = { REWORK: "reworkPct", NO_REPLY: "noReplyPct", CLIENT_LOSS: "clientLossPct", CLIENT_REFUSE: "clientRefusePct" } as const;

export async function addDeduction(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const projectId = String(fd.get("projectId"));
  const p = z.object({
    roleId: z.string().min(1), userId: z.string().min(1, "اختر الشخص"), type: z.enum(["REWORK", "NO_REPLY", "CLIENT_LOSS", "CLIENT_REFUSE", "OTHER"]),
    pct: z.coerce.number().min(0).max(100).optional(), reason: z.string().trim().min(3, "اكتب السبب").max(2000), evidence: z.string().max(2000).optional(),
  }).safeParse({ roleId: f(fd, "roleId"), userId: f(fd, "userId"), type: f(fd, "type"), pct: f(fd, "pct"), reason: f(fd, "reason"), evidence: f(fd, "evidence") });
  if (!p.success) return { error: p.error.issues[0].message };
  const m = await db.query.roleMembers.findFirst({ where: and(eq(roleMembers.roleId, p.data.roleId), eq(roleMembers.userId, p.data.userId)) });
  if (!m) return { error: "الشخص ده مش في الدور ده." };
  const s = await getSettings();
  const pct = p.data.type === "OTHER" ? (p.data.pct ?? 0) : Number(s[DED_KEY[p.data.type]]);
  await db.insert(deductions).values({ ...p.data, pct, banNext: p.data.type === "CLIENT_LOSS" || p.data.type === "CLIENT_REFUSE", createdBy: admin.id });
  await audit(admin.id, "deduction_add", `${p.data.userId} ${p.data.type} ${pct}%`);
  done(projectId);
  return { ok: "تم تسجيل الخصم كـ \"قيد المراجعة\". الموظف يقدر يرد عليه من حسابه، وبعدها تعتمده أو ترفضه." };
}

export async function decideDeduction(fd: FormData) {
  const admin = await requireAdmin();
  const id = String(fd.get("id"));
  const status = fd.get("status") === "APPROVED" ? "APPROVED" : "REJECTED";
  const d = await db.query.deductions.findFirst({ where: eq(deductions.id, id) });
  if (!d || d.status !== "PENDING") return;
  await db.update(deductions).set({ status, decidedAt: new Date() }).where(eq(deductions.id, id));
  if (status === "APPROVED" && d.banNext) await db.insert(bans).values({ userId: d.userId, reason: d.reason });
  await audit(admin.id, "deduction_" + status.toLowerCase(), id);
  const role = await db.query.projectRoles.findFirst({ where: eq(projectRoles.id, d.roleId) });
  if (role) done(role.projectId);
}

// The person a deduction is about can answer it once, before the decision.
export async function respondDeduction(_: R, fd: FormData): Promise<R> {
  const me = await requireUser();
  const id = String(fd.get("id"));
  const text = String(fd.get("response") || "").trim().slice(0, 2000);
  if (text.length < 3) return { error: "اكتب ردك." };
  const d = await db.query.deductions.findFirst({ where: and(eq(deductions.id, id), eq(deductions.userId, me.id)) });
  if (!d || d.status !== "PENDING") return { error: "لا يمكن الرد على هذا الخصم." };
  await db.update(deductions).set({ response: text }).where(eq(deductions.id, id));
  await audit(me.id, "deduction_response", id);
  revalidatePath("/my");
  return { ok: "تم إرسال ردك للمدير." };
}
