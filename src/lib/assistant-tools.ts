import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, users, projectRoles, roleMembers, projectFiles, clients, payouts } from "./db";
import type { SessionUser } from "./auth";
import type { ToolDef } from "./ai";
import * as W from "./work";
import { earnings, loadTeamView, STATUS } from "./projects";
import { STAGES } from "./labels";
import { removeStored } from "./storage";
import { audit } from "./audit";
import { ADMIN_TOOLS, runAdminTool } from "./admin-tools";

// SECURITY MODEL: the model only gets tools that match the signed-in person's role,
// and every tool re-checks permissions and returns only data that person may see.
// Money of other people, project prices and company totals exist only in admin tools.

export type Pending = { stored: string; name: string; size: number; mime: string; used?: boolean };
export type Ctx = { u: SessionUser; files: Pending[] };

const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
function pick<T extends { name: string }>(list: T[], q: string, what: string): T {
  const n = norm(q || "");
  const hits = list.filter((x) => norm(x.name) === n);
  const found = hits.length ? hits : list.filter((x) => norm(x.name).includes(n) || n.includes(norm(x.name)));
  if (found.length === 1) return found[0];
  if (!found.length) throw new Error(`مش لاقي ${what} اسمه "${q}". المتاح: ${list.map((x) => x.name).join("، ") || "لا شيء"}`);
  throw new Error(`فيه أكتر من ${what} بالاسم ده: ${found.map((x) => x.name).join("، ")}. حدد أكتر.`);
}
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const fn = (name: string, description: string, properties: Record<string, object> = {}, required: string[] = []): ToolDef =>
  ({ type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } });
const str = (d: string) => ({ type: "string", description: d });

export function toolsFor(u: SessionUser): ToolDef[] {
  const t: ToolDef[] = [
    fn("my_work", "My roles, progress, deadlines and open tasks."),
    fn("projects_overview", "Active projects: who holds which role and their progress. No money."),
    fn("project_status", "Roles, people, progress and open tasks of one project.", { project: str("project name") }, ["project"]),
    fn("log_update", "Save my daily progress update. Attaches any files the user sent in this message to my role in that project.", { project: str("project name, or empty for a general note"), text: str("the update in the user's words"), progress_percent: { type: "number", description: "optional new progress % for my role in that project" }, mark_delivered: { type: "boolean", description: "true only if the user said they finished and delivered their role" } }, ["text"]),
    fn("update_task", "Change the status of one of my tasks.", { task: str("task title"), status: { type: "string", enum: Object.keys(W.TASK_ST) } }, ["task", "status"]),
    fn("file_complaint", "File a complaint about another person's work in a project I am in. The reporter's name is hidden from them.", { project: str("project name"), against: str("person's name"), text: str("the problem in detail"), evidence: str("evidence if any") }, ["project", "against", "text"]),
    fn("my_complaints", "Complaints about me or filed by me."),
    fn("my_money", "MY OWN earnings, deductions and payouts only."),
  ];
  if (u.role !== "MEMBER") t.push(
    fn("follow_up", "Who is late, overdue tasks, who did not post an update today."),
    fn("person_status", "What a person is working on, progress and last updates (no money).", { person: str("person's name") }, ["person"]),
    fn("create_task", "Create a task in a project.", { project: str("project name"), title: str("task"), assignee: str("person's name, optional"), due_date: str("YYYY-MM-DD, optional") }, ["project", "title"]),
    fn("open_complaints", "Open complaints."),
  );
  if (u.role === "ADMIN") t.push(
    fn("finance_summary", "Company finance: closed-project revenue, owner income, company share, team amounts due."),
    fn("project_finance", "Money details of one project.", { project: str("project name") }, ["project"]),
    fn("clients_pipeline", "Clients and their deal stage and next step."),
    ...ADMIN_TOOLS,
  );
  return t;
}

async function roleOf(userId: string, projectId: string) {
  return (await db.select({ id: projectRoles.id, title: projectRoles.title, deliveredAt: projectRoles.deliveredAt }).from(roleMembers).innerJoin(projectRoles, eq(roleMembers.roleId, projectRoles.id))
    .where(and(eq(projectRoles.projectId, projectId), eq(roleMembers.userId, userId))).limit(1))[0];
}

export async function runTool(name: string, args: Record<string, unknown>, ctx: Ctx): Promise<unknown> {
  const { u } = ctx;
  const allowed = toolsFor(u).some((t) => t.function.name === name);
  if (!allowed) { await audit(u.id, "assistant_denied_tool", name); return { error: "غير مسموح." }; }
  if (ADMIN_TOOLS.some((t) => t.function.name === name)) return runAdminTool(name, args, u, ctx.files);
  const a = (k: string) => (typeof args[k] === "string" ? (args[k] as string).trim() : "");
  const vis = () => W.visibleProjects(u);

  switch (name) {
    case "my_work": {
      const mine = (await loadTeamView(false)).flatMap((p) => p.roles.filter((r) => r.members.some((m) => m.userId === u.id)).map((r) => ({ project: p.name, projectStatus: STATUS[p.status], role: r.title, progress: r.progress, due: day(r.dueDate), delivered: !!r.deliveredAt })));
      const tasks = (await W.listTasks(u, { mine: true, open: true })).map((t) => ({ task: t.title, project: t.project, status: W.TASK_ST[t.status], due: day(t.dueDate) }));
      return { roles: mine.filter((r) => r.projectStatus !== STATUS.CLOSED), openTasks: tasks };
    }
    case "projects_overview": {
      return (await loadTeamView(true)).map((p) => ({ project: p.name, client: p.client, status: STATUS[p.status], due: day(p.dueDate), roles: p.roles.map((r) => ({ role: r.title, people: r.members.map((m) => m.name), progress: r.progress, due: day(r.dueDate), delivered: !!r.deliveredAt })) }));
    }
    case "project_status": {
      const p = pick(await vis(), a("project"), "مشروع");
      const v = (await loadTeamView(false)).find((x) => x.id === p.id)!;
      const tasks = (await W.listTasks(u, { projectId: p.id, open: true })).map((t) => ({ task: t.title, who: t.assignee, status: W.TASK_ST[t.status], due: day(t.dueDate) }));
      const last = (await W.feed(u, { projectId: p.id, limit: 5 })).map((x) => ({ who: x.name, text: x.text, at: x.createdAt.toISOString() }));
      return { project: v.name, status: STATUS[v.status], due: day(v.dueDate), roles: v.roles.map((r) => ({ role: r.title, people: r.members.map((m) => m.name), progress: r.progress, due: day(r.dueDate), delivered: !!r.deliveredAt })), openTasks: tasks, lastUpdates: last };
    }
    case "log_update": {
      const projectName = a("project");
      const p = projectName ? pick(await vis(), projectName, "مشروع") : null;
      await W.addUpdate(u, p?.id ?? null, a("text"), "BOT");
      const out: Record<string, unknown> = { saved: true, project: p?.name ?? "عام" };
      const role = p ? await roleOf(u.id, p.id) : undefined;
      if (p && role) {
        const pct = typeof args.progress_percent === "number" ? Math.max(0, Math.min(100, Math.round(args.progress_percent))) : undefined;
        const deliver = args.mark_delivered === true;
        if (pct !== undefined || deliver) await db.update(projectRoles).set({ progress: deliver ? 100 : pct, ...(deliver && !role.deliveredAt ? { deliveredAt: new Date() } : {}) }).where(eq(projectRoles.id, role.id));
        if (pct !== undefined) out.progress = pct;
        if (deliver) out.delivered = true;
        const files = ctx.files.filter((f) => !f.used);
        for (const f of files) { await db.insert(projectFiles).values({ projectId: p.id, roleId: role.id, kind: "DELIVERABLE", uploadedBy: u.id, originalName: f.name, storedName: f.stored, size: f.size, mime: f.mime, note: "من المساعد" }); f.used = true; }
        if (files.length) out.attached = files.map((f) => f.name);
      } else if (ctx.files.some((f) => !f.used)) out.filesNotAttached = "الملفات محتاجة مشروع إنت فيه دور.";
      return out;
    }
    case "update_task": {
      const mine = (await W.listTasks(u, { mine: u.role === "MEMBER" })).map((t) => ({ ...t, name: t.title }));
      const t = pick(mine, a("task"), "مهمة");
      const st = a("status") as W.TaskSt;
      if (!(st in W.TASK_ST)) return { error: "حالة غير صحيحة." };
      await W.setTaskStatus(u, t.id, st);
      return { task: t.title, status: W.TASK_ST[st] };
    }
    case "file_complaint": {
      const p = pick(await vis(), a("project"), "مشروع");
      const people = await db.selectDistinct({ id: users.id, name: users.name }).from(roleMembers).innerJoin(projectRoles, eq(roleMembers.roleId, projectRoles.id)).innerJoin(users, eq(roleMembers.userId, users.id)).where(eq(projectRoles.projectId, p.id));
      const who = pick(people, a("against"), "شخص في المشروع");
      await W.fileComplaint(u, { projectId: p.id, againstId: who.id, text: a("text"), evidence: a("evidence") || undefined });
      return { filed: true, against: who.name, project: p.name, note: "الشكوى وصلت للمدير، واسمك مش هيظهر للشخص." };
    }
    case "my_complaints": {
      return (await W.listComplaints({ ...u, role: "MEMBER" })).map((c) => ({ project: c.project, against: c.mine ? c.against : "إنت", text: c.text, status: W.COMPLAINT_ST[c.status], yourResponse: c.againstId === u.id ? c.response : undefined }));
    }
    case "my_money": {
      const { map } = await earnings();
      const e = map.get(u.id);
      const paid = (await db.select({ a: payouts.amountEgp }).from(payouts).where(eq(payouts.userId, u.id))).reduce((s, x) => s + x.a, 0);
      return { currency: "EGP", expected: Math.round(e?.expected ?? 0), entitled: Math.round(e?.entitled ?? 0), paid: Math.round(paid), remaining: Math.round((e?.entitled ?? 0) - paid), deductions: Math.round(e?.deducted ?? 0),
        perProject: (e?.items ?? []).map((i) => ({ project: i.project, role: i.title, fee: Math.round(i.base), net: Math.round(i.net), lateDays: i.days })) };
    }
    case "follow_up": {
      const f = await W.followUp(u);
      return { lateRoles: f.lateRoles, overdueTasks: f.overdueTasks.map((t) => ({ task: t.title, project: t.project, who: t.assignee, due: day(t.dueDate) })), noUpdateToday: f.silent };
    }
    case "person_status": {
      const p = pick(await W.activeUsers(), a("person"), "شخص");
      const s = await W.personStatus(u, p.id);
      return { name: s.name, roles: s.roles.map((r) => ({ project: r.project, role: r.title, progress: r.progress, due: day(r.dueDate), delivered: !!r.deliveredAt })), openTasks: s.tasks.map((t) => ({ task: t.title, project: t.project, status: W.TASK_ST[t.status], due: day(t.dueDate) })), lastUpdates: s.lastUpdates.map((x) => ({ project: x.project, text: x.text, at: x.createdAt.toISOString() })) };
    }
    case "create_task": {
      const p = pick(await vis(), a("project"), "مشروع");
      const who = a("assignee") ? pick(await W.activeUsers(), a("assignee"), "شخص") : null;
      const t = await W.createTask(u, { projectId: p.id, title: a("title"), assigneeId: who?.id, dueDate: a("due_date") ? new Date(a("due_date")) : null });
      return { created: t.title, project: p.name, assignee: who?.name ?? null };
    }
    case "open_complaints": {
      return (await W.listComplaints(u, { open: true })).map((c) => ({ project: c.project, against: c.against, text: c.text, response: c.response, status: W.COMPLAINT_ST[c.status], ...(u.role === "ADMIN" ? { from: c.reporter } : {}) }));
    }
    case "finance_summary": {
      const { map, projectsCalc } = await earnings();
      const closed = projectsCalc.filter((x) => x.p.status === "CLOSED");
      const sum = (f: (x: (typeof closed)[number]) => number) => Math.round(closed.reduce((s, x) => s + f(x), 0));
      const team = await db.select({ id: users.id, name: users.name }).from(users);
      const paid = await db.select().from(payouts);
      const { cashflow } = await import("./cashflow");
      const cf = await cashflow(12);
      const m = cf.months[cf.months.length - 1];
      return { currency: "EGP",
        thisMonth: { income: Math.round(m.income), spent: Math.round(m.out), net: Math.round(m.net) },
        last12Months: cf.months.map((x) => ({ month: x.key, income: Math.round(x.income), spent: Math.round(x.out), net: Math.round(x.net) })),
        subscriptions: { monthlyTotal: Math.round(cf.mrr), clients: cf.subs.map((x) => ({ project: x.name, client: x.client, fee: x.fee, currency: x.currency, paidThisMonth: x.paidThisMonth })) },
        closedProjects: closed.length, revenue: sum((x) => x.c.revenue), ownerIncome: sum((x) => x.c.owner), companyShare: sum((x) => x.c.company), fund: sum((x) => x.c.fund),
        activePipelineValue: Math.round(projectsCalc.filter((x) => ["APPROVED", "IN_PROGRESS", "DELIVERED"].includes(x.p.status)).reduce((s, x) => s + x.c.revenue, 0)),
        teamDue: team.map((t) => ({ name: t.name, due: Math.round((map.get(t.id)?.entitled ?? 0) - paid.filter((p) => p.userId === t.id).reduce((s, p) => s + p.amountEgp, 0)) })).filter((x) => x.due) };
    }
    case "project_finance": {
      const p = pick(await vis(), a("project"), "مشروع");
      const { projectsCalc } = await earnings();
      const x = projectsCalc.find((y) => y.p.id === p.id)!;
      const names = await db.select({ id: users.id, name: users.name }).from(users);
      return { currency: "EGP", project: p.name, status: STATUS[x.p.status], revenue: Math.round(x.c.revenue), received: Math.round(x.c.received), costs: Math.round(x.c.costs), fund: Math.round(x.c.fund), teamGross: Math.round(x.c.teamGross), teamNet: Math.round(x.c.teamNet), overCap: x.c.overCap, net: Math.round(x.c.net), owner: Math.round(x.c.owner), company: Math.round(x.c.company),
        people: x.c.lines.map((l) => ({ name: names.find((n) => n.id === l.userId)?.name, role: l.title, fee: Math.round(l.base), deducted: Math.round(l.deducted), net: Math.round(l.net) })) };
    }
    case "clients_pipeline": {
      const rows = await db.select().from(clients).orderBy(asc(clients.nextDate));
      return rows.filter((c) => !["LOST", "DONE"].includes(c.stage)).map((c) => ({ client: c.name, stage: c.customStage || STAGES[c.stage], nextStep: c.nextStep, nextDate: day(c.nextDate) }));
    }
  }
  return { error: "أداة غير معروفة." };
}

export async function discardUnused(files: Pending[]) {
  for (const f of files) if (!f.used) await removeStored(f.stored);
}

