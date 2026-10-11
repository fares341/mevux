import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db, users, clients, clientEvents, clientFiles, projects, projectPayments, projectCosts, projectRoles, roleMembers, deductions,
  payouts, expenses, installments, projectAssets, credentials, projectFiles, projectBriefs, suppliers, tasks, ideas,
} from "./db";
import type { SessionUser } from "./auth";
import type { ToolDef } from "./ai";
import { STATUS, DED } from "./projects";
import { stageLabel } from "./labels";
import { getSettings, setSetting, DEFAULTS } from "./settings";
import { audit } from "./audit";
import { removeStored } from "./storage";
import { saveRole, addDeduction, decideDeduction } from "@/app/(app)/projects/actions";
import { saveSupplier } from "@/app/(app)/suppliers/actions";
import { resetPassword } from "@/app/(app)/team/actions";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";

// More admin actions for the assistant, so it can do (almost) anything the pages can.
// Every destructive action needs `confirmed: true`, and the system prompt tells the model
// to ask the owner first. Without it the tool only returns a preview of what would go.

const S = (d: string) => ({ type: "string", description: d });
const N = (d: string) => ({ type: "number", description: d });
const B = (d: string) => ({ type: "boolean", description: d });
const E = (values: string[], d: string) => ({ type: "string", enum: values, description: d });
const fn = (name: string, description: string, properties: Record<string, object>, required: string[] = []): ToolDef =>
  ({ type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } });
const CONFIRM = B("true ONLY after the owner clearly said yes to deleting it in this conversation");
const SETTING_KEYS = Object.keys(DEFAULTS);

export const MORE_TOOLS: ToolDef[] = [
  fn("find", "Search everything (clients, projects, people, suppliers, ideas, tasks) by a word, name or phone. Use it whenever you are not sure of an exact name.", { query: S("word to search") }, ["query"]),
  fn("project_details", "Everything about one project: client, contract, dates, roles and people with fees, payments, costs, files, logins (labels only), assets, briefs, open tasks and money summary.", { project: S("project name") }, ["project"]),
  fn("client_details", "Everything about one client: contact details, stage, history, projects, payment agreement and files.", { client: S("client name") }, ["client"]),
  fn("delete_project", "Delete a project that was added by mistake, with its roles, payments, costs, files, tasks, chat and briefs. First call WITHOUT confirmed to get a preview, show it to the owner and ask; call again with confirmed=true only after they agree.", { project: S("project name"), confirmed: CONFIRM }, ["project"]),
  fn("delete_client", "Delete a client added by mistake (with their history, files and payment agreement). Their projects stay but are unlinked unless also_projects=true. Preview first, then confirmed=true after the owner agrees.", { client: S("client name"), also_projects: B("also delete this client's projects"), confirmed: CONFIRM }, ["client"]),
  fn("edit_role", "Change a role in a project: title, fee, people and shares, due date, scope, deliverables. Only send what changes.", { project: S("project name"), role: S("current role title or the person in it"), new_title: S("new title"), fee: N("fee EGP"), people: { type: "array", items: { type: "string" }, description: "new list of people" }, shares: { type: "array", items: { type: "number" }, description: "percent per person, same order" }, due_date: S("YYYY-MM-DD"), scope: S("scope"), deliverables: S("deliverables") }, ["project", "role"]),
  fn("delete_role", "Remove a role from a project. Preview first, then confirmed=true after the owner agrees.", { project: S("project name"), role: S("role title or person"), confirmed: CONFIRM }, ["project", "role"]),
  fn("role_progress", "Set a role's progress percent and/or mark it delivered (or not delivered).", { project: S("project name"), role: S("role title or person"), progress: N("0-100"), delivered: B("true = delivered, false = not delivered"), delivered_date: S("YYYY-MM-DD, default today") }, ["project", "role"]),
  fn("add_deduction", "Record a deduction on a person in a project. Types: REWORK, NO_REPLY, CLIENT_LOSS, CLIENT_REFUSE use the set percentages; OTHER needs pct. It starts as pending; approve with decide_deduction.", { project: S("project name"), person: S("name"), type: E(Object.keys(DED), "type"), pct: N("percent, only for OTHER"), reason: S("why"), role: S("role title if the person has more than one role in the project") }, ["project", "person", "type", "reason"]),
  fn("decide_deduction", "Approve or reject a pending deduction.", { person: S("name"), project: S("project name"), decision: E(["APPROVED", "REJECTED"], "decision") }, ["person", "project", "decision"]),
  fn("remove_record", "Delete one wrong record: a client payment, project cost, team payout, company expense, agreement installment, project asset, login, file, supplier or task. Identify it by its project/client/person plus amount or name.", {
    kind: E(["payment", "cost", "payout", "expense", "installment", "asset", "credential", "file", "supplier", "task", "idea"], "what to delete"),
    project: S("project name (for payment, cost, asset, credential, file, task, payout)"), client: S("client name (for installment)"), person: S("person (for payout)"),
    amount: N("amount, to pick the right one"), name: S("name / label / note / title, to pick the right one"),
  }, ["kind"]),
  fn("list_team", "Employees: name, username, specialty, permission, active or not.", {}),
  fn("employee_account", "Manage an employee account: deactivate, activate, reset_password (returns a new one-time password), set_role (MEMBER/TEAM_LEAD), or delete (needs confirmed).", { person: S("name"), action: E(["deactivate", "activate", "reset_password", "set_role", "delete"], "action"), role: E(["MEMBER", "TEAM_LEAD"], "for set_role"), job_title: S("change specialty"), confirmed: CONFIRM }, ["person", "action"]),
  fn("update_setting", "Change a system setting: percentages (teamCapPct, fundPct, ownerPct, latePctPerDay, lateMaxPct, reworkPct, noReplyPct, clientLossPct, clientRefusePct), exchange rates (rateSAR, rateUSD) or AI models. Applies to new projects.", { key: E(SETTING_KEYS, "setting"), value: S("new value") }, ["key", "value"]),
  fn("show_settings", "Current system settings (percentages, rates, models).", {}),
  fn("cashflow", "Money in and out per month: income, subscriptions, costs, team, fixed costs, expenses, net.", { months: N("how many months back, default 6") }),
  fn("update_supplier", "Change a supplier price or details.", { supplier: S("provider or service name"), price: N("new price"), currency: E(["EGP", "SAR", "USD"], "currency"), billing: E(["MONTHLY", "YEARLY", "PER_MESSAGE", "PER_USAGE", "ONE_TIME"], "billing"), details: S("details") }, ["supplier"]),
  fn("list_tasks", "Tasks, optionally for one project or person.", { project: S("project"), person: S("person"), open_only: B("default true") }),
];

const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
function pick<T>(list: T[], q: string, what: string, name: (x: T) => string): T {
  const n = norm(q || "");
  const exact = list.filter((x) => norm(name(x)) === n);
  const found = exact.length ? exact : list.filter((x) => norm(name(x)).includes(n) || (n.length > 2 && n.includes(norm(name(x)))));
  if (found.length === 1) return found[0];
  if (!found.length) throw new Error(`مش لاقي ${what} باسم "${q}". الموجود: ${list.map(name).slice(0, 20).join("، ") || "لا شيء"}`);
  throw new Error(`فيه أكتر من ${what} بالاسم ده: ${found.map(name).slice(0, 10).join("، ")}. قولي أنهي واحد.`);
}
const fd = (o: Record<string, unknown>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) { if (v === undefined || v === null || v === "") continue; if (Array.isArray(v)) v.forEach((x) => f.append(k, String(x))); else f.append(k, String(v)); } return f; };
const done = (r: { ok?: string; error?: string }) => { if (r.error) throw new Error(r.error); return r.ok ?? "تم"; };
const day = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : undefined);
const r0 = (x: number) => Math.round(x * 100) / 100;

const getProject = async (q: string) => pick(await db.select().from(projects).orderBy(desc(projects.createdAt)), q, "مشروع", (x) => x.name);
const getClient = async (q: string) => pick(await db.select().from(clients), q, "عميل", (x) => x.name);
const getPerson = async (q: string) => pick(await db.select().from(users), q, "موظف", (x) => x.name);

async function rolesOf(projectId: string) {
  const roles = await db.select().from(projectRoles).where(eq(projectRoles.projectId, projectId)).orderBy(asc(projectRoles.createdAt));
  const mems = roles.length ? await db.select({ roleId: roleMembers.roleId, userId: roleMembers.userId, sharePct: roleMembers.sharePct, isLead: roleMembers.isLead, name: users.name })
    .from(roleMembers).innerJoin(users, eq(users.id, roleMembers.userId)).where(inArray(roleMembers.roleId, roles.map((r) => r.id))) : [];
  return roles.map((r) => ({ ...r, members: mems.filter((m) => m.roleId === r.id) }));
}
// A role can be named by its title or by a person in it.
async function getRole(projectId: string, q: string) {
  const roles = await rolesOf(projectId);
  if (!roles.length) throw new Error("المشروع ده مفيهوش أدوار.");
  const n = norm(q);
  const byTitle = roles.filter((r) => norm(r.title) === n || norm(r.title).includes(n));
  if (byTitle.length === 1) return byTitle[0];
  const byPerson = roles.filter((r) => r.members.some((m) => norm(m.name).includes(n) || n.includes(norm(m.name).split(" ")[0])));
  if (byPerson.length === 1) return byPerson[0];
  const list = roles.map((r) => `${r.title} (${r.members.map((m) => m.name).join("، ")})`).join(" / ");
  throw new Error(byTitle.length + byPerson.length > 1 ? `فيه أكتر من دور ممكن: ${list}. حدد أنهي.` : `مش لاقي الدور. الأدوار: ${list}`);
}

async function projectPreview(id: string) {
  const count = async (table: string) => Number(((await db.execute(sql`select count(*)::int as n from ${sql.identifier(table)} where project_id = ${id}`)).rows[0] as { n: number }).n);
  const [roles, payments, costs, files, tasksN, briefs, payoutsN] = await Promise.all(["project_roles", "project_payments", "project_costs", "project_files", "tasks", "project_briefs", "payouts"].map(count));
  return { roles, payments, costs, files, tasks: tasksN, briefs, payouts: payoutsN };
}
async function deleteProjectFully(id: string) {
  const files = await db.select({ s: projectFiles.storedName }).from(projectFiles).where(eq(projectFiles.projectId, id));
  // Payouts recorded against a mistaken project are mistakes too.
  await db.delete(payouts).where(eq(payouts.projectId, id));
  await db.delete(projects).where(eq(projects.id, id)); // everything else cascades
  for (const f of files) await removeStored(f.s).catch(() => {});
}

export async function runMoreTool(name: string, a: Record<string, unknown>, u: SessionUser): Promise<unknown> {
  if (u.role !== "ADMIN") return { error: "غير مسموح." };
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : undefined);
  const n = (k: string) => (typeof a[k] === "number" ? (a[k] as number) : a[k] !== undefined && a[k] !== "" && a[k] !== null ? Number(a[k]) : undefined);
  const confirmed = a.confirmed === true;

  switch (name) {
    case "find": {
      const q = norm(s("query") || "");
      if (q.length < 2) throw new Error("اكتب كلمة أطول.");
      const has = (...xs: (string | null | undefined)[]) => xs.some((x) => x && norm(x).includes(q));
      const [cs, ps, us, sp, ids, ts] = await Promise.all([db.select().from(clients), db.select().from(projects), db.select().from(users), db.select().from(suppliers), db.select().from(ideas), db.select().from(tasks)]);
      return {
        clients: cs.filter((c) => has(c.name, c.company, c.phone, c.email, c.website)).map((c) => ({ name: c.name, stage: stageLabel(c), phone: c.phone, link: `/clients/${c.id}` })),
        projects: ps.filter((p) => has(p.name, p.client, p.description)).map((p) => ({ name: p.name, client: p.client, status: STATUS[p.status], link: `/projects/${p.id}` })),
        people: us.filter((x) => has(x.name, x.username, x.jobTitle)).map((x) => ({ name: x.name, username: x.username, active: x.active })),
        suppliers: sp.filter((x) => has(x.provider, x.item)).map((x) => ({ provider: x.provider, item: x.item, price: x.price, currency: x.currency })),
        ideas: ids.filter((x) => has(x.title, x.details)).map((x) => x.title),
        tasks: ts.filter((x) => has(x.title)).map((x) => ({ title: x.title, status: x.status })),
      };
    }
    case "project_details": {
      const p = await getProject(s("project")!);
      const { loadProject, calc, rules } = await import("./projects");
      const [full, r, roles, files, creds, assets, briefs, ts, pays] = await Promise.all([
        loadProject(p.id), rules(), rolesOf(p.id),
        db.select().from(projectFiles).where(eq(projectFiles.projectId, p.id)),
        db.select({ label: credentials.label, url: credentials.url, username: credentials.username }).from(credentials).where(eq(credentials.projectId, p.id)),
        db.select().from(projectAssets).where(eq(projectAssets.projectId, p.id)),
        db.select({ id: projectBriefs.id, lang: projectBriefs.lang, version: projectBriefs.version, createdAt: projectBriefs.createdAt }).from(projectBriefs).where(eq(projectBriefs.projectId, p.id)),
        db.select().from(tasks).where(eq(tasks.projectId, p.id)),
        db.select().from(payouts).where(eq(payouts.projectId, p.id)),
      ]);
      const c = calc(full!, r);
      return {
        project: p.name, client: p.client, status: STATUS[p.status], currency: p.currency, price: p.price, contract: p.billing === "SUBSCRIPTION" ? `اشتراك ${p.monthlyFee}/شهر، الدفع الجاي ${day(p.nextDueDate) ?? "—"}` : "مرة واحدة",
        start: day(p.startDate), due: day(p.dueDate), closed: day(p.closedAt), kinds: p.kinds, description: p.description,
        roles: roles.map((x) => ({ title: x.title, fee: x.fee, due: day(x.dueDate), delivered: day(x.deliveredAt), progress: x.progress, people: x.members.map((m) => `${m.name} ${m.sharePct}%`) })),
        payments: full!.payments.map((x) => ({ amount: x.amount, date: day(x.paidAt), note: x.note })),
        costs: full!.costs.map((x) => ({ name: x.name, amount_egp: x.amountEgp })),
        teamPayouts: pays.map((x) => ({ amount_egp: x.amountEgp, date: day(x.paidAt), note: x.note })),
        money_egp: { revenue: r0(c.revenue), received: r0(c.received), remaining: r0(c.remaining), costs: r0(c.costs), fund: r0(c.fund), team: r0(c.teamNet), net: r0(c.net), owner: r0(c.owner), company: r0(c.company), overTeamCap: c.overCap },
        files: files.map((f) => `${f.originalName} (${f.kind === "FINAL" ? "نهائي" : "تسليم"})`), logins: creds, assets: assets.map((x) => ({ kind: x.kind, name: x.name, url: x.url, cost: x.cost, paidBy: x.paidBy })),
        briefs: briefs.map((b) => ({ version: b.version, lang: b.lang, link: `/api/briefs/${b.id}` })),
        openTasks: ts.filter((t) => t.status !== "DONE").map((t) => ({ title: t.title, status: t.status, due: day(t.dueDate) })),
        link: `/projects/${p.id}`,
      };
    }
    case "client_details": {
      const c = await getClient(s("client")!);
      const [ev, ps, inst, files] = await Promise.all([
        db.select().from(clientEvents).where(eq(clientEvents.clientId, c.id)).orderBy(desc(clientEvents.createdAt)).limit(15),
        db.select().from(projects).where(eq(projects.clientId, c.id)),
        db.select().from(installments).where(eq(installments.clientId, c.id)).orderBy(asc(installments.sort)),
        db.select().from(clientFiles).where(eq(clientFiles.clientId, c.id)),
      ]);
      return {
        client: c.name, company: c.company, phone: c.phone, email: c.email, website: c.website, socials: c.socials, country: c.country, source: c.source, notes: c.notes, need: c.need,
        stage: stageLabel(c), nextStep: c.nextStep, nextDate: day(c.nextDate),
        history: ev.map((e) => ({ date: day(e.createdAt), note: e.note })),
        projects: ps.map((p) => ({ name: p.name, status: STATUS[p.status], price: p.price, currency: p.currency })),
        paymentAgreement: inst.map((i) => ({ label: i.label, amount: i.amount, currency: i.currency, due: i.dueNote, paid: !!i.paidAt })),
        files: files.map((f) => `${f.originalName} (${f.kind})`), link: `/clients/${c.id}`,
      };
    }
    case "delete_project": {
      const p = await getProject(s("project")!);
      const preview = await projectPreview(p.id);
      if (!confirmed) return { needsConfirmation: true, project: p.name, client: p.client, status: STATUS[p.status], willDelete: preview, ask: `اسأل المدير: متأكد إنك عايز تمسح مشروع "${p.name}" بكل اللي فيه؟ ده مش هيترجع غير من النسخة الاحتياطية.` };
      await deleteProjectFully(p.id);
      await audit(u.id, "project_delete", `${p.name} (assistant) ${JSON.stringify(preview)}`);
      revalidatePath("/projects"); revalidatePath("/finance"); revalidatePath("/clients"); revalidatePath("/");
      return { deleted: p.name, removed: preview };
    }
    case "delete_client": {
      const c = await getClient(s("client")!);
      const ps = await db.select().from(projects).where(eq(projects.clientId, c.id));
      if (!confirmed) return { needsConfirmation: true, client: c.name, projects: ps.map((p) => p.name), projectsWill: a.also_projects ? "تتمسح" : "تفضل بس من غير عميل", ask: `اسأل المدير: متأكد إنك عايز تمسح العميل "${c.name}"${a.also_projects && ps.length ? " ومشاريعه" : ""}؟` };
      if (a.also_projects) for (const p of ps) await deleteProjectFully(p.id);
      else await db.update(projects).set({ clientId: null }).where(eq(projects.clientId, c.id));
      const files = await db.select({ s: clientFiles.storedName }).from(clientFiles).where(eq(clientFiles.clientId, c.id));
      await db.delete(clients).where(eq(clients.id, c.id));
      for (const f of files) await removeStored(f.s).catch(() => {});
      await audit(u.id, "client_delete", `${c.name} (assistant)`);
      revalidatePath("/clients"); revalidatePath("/projects");
      return { deleted: c.name, projectsDeleted: a.also_projects ? ps.map((p) => p.name) : [] };
    }
    case "edit_role": {
      const p = await getProject(s("project")!);
      const r = await getRole(p.id, s("role")!);
      let ids = r.members.map((m) => m.userId), shares = r.members.map((m) => m.sharePct);
      if (Array.isArray(a.people) && (a.people as string[]).length) {
        const team = (await db.select().from(users)).filter((x) => x.active);
        ids = (a.people as string[]).map((x) => pick(team, x, "موظف", (t) => t.name).id);
        shares = Array.isArray(a.shares) && (a.shares as number[]).length === ids.length ? (a.shares as number[]) : ids.map((_, i) => (i === ids.length - 1 ? 100 - Math.floor(100 / ids.length) * (ids.length - 1) : Math.floor(100 / ids.length)));
      } else if (Array.isArray(a.shares) && (a.shares as number[]).length === ids.length) shares = a.shares as number[];
      return { project: p.name, result: done(await saveRole({}, fd({ projectId: p.id, roleId: r.id, title: s("new_title") ?? r.title, fee: n("fee") ?? r.fee, dueDate: s("due_date") ?? day(r.dueDate), scope: s("scope") ?? r.scope, deliverables: s("deliverables") ?? r.deliverables, userId: ids, share: shares }))) };
    }
    case "delete_role": {
      const p = await getProject(s("project")!);
      const r = await getRole(p.id, s("role")!);
      if (!confirmed) return { needsConfirmation: true, project: p.name, role: r.title, people: r.members.map((m) => m.name), fee: r.fee, ask: `اسأل المدير: أمسح دور "${r.title}" من "${p.name}"؟` };
      await db.delete(projectRoles).where(eq(projectRoles.id, r.id));
      await audit(u.id, "role_delete", `${p.name} ${r.title} (assistant)`);
      revalidatePath(`/projects/${p.id}`);
      return { project: p.name, deletedRole: r.title };
    }
    case "role_progress": {
      const p = await getProject(s("project")!);
      const r = await getRole(p.id, s("role")!);
      const set: Partial<typeof projectRoles.$inferInsert> = {};
      if (n("progress") !== undefined) set.progress = Math.max(0, Math.min(100, Math.round(n("progress")!)));
      if (a.delivered === true) { set.deliveredAt = s("delivered_date") ? new Date(s("delivered_date")!) : new Date(); set.progress = 100; }
      if (a.delivered === false) set.deliveredAt = null;
      if (!Object.keys(set).length) throw new Error("قولي النسبة أو إنه اتسلّم.");
      await db.update(projectRoles).set(set).where(eq(projectRoles.id, r.id));
      revalidatePath(`/projects/${p.id}`);
      return { project: p.name, role: r.title, progress: set.progress ?? r.progress, delivered: set.deliveredAt === undefined ? !!r.deliveredAt : !!set.deliveredAt };
    }
    case "add_deduction": {
      const p = await getProject(s("project")!);
      const person = await getPerson(s("person")!);
      const roles = (await rolesOf(p.id)).filter((r) => r.members.some((m) => m.userId === person.id));
      if (!roles.length) throw new Error(`${person.name} مش في أي دور في "${p.name}".`);
      const role = roles.length === 1 ? roles[0] : pick(roles, s("role") || "", "دور", (x) => x.title);
      return { project: p.name, person: person.name, role: role.title, result: done(await addDeduction({}, fd({ projectId: p.id, roleId: role.id, userId: person.id, type: s("type"), pct: n("pct"), reason: s("reason") }))) };
    }
    case "decide_deduction": {
      const p = await getProject(s("project")!);
      const person = await getPerson(s("person")!);
      const roleIds = (await rolesOf(p.id)).map((r) => r.id);
      const pend = roleIds.length ? await db.select().from(deductions).where(and(inArray(deductions.roleId, roleIds), eq(deductions.userId, person.id), eq(deductions.status, "PENDING"))) : [];
      if (!pend.length) throw new Error(`مفيش خصم مستني قرار على ${person.name} في "${p.name}".`);
      if (pend.length > 1) throw new Error(`فيه ${pend.length} خصومات مستنية: ${pend.map((d) => `${DED[d.type as keyof typeof DED]} (${d.reason})`).join("، ")}. اعتمدهم من صفحة المشروع أو حدد السبب.`);
      await decideDeduction(fd({ id: pend[0].id, status: s("decision") }));
      return { person: person.name, project: p.name, deduction: `${DED[pend[0].type as keyof typeof DED]} ${pend[0].pct}%`, decision: s("decision") === "APPROVED" ? "اتعتمد" : "اترفض" };
    }
    case "remove_record": {
      const kind = s("kind")!, amt = n("amount"), nm = s("name") ? norm(s("name")!) : "";
      const match = <T,>(rows: T[], amount: (x: T) => number | null | undefined, label: (x: T) => string | null | undefined, what: string): T => {
        let f = rows;
        if (amt !== undefined) f = f.filter((x) => Math.abs(Number(amount(x) ?? NaN) - amt) < 0.01);
        if (nm) f = f.filter((x) => norm(label(x) || "").includes(nm));
        if (f.length === 1) return f[0];
        const list = rows.slice(0, 12).map((x) => `${label(x) || "—"}${amount(x) != null ? ` (${amount(x)})` : ""}`).join("، ");
        throw new Error(f.length ? `فيه أكتر من ${what} بنفس الوصف: ${list}. حدد بالمبلغ أو الاسم.` : `مش لاقي ${what} بالوصف ده. الموجود: ${list || "لا شيء"}`);
      };
      const proj = s("project") ? await getProject(s("project")!) : undefined;
      const need = () => { if (!proj) throw new Error("قولي اسم المشروع."); return proj; };
      let removed = "";
      if (kind === "payment") { const p = need(); const x = match(await db.select().from(projectPayments).where(eq(projectPayments.projectId, p.id)), (r) => r.amount, (r) => r.note || day(r.paidAt), "دفعة"); await db.delete(projectPayments).where(eq(projectPayments.id, x.id)); removed = `دفعة ${x.amount} ${p.currency} من "${p.name}"`; }
      else if (kind === "cost") { const p = need(); const x = match(await db.select().from(projectCosts).where(eq(projectCosts.projectId, p.id)), (r) => r.amountEgp, (r) => r.name, "تكلفة"); await db.delete(projectCosts).where(eq(projectCosts.id, x.id)); removed = `تكلفة ${x.name} ${x.amountEgp} ج`; }
      else if (kind === "payout") {
        const person = s("person") ? await getPerson(s("person")!) : undefined;
        let rows = await db.select().from(payouts);
        if (person) rows = rows.filter((r) => r.userId === person.id);
        if (proj) rows = rows.filter((r) => r.projectId === proj.id);
        const x = match(rows, (r) => r.amountEgp, (r) => r.note || day(r.paidAt), "صرف"); await db.delete(payouts).where(eq(payouts.id, x.id)); removed = `صرف ${x.amountEgp} ج`;
      }
      else if (kind === "expense") { const x = match(await db.select().from(expenses), (r) => r.amountEgp, (r) => r.name, "مصروف"); await db.delete(expenses).where(eq(expenses.id, x.id)); removed = `مصروف ${x.name} ${x.amountEgp} ج`; }
      else if (kind === "installment") { if (!s("client")) throw new Error("قولي اسم العميل."); const c = await getClient(s("client")!); const x = match(await db.select().from(installments).where(eq(installments.clientId, c.id)), (r) => r.amount, (r) => r.label, "دفعة في الاتفاق"); await db.delete(installments).where(eq(installments.id, x.id)); removed = `دفعة "${x.label}" من اتفاق ${c.name}`; }
      else if (kind === "asset") { const p = need(); const x = match(await db.select().from(projectAssets).where(eq(projectAssets.projectId, p.id)), (r) => r.cost, (r) => r.name, "أصل"); await db.delete(projectAssets).where(eq(projectAssets.id, x.id)); removed = `${x.name}`; }
      else if (kind === "credential") { const p = need(); const x = match(await db.select().from(credentials).where(eq(credentials.projectId, p.id)), () => null, (r) => r.label, "بيانات دخول"); await db.delete(credentials).where(eq(credentials.id, x.id)); removed = `بيانات دخول ${x.label}`; }
      else if (kind === "file") { const p = need(); const x = match(await db.select().from(projectFiles).where(eq(projectFiles.projectId, p.id)), () => null, (r) => r.originalName, "ملف"); await db.delete(projectFiles).where(eq(projectFiles.id, x.id)); await removeStored(x.storedName).catch(() => {}); removed = `ملف ${x.originalName}`; }
      else if (kind === "supplier") { const x = match(await db.select().from(suppliers), (r) => r.price, (r) => `${r.provider} ${r.item}`, "مورد"); await db.delete(suppliers).where(eq(suppliers.id, x.id)); removed = `${x.provider} · ${x.item}`; }
      else if (kind === "task") { let rows = await db.select().from(tasks); if (proj) rows = rows.filter((r) => r.projectId === proj.id); const x = match(rows, () => null, (r) => r.title, "مهمة"); await db.delete(tasks).where(eq(tasks.id, x.id)); removed = `مهمة ${x.title}`; }
      else if (kind === "idea") { const x = match(await db.select().from(ideas), () => null, (r) => r.title, "فكرة"); await db.delete(ideas).where(eq(ideas.id, x.id)); removed = `فكرة ${x.title}`; }
      else throw new Error("نوع غير معروف.");
      await audit(u.id, "record_delete", `${kind}: ${removed} (assistant)`);
      for (const pth of ["/projects", "/finance", "/clients", "/suppliers", "/tasks", "/ideas", "/"]) revalidatePath(pth);
      if (proj) revalidatePath(`/projects/${proj.id}`);
      return { removed };
    }
    case "list_team":
      return (await db.select().from(users).orderBy(asc(users.name))).map((x) => ({ name: x.name, username: x.username, specialty: x.jobTitle, permission: x.role, active: x.active, lastLogin: day(x.lastLoginAt) }));
    case "employee_account": {
      const person = await getPerson(s("person")!);
      if (person.id === u.id) throw new Error("مينفعش تعمل كده على حسابك إنت من هنا.");
      const act = s("action");
      if (act === "deactivate" || act === "activate") {
        await db.update(users).set({ active: act === "activate", sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, person.id));
        await audit(u.id, act === "activate" ? "user_activate" : "user_deactivate", person.id); revalidatePath("/team");
        return { person: person.name, active: act === "activate" };
      }
      if (act === "reset_password") {
        const password = randomBytes(9).toString("base64url");
        done(await resetPassword({}, fd({ id: person.id, password })));
        return { person: person.name, username: person.username, newPassword: password, note: "الباسورد ده بيظهر مرة واحدة، وهو اتعمله خروج من كل الأجهزة." };
      }
      if (act === "set_role") {
        const set: Partial<typeof users.$inferInsert> = {};
        if (s("role") === "MEMBER" || s("role") === "TEAM_LEAD") set.role = s("role") as "MEMBER";
        if (s("job_title")) set.jobTitle = s("job_title");
        if (!Object.keys(set).length) throw new Error("قولي الصلاحية أو التخصص الجديد.");
        await db.update(users).set({ ...set, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, person.id)); revalidatePath("/team");
        return { person: person.name, changed: set };
      }
      if (act === "delete") {
        if (!confirmed) return { needsConfirmation: true, person: person.name, ask: `اسأل المدير: أمسح حساب ${person.name} نهائي؟ لو ليه شغل أو فلوس متسجلة الأحسن توقفه بدل ما تمسحه.` };
        try { await db.delete(users).where(eq(users.id, person.id)); }
        catch { throw new Error(`مش هينفع يتمسح لأن ليه شغل وفلوس متسجلة في مشاريع. أوقفت الحساب بدل كده؟ قولي "وقّف ${person.name}".`); }
        await audit(u.id, "user_delete", person.id); revalidatePath("/team");
        return { deleted: person.name };
      }
      throw new Error("أمر غير معروف.");
    }
    case "update_setting": {
      const key = s("key")!, v = s("value")!;
      if (!SETTING_KEYS.includes(key)) throw new Error("إعداد غير معروف.");
      if (!/^ai/.test(key)) { const x = Number(v); if (!Number.isFinite(x) || x < 0 || (/Pct/.test(key) && x > 100)) throw new Error("القيمة غير صحيحة."); }
      const before = (await getSettings())[key as keyof typeof DEFAULTS];
      await setSetting(key, v);
      await audit(u.id, "setting_update", `${key}: ${before} → ${v} (assistant)`);
      revalidatePath("/settings");
      return { setting: key, from: before, to: v, note: /Pct/.test(key) && ["teamCapPct", "fundPct", "ownerPct"].includes(key) ? "النسبة الجديدة بتتطبق على المشاريع الجديدة بس." : undefined };
    }
    case "show_settings": {
      const st = await getSettings();
      return st;
    }
    case "cashflow": {
      const { cashflow } = await import("./cashflow");
      const months = Math.max(1, Math.min(24, n("months") ?? 6));
      const r = await cashflow(months);
      return r;
    }
    case "update_supplier": {
      const x = pick(await db.select().from(suppliers), s("supplier")!, "مورد", (r) => `${r.provider} ${r.item}`);
      return { supplier: `${x.provider} · ${x.item}`, result: done(await saveSupplier({}, fd({ id: x.id, category: x.category, provider: x.provider, item: x.item, price: n("price") ?? x.price, currency: s("currency") ?? x.currency, billing: s("billing") ?? x.billing, details: s("details") ?? x.details }))) };
    }
    case "list_tasks": {
      let rows = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
      const ps = await db.select({ id: projects.id, name: projects.name }).from(projects);
      const us = await db.select({ id: users.id, name: users.name }).from(users);
      if (s("project")) { const p = pick(ps, s("project")!, "مشروع", (x) => x.name); rows = rows.filter((t) => t.projectId === p.id); }
      if (s("person")) { const pp = pick(us, s("person")!, "موظف", (x) => x.name); rows = rows.filter((t) => t.assigneeId === pp.id); }
      if (a.open_only !== false) rows = rows.filter((t) => t.status !== "DONE");
      return rows.slice(0, 60).map((t) => ({ title: t.title, project: ps.find((p) => p.id === t.projectId)?.name, person: us.find((x) => x.id === t.assigneeId)?.name, status: t.status, due: day(t.dueDate) }));
    }
  }
  return { error: "أداة غير معروفة." };
}
