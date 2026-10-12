"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, projectRoles, roleMembers, deductions, projectMessages, roleNotes } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { isRoleMember } from "@/lib/access";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { cairoToDate, fmtCairo } from "@/lib/tz";
import { cutoff } from "@/lib/finance";
import { rulesFor } from "@/lib/project-rules";
import { projects } from "@/lib/db";
import { checkFile, saveFile } from "@/lib/storage";

type R = { ok?: string; error?: string };
const v = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const refresh = (projectId: string) => { revalidatePath(`/projects/${projectId}`); revalidatePath("/"); revalidatePath("/projects"); };
const roleOf = (id: string) => db.query.projectRoles.findFirst({ where: eq(projectRoles.id, id) });
const say = (projectId: string, userId: string, text: string) => db.insert(projectMessages).values({ projectId, userId, text });

/** Admin: fill in and send the work order. Re-sending after edits asks the employee to confirm again. */
export async function issueWorkOrder(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const role = await roleOf(v(fd, "roleId"));
  if (!role) return { error: "الدور مش موجود." };
  const scope = v(fd, "scope").slice(0, 8000);
  const checklist = v(fd, "checklist").split("\n").map((x) => x.replace(/^[-•*☐\d.)\s]+/, "").trim()).filter(Boolean).slice(0, 30);
  const done = v(fd, "doneDefinition").slice(0, 2000);
  const deadline = cairoToDate(v(fd, "deadline"));
  const st = await getSettings();
  const proj = await db.query.projects.findFirst({ where: eq(projects.id, role.projectId) });
  const pr = rulesFor(proj?.dedRules, st);
  const grace = Math.max(0, Math.min(168, Math.round(Number(v(fd, "graceHours") === "" ? pr.graceHours : v(fd, "graceHours")) || 0)));
  if (scope.length < 10) return { error: "اكتب المطلوب بالتفصيل (التيكت)." };
  if (!checklist.length) return { error: "اكتب قائمة التسليمات: حاجة في كل سطر." };
  if (!done) return { error: "اكتب إمتى الشغل يعتبر خلص." };
  if (!deadline) return { error: "حدد معاد التسليم (يوم وساعة)." };
  if (deadline < new Date()) return { error: "معاد التسليم لازم يكون بعد دلوقتي." };
  // Attachments sent with the order (files, images, video, one voice note) become role details.
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const voice = fd.get("voice");
  const att = [...files.map((f) => ({ f, v: false })), ...(voice instanceof File && voice.size ? [{ f: voice, v: true }] : [])];
  if (files.length > 10) return { error: "أقصى حاجة 10 ملفات مع أمر الشغل." };
  if (att.reduce((a, x) => a + x.f.size, 0) > 50 * 1024 * 1024) return { error: "مجموع الملفات أكبر من 50 ميجا." };
  for (const { f } of att) { const e = checkFile(f); if (e) return { error: `${f.name}: ${e}` }; }
  for (const { f, v: isVoice } of att) { const sf = await saveFile(f); await db.insert(roleNotes).values({ roleId: role.id, authorId: admin.id, fileName: sf.name, storedName: sf.stored, size: sf.size, mime: sf.mime, isVoice }); }
  const changed = !!role.issuedAt;
  await db.update(projectRoles).set({
    scope, checklist: JSON.stringify(checklist), checklistDone: changed ? role.checklistDone : "[]", doneDefinition: done,
    deadlineAt: deadline, dueDate: deadline, graceHours: grace, issuedAt: new Date(), acceptedAt: null,
    extStatus: role.extStatus === "PENDING" ? "REJECTED" : role.extStatus,
  }).where(eq(projectRoles.id, role.id));
  const people = await db.select({ userId: roleMembers.userId }).from(roleMembers).where(eq(roleMembers.roleId, role.id));
  await say(role.projectId, admin.id, `📋 ${changed ? "اتعدّل" : "جديد"}: أمر شغل «${role.title}»${att.length ? ` ومعاه ${att.length} مرفق` : ""}. التسليم ${fmtCairo(deadline)}. افتح صفحة المشروع واقرا التفاصيل ودوس «استلمت وفهمت».`);
  await audit(admin.id, "work_order_issue", `${role.id} → ${people.length} people, due ${deadline.toISOString()}`);
  refresh(role.projectId);
  return { ok: changed ? "اتعدّل أمر الشغل واتبعت تاني. الموظف لازم يأكد استلامه من جديد." : "اتبعت أمر الشغل. هيظهرله في صفحة المشروع وفي «النهارده» وفي جروب المشروع." };
}

async function myRole(fd: FormData) {
  const u = await requireUser();
  const role = await roleOf(v(fd, "roleId"));
  if (!role || !(await isRoleMember(u, role.id)) || u.role === "ADMIN" && !(await db.query.roleMembers.findFirst({ where: and(eq(roleMembers.roleId, role.id), eq(roleMembers.userId, u.id)) }))) throw new Error("ده مش دورك.");
  return { u, role };
}
const wrap = async (fn: () => Promise<R>): Promise<R> => { try { return await fn(); } catch (e) { return { error: e instanceof Error ? e.message : "حصل خطأ." }; } };

export async function acceptWorkOrder(_: R, fd: FormData): Promise<R> {
  return wrap(async () => {
    const { u, role } = await myRole(fd);
    if (!role.issuedAt) return { error: "أمر الشغل لسه ما اتبعتش." };
    await db.update(projectRoles).set({ acceptedAt: new Date() }).where(eq(projectRoles.id, role.id));
    await say(role.projectId, u.id, `✅ استلمت أمر شغل «${role.title}» وفهمت المطلوب.`);
    await audit(u.id, "work_order_accept", role.id);
    refresh(role.projectId);
    return { ok: "اتسجل إنك استلمت. ربنا يوفقك 💪" };
  });
}

export async function askQuestion(_: R, fd: FormData): Promise<R> {
  return wrap(async () => {
    const { u, role } = await myRole(fd);
    const text = v(fd, "text").slice(0, 4000);
    if (text.length < 3) return { error: "اكتب سؤالك." };
    await db.insert(roleNotes).values({ roleId: role.id, authorId: u.id, text: "❓ " + text });
    await say(role.projectId, u.id, `❓ سؤال على «${role.title}»: ${text}`);
    refresh(role.projectId);
    return { ok: "اتبعت سؤالك للمدير، وهيظهر في تفاصيل الدور وفي جروب المشروع." };
  });
}

export async function toggleChecklist(fd: FormData) {
  const { role } = await myRole(fd).catch(() => ({ role: null as null | Awaited<ReturnType<typeof roleOf>> }));
  if (!role) return;
  const i = Number(v(fd, "i"));
  const list: number[] = JSON.parse(role.checklistDone || "[]");
  const next = list.includes(i) ? list.filter((x) => x !== i) : [...list, i];
  await db.update(projectRoles).set({ checklistDone: JSON.stringify(next) }).where(eq(projectRoles.id, role.id));
  refresh(role.projectId);
}

export async function requestExtension(_: R, fd: FormData): Promise<R> {
  return wrap(async () => {
    const { u, role } = await myRole(fd);
    const c = cutoff(role);
    if (!c || !role.deadlineAt) return { error: "مفيش معاد محدد للدور ده." };
    if (new Date() > c) return { error: "المعاد عدّى. طلب التمديد بيبقى قبل المعاد بس." };
    if (role.deliveredAt) return { error: "إنت سلّمت خلاص." };
    const until = cairoToDate(v(fd, "until")), reason = v(fd, "reason").slice(0, 2000);
    if (!until || until <= role.deadlineAt) return { error: "اختار معاد جديد بعد المعاد الحالي." };
    if (reason.length < 5) return { error: "اكتب السبب." };
    await db.update(projectRoles).set({ extUntil: until, extReason: reason, extStatus: "PENDING" }).where(eq(projectRoles.id, role.id));
    await say(role.projectId, u.id, `⏳ طلب تمديد «${role.title}» لحد ${fmtCairo(until)}. السبب: ${reason}`);
    await audit(u.id, "work_order_ext_request", role.id);
    refresh(role.projectId);
    return { ok: "اتبعت طلب التمديد للمدير. لحد ما يرد، المعاد القديم هو اللي ماشي." };
  });
}

export async function decideExtension(fd: FormData) {
  const admin = await requireAdmin();
  const role = await roleOf(v(fd, "roleId"));
  if (!role || role.extStatus !== "PENDING" || !role.extUntil) return;
  const ok = v(fd, "decision") === "APPROVED";
  await db.update(projectRoles).set(ok ? { extStatus: "APPROVED", deadlineAt: role.extUntil, dueDate: role.extUntil } : { extStatus: "REJECTED" }).where(eq(projectRoles.id, role.id));
  await say(role.projectId, admin.id, ok ? `✅ اتوافق على تمديد «${role.title}». المعاد الجديد ${fmtCairo(role.extUntil)}.` : `✖️ طلب تمديد «${role.title}» اترفض. المعاد زي ما هو: ${fmtCairo(role.deadlineAt)}.`);
  await audit(admin.id, ok ? "work_order_ext_approve" : "work_order_ext_reject", role.id);
  refresh(role.projectId);
}

/** Employee hands in. The lateness clock stops now, whenever the admin reviews. */
export async function submitWork(_: R, fd: FormData): Promise<R> {
  return wrap(async () => {
    const { u, role } = await myRole(fd);
    if (!role.issuedAt) return { error: "أمر الشغل لسه ما اتبعتش." };
    if (!role.acceptedAt) return { error: "دوس «استلمت وفهمت» الأول." };
    if (role.reviewStatus === "PENDING") return { error: "إنت سلّمت والمدير بيراجع." };
    const list: string[] = JSON.parse(role.checklist || "[]"), done: number[] = JSON.parse(role.checklistDone || "[]");
    const missing = list.filter((_, i) => !done.includes(i));
    if (missing.length && v(fd, "force") !== "1") return { error: `لسه فيه ${missing.length} حاجة في قائمة التسليمات ما علّمتش عليها: ${missing.join("، ")}. علّم عليها أو اكتب في ملاحظة التسليم ليه.` };
    const note = v(fd, "note").slice(0, 2000);
    const rework = role.reviewStatus === "REWORK";
    await db.update(projectRoles).set({ deliveredAt: role.deliveredAt ?? new Date(), progress: 100, reviewStatus: "PENDING" }).where(eq(projectRoles.id, role.id));
    if (note) await db.insert(roleNotes).values({ roleId: role.id, authorId: u.id, text: "📦 ملاحظة التسليم: " + note });
    await say(role.projectId, u.id, `📦 سلّمت «${role.title}»${rework ? " بعد التعديل" : ""}.${note ? " " + note : ""}`);
    await audit(u.id, "work_order_submit", role.id);
    refresh(role.projectId);
    return { ok: "اتسجل التسليم والعداد وقف. المدير هيراجع ويرد عليك." };
  });
}

/** Admin review: accept, or send back for rework (10% rework deduction, pending review like all deductions). */
export async function reviewWork(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const role = await roleOf(v(fd, "roleId"));
  if (!role) return { error: "الدور مش موجود." };
  if (v(fd, "decision") === "ACCEPTED") {
    await db.update(projectRoles).set({ reviewStatus: "ACCEPTED", reviewNote: v(fd, "note") || null }).where(eq(projectRoles.id, role.id));
    await say(role.projectId, admin.id, `👏 «${role.title}» اتقبل.`);
    await audit(admin.id, "work_order_accept_review", role.id);
    refresh(role.projectId);
    return { ok: "اتقبل الشغل." };
  }
  const note = v(fd, "note"), due = cairoToDate(v(fd, "reworkDue"));
  if (note.length < 5) return { error: "اكتب المطلوب تعديله." };
  if (!due || due < new Date()) return { error: "حدد معاد للتعديل بعد دلوقتي." };
  const proj = await db.query.projects.findFirst({ where: eq(projects.id, role.projectId) });
  const st = { reworkPct: rulesFor(proj?.dedRules, await getSettings()).reworkPct };
  const people = await db.select({ userId: roleMembers.userId }).from(roleMembers).where(eq(roleMembers.roleId, role.id));
  if (v(fd, "deduct") !== "0") for (const p of people)
    await db.insert(deductions).values({ roleId: role.id, userId: p.userId, type: "REWORK", pct: st.reworkPct, reason: "رجوع شغل: " + note, createdBy: admin.id });
  await db.update(projectRoles).set({ reviewStatus: "REWORK", reviewNote: note, reworkDueAt: due, progress: 80 }).where(eq(projectRoles.id, role.id));
  await db.insert(roleNotes).values({ roleId: role.id, authorId: admin.id, text: `🔁 محتاج تعديل (لحد ${fmtCairo(due)}): ${note}` });
  await say(role.projectId, admin.id, `🔁 «${role.title}» محتاج تعديل لحد ${fmtCairo(due)}: ${note}`);
  await audit(admin.id, "work_order_rework", role.id);
  refresh(role.projectId);
  return { ok: v(fd, "deduct") !== "0" ? `اتبعت للتعديل، واتسجل خصم رجوع شغل ${st.reworkPct}% (قيد المراجعة، والموظف يقدر يرد).` : "اتبعت للتعديل من غير خصم." };
}
