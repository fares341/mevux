import "server-only";
import { and, desc, eq, gte, inArray, ne, or } from "drizzle-orm";
import { db, users, projects, projectRoles, roleMembers, tasks, updates, complaints, deductions, complaintFiles } from "./db";
import type { SessionUser } from "./auth";
import { audit } from "./audit";
import { getSettings } from "./settings";

// Every function here takes the signed-in user and enforces permissions itself,
// so the web pages and the assistant share exactly the same rules.

export const ACTIVE_ST = ["APPROVED", "IN_PROGRESS", "DELIVERED"] as const;
export const TASK_ST = { TODO: "لسه", DOING: "شغال عليها", REVIEW: "مراجعة", DONE: "خلصت", BLOCKED: "واقفة" } as const;
export type TaskSt = keyof typeof TASK_ST;
export const COMPLAINT_ST = { OPEN: "مفتوحة", ANSWERED: "اترد عليها", RESOLVED: "اتحلت", DISMISSED: "اترفضت", DEDUCTED: "اتحولت لخصم" } as const;

const isLead = (u: SessionUser) => u.role === "ADMIN" || u.role === "TEAM_LEAD";
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export async function myProjectIds(userId: string): Promise<string[]> {
  const r = await db.selectDistinct({ id: projectRoles.projectId }).from(roleMembers).innerJoin(projectRoles, eq(roleMembers.roleId, projectRoles.id)).where(eq(roleMembers.userId, userId));
  return r.map((x) => x.id);
}

/**
 * Projects this person may see (names and progress only).
 * - Admin: everything.
 * - Member: ONLY projects they hold a role in. Nothing else, whatever its status.
 * - Team lead: their own projects + projects currently being built (to follow up), never finished ones.
 */
export const LEAD_SCOPE = ["APPROVED", "IN_PROGRESS"] as const;
export async function visibleProjects(u: SessionUser) {
  const rows = await db.select({ id: projects.id, name: projects.name, client: projects.client, status: projects.status, dueDate: projects.dueDate }).from(projects).where(ne(projects.status, "CANCELLED")).orderBy(desc(projects.createdAt));
  if (u.role === "ADMIN") return rows;
  const mine = new Set(await myProjectIds(u.id));
  return rows.filter((p) => mine.has(p.id) || (u.role === "TEAM_LEAD" && (LEAD_SCOPE as readonly string[]).includes(p.status)));
}
export async function visibleProjectIds(u: SessionUser) { return new Set((await visibleProjects(u)).map((p) => p.id)); }

async function canSeeProject(u: SessionUser, projectId: string) {
  return (await visibleProjects(u)).some((p) => p.id === projectId);
}
async function membersOf(projectId: string) {
  return db.selectDistinct({ id: users.id, name: users.name }).from(roleMembers).innerJoin(projectRoles, eq(roleMembers.roleId, projectRoles.id)).innerJoin(users, eq(roleMembers.userId, users.id)).where(eq(projectRoles.projectId, projectId));
}

export async function activeUsers() {
  return db.select({ id: users.id, name: users.name, role: users.role, jobTitle: users.jobTitle }).from(users).where(eq(users.active, true));
}

// ---------- tasks ----------
export async function createTask(u: SessionUser, d: { projectId: string; title: string; details?: string; assigneeId?: string; dueDate?: Date | null; roleId?: string }) {
  if (!isLead(u)) throw new Error("إنشاء المهام للمدير والتيم ليد بس.");
  if (!(await canSeeProject(u, d.projectId))) throw new Error("المشروع غير موجود.");
  if (d.assigneeId && !(await activeUsers()).some((x) => x.id === d.assigneeId)) throw new Error("الشخص غير موجود.");
  const [t] = await db.insert(tasks).values({ projectId: d.projectId, title: d.title.slice(0, 200), details: d.details?.slice(0, 4000), assigneeId: d.assigneeId || null, dueDate: d.dueDate ?? null, roleId: d.roleId || null, createdBy: u.id }).returning();
  await audit(u.id, "task_create", t.title);
  return t;
}

export async function setTaskStatus(u: SessionUser, taskId: string, status: TaskSt) {
  const t = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!t) throw new Error("المهمة غير موجودة.");
  if (!isLead(u) && t.assigneeId !== u.id) throw new Error("دي مش مهمتك.");
  await db.update(tasks).set({ status, doneAt: status === "DONE" ? new Date() : null }).where(eq(tasks.id, taskId));
  await audit(u.id, "task_status", `${t.title} → ${status}`);
  return { ...t, status };
}

export async function listTasks(u: SessionUser, opts: { mine?: boolean; projectId?: string; open?: boolean } = {}) {
  const vis = (await visibleProjects(u)).map((p) => p.id);
  if (!vis.length) return [];
  const conds = [inArray(tasks.projectId, opts.projectId ? vis.filter((x) => x === opts.projectId) : vis)];
  if (opts.mine) conds.push(eq(tasks.assigneeId, u.id));
  const rows = await db.select({ t: tasks, project: projects.name, assignee: users.name }).from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id)).leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(and(...conds)).orderBy(desc(tasks.createdAt));
  return rows.filter((r) => !opts.open || r.t.status !== "DONE").map((r) => ({ ...r.t, project: r.project, assignee: r.assignee }));
}

// ---------- daily updates ----------
export async function addUpdate(u: SessionUser, projectId: string | null, text: string, source = "WEB") {
  const clean = text.trim().slice(0, 4000);
  if (clean.length < 2) throw new Error("اكتب التحديث.");
  if (projectId && !(await canSeeProject(u, projectId))) throw new Error("المشروع غير موجود.");
  const [x] = await db.insert(updates).values({ userId: u.id, projectId, text: clean, source }).returning();
  return x;
}

export async function feed(u: SessionUser, opts: { userId?: string; projectId?: string; since?: Date; limit?: number } = {}) {
  const vis = (await visibleProjects(u)).map((p) => p.id);
  const conds = [];
  if (opts.userId) conds.push(eq(updates.userId, opts.userId));
  if (opts.projectId) conds.push(eq(updates.projectId, opts.projectId));
  if (opts.since) conds.push(gte(updates.createdAt, opts.since));
  const rows = await db.select({ x: updates, name: users.name, project: projects.name }).from(updates)
    .innerJoin(users, eq(updates.userId, users.id)).leftJoin(projects, eq(updates.projectId, projects.id))
    .where(conds.length ? and(...conds) : undefined).orderBy(desc(updates.createdAt)).limit(opts.limit ?? 50);
  // Updates on projects the viewer can't see are hidden (general notes stay visible).
  return rows.filter((r) => !r.x.projectId || vis.includes(r.x.projectId)).map((r) => ({ ...r.x, name: r.name, project: r.project }));
}

// ---------- follow-up overview (admin / team lead) ----------
export async function followUp(u: SessionUser) {
  if (!isLead(u)) throw new Error("المتابعة للمدير والتيم ليد بس.");
  const now = new Date();
  const active = await db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.status, u.role === "ADMIN" ? [...ACTIVE_ST] : [...LEAD_SCOPE]));
  const ids = active.map((p) => p.id);
  const roles = ids.length ? await db.select({ r: projectRoles, userId: roleMembers.userId, name: users.name }).from(projectRoles)
    .innerJoin(roleMembers, eq(roleMembers.roleId, projectRoles.id)).innerJoin(users, eq(roleMembers.userId, users.id)).where(inArray(projectRoles.projectId, ids)) : [];
  const lateRoles = roles.filter((x) => x.r.dueDate && !x.r.deliveredAt && x.r.dueDate < now).map((x) => ({
    project: active.find((p) => p.id === x.r.projectId)?.name, role: x.r.title, person: x.name,
    days: Math.floor((+now - +x.r.dueDate!) / 86400000), progress: x.r.progress,
  }));
  const overdueTasks = (await listTasks(u, { open: true })).filter((t) => t.dueDate && t.dueDate < now);
  const today = await db.selectDistinct({ userId: updates.userId }).from(updates).where(gte(updates.createdAt, startOfDay()));
  const working = [...new Map(roles.filter((x) => !x.r.deliveredAt).map((x) => [x.userId, x.name])).entries()];
  const silent = working.filter(([id]) => !today.some((t) => t.userId === id)).map(([, name]) => name);
  return { lateRoles, overdueTasks, silent, workingCount: working.length };
}

/** What a person is working on. Admin/lead only; never includes money. */
export async function personStatus(u: SessionUser, personId: string) {
  if (!isLead(u)) throw new Error("مسموح للمدير والتيم ليد بس.");
  const p = await db.query.users.findFirst({ where: eq(users.id, personId) });
  if (!p) throw new Error("الشخص غير موجود.");
  const roles = await db.select({ title: projectRoles.title, progress: projectRoles.progress, dueDate: projectRoles.dueDate, deliveredAt: projectRoles.deliveredAt, project: projects.name, status: projects.status })
    .from(roleMembers).innerJoin(projectRoles, eq(roleMembers.roleId, projectRoles.id)).innerJoin(projects, eq(projectRoles.projectId, projects.id))
    .where(and(eq(roleMembers.userId, personId), inArray(projects.status, u.role === "ADMIN" ? [...ACTIVE_ST] : [...LEAD_SCOPE])));
  const t = (await listTasks(u, { open: true })).filter((x) => x.assigneeId === personId);
  const last = await feed(u, { userId: personId, limit: 5 });
  return { name: p.name, roles, tasks: t, lastUpdates: last };
}

// ---------- complaints ----------
export type EvidenceFile = { stored: string; name: string; size: number; mime: string; isVoice?: boolean };
export async function fileComplaint(u: SessionUser, d: { projectId: string; againstId: string; text: string; evidence?: string; files?: EvidenceFile[] }) {
  if (d.againstId === u.id) throw new Error("مينفعش تشتكي على نفسك.");
  const members = await membersOf(d.projectId);
  if (u.role !== "ADMIN" && !members.some((m) => m.id === u.id)) throw new Error("لازم تكون في المشروع عشان تقدّم شكوى عليه.");
  if (!members.some((m) => m.id === d.againstId)) throw new Error("الشخص ده مش في المشروع.");
  if (d.text.trim().length < 5) throw new Error("اكتب الشكوى بالتفصيل.");
  const [c] = await db.insert(complaints).values({ projectId: d.projectId, reporterId: u.id, againstId: d.againstId, text: d.text.trim().slice(0, 4000), evidence: d.evidence?.slice(0, 4000) }).returning();
  if (d.files?.length) await db.insert(complaintFiles).values(d.files.map((f) => ({ complaintId: c.id, uploadedBy: u.id, originalName: f.name, storedName: f.stored, size: f.size, mime: f.mime, isVoice: !!f.isVoice })));
  await audit(u.id, "complaint_file", `${c.id} files:${d.files?.length ?? 0}`);
  return c;
}

export async function respondComplaint(u: SessionUser, id: string, text: string) {
  const c = await db.query.complaints.findFirst({ where: eq(complaints.id, id) });
  if (!c || c.againstId !== u.id) throw new Error("الشكوى غير موجودة.");
  if (!["OPEN", "ANSWERED"].includes(c.status)) throw new Error("الشكوى اتقفلت.");
  await db.update(complaints).set({ response: text.trim().slice(0, 4000), respondedAt: new Date(), status: "ANSWERED" }).where(eq(complaints.id, id));
  await audit(u.id, "complaint_respond", id);
}

/** Reporter identity is returned to the admin only. */
export async function listComplaints(u: SessionUser, opts: { open?: boolean } = {}) {
  const base = db.select({ c: complaints, project: projects.name, against: users.name }).from(complaints).innerJoin(projects, eq(complaints.projectId, projects.id)).innerJoin(users, eq(complaints.againstId, users.id));
  const where = isLead(u) ? undefined : or(eq(complaints.againstId, u.id), eq(complaints.reporterId, u.id));
  const rows = await base.where(where).orderBy(desc(complaints.createdAt));
  const reporters = u.role === "ADMIN" ? await db.select({ id: users.id, name: users.name }).from(users) : [];
  // Evidence files: the admin sees all; a reporter sees only what they uploaded. The accused never sees them
  // (a screenshot or voice could reveal who complained).
  const ids = rows.map((r) => r.c.id);
  const files = ids.length ? await db.select({ id: complaintFiles.id, complaintId: complaintFiles.complaintId, name: complaintFiles.originalName, mime: complaintFiles.mime, size: complaintFiles.size, isVoice: complaintFiles.isVoice, uploadedBy: complaintFiles.uploadedBy }).from(complaintFiles).where(inArray(complaintFiles.complaintId, ids)) : [];
  const filesFor = (cid: string) => files.filter((f) => f.complaintId === cid && (u.role === "ADMIN" || f.uploadedBy === u.id)).map(({ uploadedBy: _u, ...f }) => f);
  return rows.filter((r) => !opts.open || ["OPEN", "ANSWERED"].includes(r.c.status)).map((r) => ({
    files: filesFor(r.c.id),
    id: r.c.id, projectId: r.c.projectId, project: r.project, againstId: r.c.againstId, against: r.against,
    text: r.c.text, evidence: r.c.evidence, response: r.c.response, status: r.c.status, decisionNote: r.c.decisionNote, createdAt: r.c.createdAt,
    mine: r.c.reporterId === u.id,
    reporter: u.role === "ADMIN" ? reporters.find((x) => x.id === r.c.reporterId)?.name ?? "—" : null,
  }));
}

const DED_KEY = { REWORK: "reworkPct", NO_REPLY: "noReplyPct", CLIENT_LOSS: "clientLossPct", CLIENT_REFUSE: "clientRefusePct" } as const;
export async function decideComplaint(u: SessionUser, id: string, decision: "RESOLVED" | "DISMISSED" | "DEDUCT", note?: string, dedType?: keyof typeof DED_KEY) {
  if (u.role !== "ADMIN") throw new Error("القرار للمدير بس.");
  const c = await db.query.complaints.findFirst({ where: eq(complaints.id, id) });
  if (!c) throw new Error("الشكوى غير موجودة.");
  if (decision !== "DEDUCT") {
    await db.update(complaints).set({ status: decision, decisionNote: note }).where(eq(complaints.id, id));
    await audit(u.id, "complaint_" + decision.toLowerCase(), id);
    return;
  }
  // Deduction goes through the normal review: it is created as PENDING on the person's role in that project.
  const role = (await db.select({ id: projectRoles.id }).from(roleMembers).innerJoin(projectRoles, eq(roleMembers.roleId, projectRoles.id))
    .where(and(eq(projectRoles.projectId, c.projectId), eq(roleMembers.userId, c.againstId))).limit(1))[0];
  if (!role) throw new Error("الشخص مالوش دور في المشروع.");
  const type = dedType ?? "REWORK";
  const s = await getSettings();
  const [d] = await db.insert(deductions).values({ roleId: role.id, userId: c.againstId, type, pct: Number(s[DED_KEY[type]]), banNext: type === "CLIENT_LOSS" || type === "CLIENT_REFUSE", reason: c.text, evidence: [c.evidence, c.response && `رد الموظف: ${c.response}`].filter(Boolean).join("\n") || null, createdBy: u.id }).returning();
  await db.update(complaints).set({ status: "DEDUCTED", decisionNote: note, deductionId: d.id }).where(eq(complaints.id, id));
  await audit(u.id, "complaint_deduct", id);
}
