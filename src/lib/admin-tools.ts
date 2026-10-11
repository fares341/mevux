import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db, ideas, deductions, users, clients, clientEvents, projects, installments, suppliers, bans, projectPayments, projectRoles, roleMembers, projectFiles, clientFiles, expenses, payouts, projectAssets } from "./db";
import type { Pending } from "./assistant-tools";
import type { SessionUser } from "./auth";
import type { ToolDef } from "./ai";
import { getSettings } from "./settings";
import { STAGES, stageLabel } from "./labels";
import { STATUS, DED, earnings } from "./projects";
import { IDEA_AREA, IDEA_STATUS, IDEA_PRIORITY } from "./labels";
import { audit } from "./audit";
import { isNull } from "drizzle-orm";
import { addPayment, addCost, saveRole } from "@/app/(app)/projects/actions";
import { saveCredential } from "@/app/(app)/projects/files-actions";
import { generateBrief } from "@/app/(app)/projects/brief-actions";
import { logStage, addInstallment, togglePaid } from "@/app/(app)/clients/actions";
import { saveSupplier } from "@/app/(app)/suppliers/actions";
import { addPayout } from "@/app/(app)/finance/actions";
import { createMember } from "@/app/(app)/team/actions";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";

// Admin-only actions for the assistant. Each one reuses the same server actions the pages use,
// so validation and permission checks (requireAdmin) are identical.

const S = (d: string) => ({ type: "string", description: d });
const N = (d: string) => ({ type: "number", description: d });
const E = (values: string[], d: string) => ({ type: "string", enum: values, description: d });
const fn = (name: string, description: string, properties: Record<string, object>, required: string[] = []): ToolDef =>
  ({ type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } });
const CUR = E(["EGP", "SAR", "USD"], "currency");
const STAGE_KEYS = Object.keys(STAGES);

export const ADMIN_TOOLS: ToolDef[] = [
  fn("system_guide", "Explain how the system is organised and what to do first. Use when the owner asks how to use the system or seems lost.", {}),
  fn("list_clients", "All clients with stage, next step and their projects.", {}),
  fn("list_projects_admin", "All projects with status, price, contract type and client.", {}),
  fn("create_client", "Add a new client with all their details.", { name: S("client name"), company: S("company / business"), phone: S("phone"), email: S("email"), website: S("website / domain, leave empty if none"), socials: S("social links or handles, one per line"), source: S("how they reached us"), notes: S("any other notes"), country: S("country"), need: S("what they need"), stage: E(STAGE_KEYS, "deal stage, default NEW"), next_step: S("next step"), next_date: S("YYYY-MM-DD") }, ["name"]),
  fn("update_client", "Edit a client's details (phone, email, website, socials, notes...). Only send fields to change.", { client: S("client name"), new_name: S("rename"), company: S("company"), phone: S("phone"), email: S("email"), website: S("website / domain, leave empty if none"), socials: S("social links or handles, one per line"), source: S("how they reached us"), notes: S("any other notes"), country: S("country"), need: S("what they need") }, ["client"]),
  fn("team_earnings", "Money of team members across projects: for each project their fee, deductions (lateness, rework...) with reasons, net, whether they are entitled yet (project closed and client paid), how much they received and what is still owed. Admin only.", { people: { type: "array", items: { type: "string" }, description: "names; omit for everyone" }, project: S("limit to one project, optional") }),
  fn("add_idea", "Save an idea for the company or the system on the ideas board.", { title: S("the idea in one line"), details: S("details"), area: E(Object.keys(IDEA_AREA), "SYSTEM, COMPANY, CLIENTS, MARKETING, OTHER"), priority: E(Object.keys(IDEA_PRIORITY), "HIGH, MID, LOW") }, ["title"]),
  fn("list_ideas", "List saved ideas.", { status: E(["OPEN", ...Object.keys(IDEA_STATUS)], "OPEN = new/planned/doing (default)") }),
  fn("set_idea_status", "Change an idea's status.", { idea: S("idea title"), status: E(Object.keys(IDEA_STATUS), "new status") }, ["idea", "status"]),
  fn("update_client_stage", "Move a client to a stage and/or write a custom status, log what happened, set the next step.", { client: S("client name"), stage: E(STAGE_KEYS, "fixed stage"), custom_status: S("owner's own status wording, optional"), note: S("what happened"), next_step: S("next step"), next_date: S("YYYY-MM-DD") }, ["client"]),
  fn("create_project", "Create a project, optionally for an existing client.", { name: S("project name"), client: S("client name (existing client or free text)"), price: N("implementation / setup price"), currency: CUR, billing: E(["ONE_TIME", "SUBSCRIPTION"], "contract type"), monthly_fee: N("monthly subscription if SUBSCRIPTION"), free_messages: N("free WhatsApp messages per month, default 1000"), status: E(["MEETING", "BRIEF", "APPROVED", "IN_PROGRESS", "DELIVERED", "CLOSED"], "stage"), start_date: S("YYYY-MM-DD"), due_date: S("YYYY-MM-DD"), size: E(["SMALL", "MEDIUM", "LARGE"], "size"), description: S("description") }, ["name", "client", "price", "currency"]),
  fn("set_project_status", "Change a project's stage (e.g. CLOSED when the client accepted and paid).", { project: S("project name"), status: E(Object.keys(STATUS), "new status") }, ["project", "status"]),
  fn("add_role", "Add a role to a project with its fee and people. If two people share it give their shares.", { project: S("project name"), title: S("role title"), fee: N("role fee in EGP"), people: { type: "array", items: { type: "string" }, description: "names of the people in the role" }, shares: { type: "array", items: { type: "number" }, description: "percent for each person, same order, sum 100; omit for equal split" }, due_date: S("YYYY-MM-DD"), scope: S("what is required"), deliverables: S("deliverables") }, ["project", "title", "fee", "people"]),
  fn("record_payment", "Record a client payment on a project (in the project currency).", { project: S("project name"), amount: N("amount"), note: S("note") }, ["project", "amount"]),
  fn("add_project_cost", "Add a direct cost to a project (EGP).", { project: S("project name"), name: S("cost name"), amount_egp: N("amount in EGP") }, ["project", "name", "amount_egp"]),
  fn("add_installment", "Add a payment to a client's payment agreement.", { client: S("client name"), label: S("e.g. عربون"), amount: N("amount"), currency: CUR, due_note: S("when it is due"), project: S("project name, optional") }, ["client", "label", "amount", "currency"]),
  fn("mark_installment_paid", "Tick (or untick) an agreement payment as paid.", { client: S("client name"), label: S("payment label") }, ["client", "label"]),
  fn("add_supplier", "Add a supplier / service price.", { category: E(["VPS", "API", "WHATSAPP", "OTHER"], "category"), provider: S("provider"), item: S("service"), price: N("price"), currency: CUR, billing: E(["MONTHLY", "YEARLY", "PER_MESSAGE", "PER_USAGE", "ONE_TIME"], "billing"), details: S("details") }, ["category", "provider", "item", "price", "currency", "billing"]),
  fn("add_credential", "Save login details for a project (shown to the project team).", { project: S("project name"), label: S("what it is"), url: S("url / IP"), username: S("username"), secret: S("password / key"), notes: S("notes") }, ["project", "label"]),
  fn("create_employee", "Create an employee account. Returns a one-time password to give them.", { name: S("full name"), username: S("login username, lowercase english"), job_title: S("specialty"), role: E(["MEMBER", "TEAM_LEAD"], "permission") }, ["name", "username"]),
  fn("record_payout", "Record money paid to a team member (EGP).", { person: S("name"), amount: N("EGP"), project: S("project, optional"), note: S("note") }, ["person", "amount"]),
  fn("import_old_project", "Add a past or ongoing project with its client in one go (for old work). Creates/links the client, the project with real dates and status, the amount the client paid, the people who worked on it, and attaches any files sent in this message.", {
    client: S("client name"), client_company: S("company / business"), client_phone: S("phone"), client_country: S("country"), client_email: S("email"), client_website: S("client's website, if any"), client_socials: S("social links, one per line"), client_notes: S("notes about the client"),
    project: S("project name"), description: S("what was built"), price: N("project price"), currency: CUR,
    billing: E(["ONE_TIME", "SUBSCRIPTION"], "contract type"), monthly_fee: N("monthly subscription if any"),
    status: E(["IN_PROGRESS", "DELIVERED", "CLOSED", "CANCELLED"], "CLOSED = finished and paid"),
    start_date: S("YYYY-MM-DD"), end_date: S("YYYY-MM-DD (delivery / close date)"),
    paid_amount: N("total the client paid, in the project currency"),
    team: { type: "array", description: "who worked on it", items: { type: "object", properties: { person: S("name"), role: S("role title"), fee: N("fee paid to them in EGP") }, required: ["person", "role"], additionalProperties: false } },
    files_kind: E(["FINAL", "CLIENT_BRIEF", "CLIENT_CONTRACT", "CLIENT_OTHER"], "where to store attached files: project final files, or the client's file"),
    team_already_paid: { type: "boolean", description: "true if the team was already paid for this old project (records payouts); false if they are still owed. Ask the owner if unknown." },
  }, ["client", "project", "price", "currency", "status"]),
  fn("attach_files", "Store the files sent in this message on a project (final files) or in a client's file.", { target: E(["project", "client"], "where"), name: S("project or client name"), kind: E(["FINAL", "BRIEF", "CONTRACT", "OTHER"], "file type") }, ["target", "name"]),
  fn("record_expense", "Record a company expense (EGP) such as ads, tools, salaries.", { name: S("what"), amount_egp: N("EGP"), category: E(["ADS", "TOOLS", "SALARIES", "OTHER"], "category"), date: S("YYYY-MM-DD, default today"), note: S("note") }, ["name", "amount_egp"]),
  fn("update_project", "Edit any project (also finished ones): link it to a client, change contract, subscription fee, next payment date and reminder, work types, dates, price, status or description. Only send fields to change.", {
    project: S("project name"), client: S("link to this existing client"), billing: E(["ONE_TIME", "SUBSCRIPTION"], "contract type"), monthly_fee: N("monthly subscription"),
    next_due_date: S("next subscription payment date YYYY-MM-DD"), reminder_days: N("days before the due date to alert"),
    kinds: { type: "array", items: { type: "string", enum: ["AUTOMATION", "CHATBOT", "WEBSITE", "APP", "SAAS", "DASHBOARD"] }, description: "work types" },
    price: N("price"), start_date: S("YYYY-MM-DD"), due_date: S("YYYY-MM-DD"), status: E(Object.keys(STATUS), "status"), description: S("description"),
  }, ["project"]),
  fn("add_project_asset", "Add a website, app, SaaS, server or domain to a project with its details and cost. Shows in the project, the client's file and the brief.", {
    project: S("project name"), kind: E(["WEBSITE", "APP", "SAAS", "SERVER", "DOMAIN", "OTHER"], "type"), name: S("name"), url: S("url / domain"), provider: S("provider / tech"), details: S("details: pages, features, specs"),
    cost: N("cost"), currency: CUR, billing: E(["MONTHLY", "YEARLY", "ONE_TIME"], "billing"), paid_by: E(["CLIENT", "US", "INCLUDED"], "who pays"), renews_at: S("renewal date YYYY-MM-DD"), in_brief: { type: "boolean", description: "show in the brief (default true)" },
  }, ["project", "kind", "name"]),
  fn("subscriptions_due", "Subscriptions whose payment is due soon or overdue.", {}),
  fn("generate_brief", "Generate a client brief PDF for a project. Takes about a minute.", { project: S("project name"), lang: E(["ar", "en"], "language"), context: S("everything known about the client and the need") }, ["project"]),
];

const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
function pick<T extends { name: string }>(list: T[], q: string, what: string): T {
  const n = norm(q || "");
  const exact = list.filter((x) => norm(x.name) === n);
  const found = exact.length ? exact : list.filter((x) => norm(x.name).includes(n) || n.includes(norm(x.name)));
  if (found.length === 1) return found[0];
  if (!found.length) throw new Error(`مش لاقي ${what} باسم "${q}". الموجود: ${list.map((x) => x.name).slice(0, 15).join("، ") || "لا شيء"}`);
  throw new Error(`فيه أكتر من ${what}: ${found.map((x) => x.name).join("، ")}. حدد أكتر.`);
}
const fd = (o: Record<string, unknown>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) { if (v === undefined || v === null || v === "") continue; if (Array.isArray(v)) v.forEach((x) => f.append(k, String(x))); else f.append(k, String(v)); } return f; };
const done = (r: { ok?: string; error?: string }) => { if (r.error) throw new Error(r.error); return r.ok ?? "تم"; };
const allClients = () => db.select().from(clients).orderBy(asc(clients.name));
const allProjects = () => db.select().from(projects).orderBy(desc(projects.createdAt));
const team = () => db.select({ id: users.id, name: users.name, active: users.active }).from(users);

async function storeFiles(files: Pending[], u: SessionUser, where: { projectId?: string; clientId?: string; kind: string }) {
  const todo = files.filter((f) => !f.used);
  for (const f of todo) {
    if (where.projectId) await db.insert(projectFiles).values({ projectId: where.projectId, kind: "FINAL", uploadedBy: u.id, originalName: f.name, storedName: f.stored, size: f.size, mime: f.mime, note: "من المساعد" });
    else if (where.clientId) await db.insert(clientFiles).values({ clientId: where.clientId, kind: where.kind, uploadedBy: u.id, originalName: f.name, storedName: f.stored, size: f.size, mime: f.mime, note: "من المساعد" });
    f.used = true;
  }
  return todo.map((f) => f.name);
}

export async function runAdminTool(name: string, a: Record<string, unknown>, u: SessionUser, files: Pending[] = []): Promise<unknown> {
  if (u.role !== "ADMIN") return { error: "غير مسموح." };
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : undefined);
  const n = (k: string) => (typeof a[k] === "number" ? (a[k] as number) : a[k] !== undefined && a[k] !== "" ? Number(a[k]) : undefined);
  await audit(u.id, "assistant_action", name);

  switch (name) {
    case "system_guide": {
      const [c, p, sp, st] = await Promise.all([allClients(), allProjects(), db.select().from(suppliers), getSettings()]);
      const key = !!(await db.query.settings.findFirst({ where: (t, { eq }) => eq(t.key, "openrouterKey") }));
      return {
        sections: {
          "العملاء": "كل عميل ومرحلته في الاتفاق، السجل، ملف العميل (بريف/عقد)، واتفاق الدفعات.",
          "المشاريع": "جديد/شغال/خلصناه. جوه كل مشروع: الأدوار وأجورها، دفعات العميل، التكاليف، بيانات الدخول، الملفات، الخصومات.",
          "البريفات": "توليد بريف PDF من مشروع، بالكتابة أو بالفويس، وتعديله بالكلام.",
          "محادثات المشاريع": "جروب لكل مشروع فيه فريقه.",
          "المهام / المتابعة اليومية / الشكاوى": "توزيع الشغل ومتابعة مين متأخر.",
          "المالية": "دخلك، خزنة الشركة، صندوق الاشتراكات، مستحقات الفريق والصرف.",
          "الإعدادات / الموردون / الموظفون": "النسب والخصومات، أسعار الخدمات، حسابات الفريق.",
        },
        status: { openrouterKey: key, clients: c.length, projects: p.length, suppliers: sp.length, teamCapPct: st.teamCapPct },
        suggestedFirstSteps: [!key && "حط مفتاح OpenRouter من الإعدادات", !sp.length && "سجّل أسعار الموردين", !c.length && "ضيف أول عميل (قولي: ضيف عميل اسمه …)", c.length && !p.length && "اعمل مشروع للعميل", p.length && "ضيف أدوار الفريق للمشروع واعمل البريف"].filter(Boolean),
      };
    }
    case "list_clients": {
      const [c, p] = await Promise.all([allClients(), allProjects()]);
      return c.map((x) => ({ client: x.name, company: x.company, stage: stageLabel(x), nextStep: x.nextStep, nextDate: x.nextDate?.toISOString().slice(0, 10), projects: p.filter((y) => y.clientId === x.id).map((y) => y.name) }));
    }
    case "list_projects_admin": {
      return (await allProjects()).map((p) => ({ project: p.name, client: p.client, status: STATUS[p.status], price: p.price, currency: p.currency, contract: p.billing === "SUBSCRIPTION" ? `اشتراك ${p.monthlyFee}/شهر` : "تنفيذ + خدمات منفصلة", due: p.dueDate?.toISOString().slice(0, 10) }));
    }
    case "create_client": {
      const stage = (s("stage") && STAGE_KEYS.includes(s("stage")!) ? s("stage") : "NEW") as keyof typeof STAGES;
      const [c] = await db.insert(clients).values({ name: s("name")!, company: s("company"), phone: s("phone"), email: s("email"), website: s("website"), socials: s("socials"), source: s("source"), notes: s("notes"), country: s("country"), need: s("need"), stage, nextStep: s("next_step"), nextDate: s("next_date") ? new Date(s("next_date")!) : null }).returning();
      await db.insert(clientEvents).values({ clientId: c.id, stage, note: "اتضاف من المساعد", by: u.id });
      revalidatePath("/clients");
      return { created: c.name, stage: STAGES[stage], saved: { phone: c.phone, email: c.email, website: c.website, socials: c.socials, company: c.company }, link: `/clients/${c.id}` };
    }
    case "update_client": {
      const c = pick(await allClients(), s("client")!, "عميل");
      const set: Partial<typeof clients.$inferInsert> = {};
      for (const k of ["company", "phone", "email", "website", "socials", "source", "notes", "country", "need"] as const) if (s(k) !== undefined) set[k] = s(k) || null;
      if (s("new_name")) set.name = s("new_name");
      if (!Object.keys(set).length) throw new Error("مفيش حاجة اتطلب تتغير.");
      await db.update(clients).set({ ...set, updatedAt: new Date() }).where(eq(clients.id, c.id));
      if (set.name) await db.update(projects).set({ client: set.name }).where(eq(projects.clientId, c.id));
      revalidatePath(`/clients/${c.id}`); revalidatePath("/clients");
      return { client: set.name ?? c.name, changed: Object.keys(set), link: `/clients/${c.id}` };
    }
    case "team_earnings": {
      const people = await team();
      const want = Array.isArray(a.people) && (a.people as string[]).length ? (a.people as string[]).map((x) => pick(people, x, "موظف").id) : null;
      const onlyProject = s("project") ? pick(await allProjects(), s("project")!, "مشروع").id : null;
      const [{ projectsCalc }, pays, deds] = await Promise.all([earnings(), db.select().from(payouts), db.select().from(deductions)]);
      const name = (id: string) => people.find((p) => p.id === id)?.name ?? "؟";
      const r0 = (x: number) => Math.round(x);
      const byPerson = new Map<string, { person: string; projects: unknown[]; totals: { net: number; entitled: number; received: number; owedNow: number; notYetDue: number; deducted: number } }>();
      for (const { p, c } of projectsCalc) {
        if (p.status === "CANCELLED" || (onlyProject && p.id !== onlyProject)) continue;
        for (const l of c.lines) {
          if (want && !want.includes(l.userId)) continue;
          const e = byPerson.get(l.userId) ?? { person: name(l.userId), projects: [], totals: { net: 0, entitled: 0, received: 0, owedNow: 0, notYetDue: 0, deducted: 0 } };
          const received = pays.filter((x) => x.userId === l.userId && x.projectId === p.id).reduce((a2, x) => a2 + x.amountEgp, 0);
          const closed = p.status === "CLOSED";
          const owed = closed ? Math.max(0, l.net - received) : 0;
          const reasons = [
            ...(l.latePct ? [`تأخير ${l.days} يوم = ${l.latePct}%`] : []),
            ...deds.filter((d) => d.roleId === l.roleId && d.userId === l.userId && d.status === "APPROVED").map((d) => `${DED[d.type as keyof typeof DED] ?? d.type} ${d.pct}%: ${d.reason}`),
          ];
          const pending = deds.filter((d) => d.roleId === l.roleId && d.userId === l.userId && d.status === "PENDING").map((d) => `${DED[d.type as keyof typeof DED] ?? d.type} ${d.pct}% (لسه ما اتقررش)`);
          e.projects.push({
            project: p.name, client: p.client, projectStatus: STATUS[p.status], role: l.title,
            fee: r0(l.base), deductedPct: l.totalPct, deducted: r0(l.deducted), deductionReasons: reasons.length ? reasons : "مفيش خصم", pendingDeductions: pending.length ? pending : undefined,
            net: r0(l.net), received: r0(received),
            status: !closed ? "لسه مش مستحق: بيتصرف بعد ما العميل يوافق ويدفع ويتقفل المشروع" : received >= l.net - 0.5 ? "استلم كامل" : received > 0 ? `استلم جزء، باقي ${r0(owed)} ج` : `مستحق ولسه ما استلمش ${r0(owed)} ج`,
          });
          e.totals.net += l.net; e.totals.deducted += l.deducted; e.totals.received += received;
          if (closed) { e.totals.entitled += l.net; e.totals.owedNow += owed; } else e.totals.notYetDue += l.net;
          byPerson.set(l.userId, e);
        }
      }
      for (const id of want ?? []) if (!byPerson.has(id)) byPerson.set(id, { person: name(id), projects: [], totals: { net: 0, entitled: 0, received: 0, owedNow: 0, notYetDue: 0, deducted: 0 } });
      return [...byPerson.entries()].map(([id, e]) => {
        const general = onlyProject ? 0 : pays.filter((x) => x.userId === id && !x.projectId).reduce((a2, x) => a2 + x.amountEgp, 0);
        return { ...e, currency: "EGP", totals: Object.fromEntries(Object.entries(e.totals).map(([k, v]) => [k, r0(v)])), paidWithoutProject: general ? r0(general) : undefined };
      });
    }
    case "add_idea": {
      const area = s("area") && s("area")! in IDEA_AREA ? s("area")! : "COMPANY";
      const priority = s("priority") && s("priority")! in IDEA_PRIORITY ? s("priority")! : "MID";
      const [i] = await db.insert(ideas).values({ title: s("title")!.slice(0, 200), details: s("details")?.slice(0, 5000), area, priority, createdBy: u.id }).returning();
      revalidatePath("/ideas");
      return { saved: i.title, area: IDEA_AREA[area as keyof typeof IDEA_AREA], link: "/ideas" };
    }
    case "list_ideas": {
      const st = s("status") || "OPEN";
      const all = await db.select().from(ideas).orderBy(desc(ideas.createdAt));
      return all.filter((i) => st === "OPEN" ? ["NEW", "PLANNED", "DOING"].includes(i.status) : i.status === st).map((i) => ({ idea: i.title, details: i.details, area: IDEA_AREA[i.area as keyof typeof IDEA_AREA], status: IDEA_STATUS[i.status as keyof typeof IDEA_STATUS], priority: IDEA_PRIORITY[i.priority as keyof typeof IDEA_PRIORITY], date: i.createdAt.toISOString().slice(0, 10) }));
    }
    case "set_idea_status": {
      const i = pick((await db.select().from(ideas)).map((x) => ({ ...x, name: x.title })), s("idea")!, "فكرة");
      if (!(s("status")! in IDEA_STATUS)) throw new Error("حالة غير معروفة.");
      await db.update(ideas).set({ status: s("status")!, updatedAt: new Date() }).where(eq(ideas.id, i.id));
      revalidatePath("/ideas");
      return { idea: i.title, status: IDEA_STATUS[s("status") as keyof typeof IDEA_STATUS] };
    }
    case "update_client_stage": {
      const c = pick(await allClients(), s("client")!, "عميل");
      const r = await logStage({}, fd({ id: c.id, stage: s("stage") || c.stage, customStage: s("custom_status") ?? c.customStage ?? "", note: s("note"), nextStep: s("next_step") ?? c.nextStep ?? "", nextDate: s("next_date") ?? (c.nextDate ? c.nextDate.toISOString().slice(0, 10) : "") }));
      return { client: c.name, result: done(r) };
    }
    case "create_project": {
      const cl = (await allClients()).find((x) => norm(x.name) === norm(s("client")!) || norm(x.name).includes(norm(s("client")!)));
      const st = await getSettings();
      const cur = s("currency") || "EGP";
      const rate = cur === "SAR" ? Number(st.rateSAR) : cur === "USD" ? Number(st.rateUSD) : 1;
      const billing = s("billing") === "SUBSCRIPTION" ? "SUBSCRIPTION" : "ONE_TIME";
      if (billing === "SUBSCRIPTION" && !n("monthly_fee")) throw new Error("محتاج قيمة الاشتراك الشهري.");
      const [p] = await db.insert(projects).values({
        name: s("name")!, client: cl?.name ?? s("client")!, clientId: cl?.id ?? null, currency: cur, rate, price: n("price") ?? 0,
        size: (s("size") as "SMALL" | "MEDIUM" | "LARGE") || "MEDIUM", status: (s("status") as "MEETING") || "MEETING",
        billing, monthlyFee: n("monthly_fee") ?? null, freeMessages: n("free_messages") ?? 1000,
        fundPct: Number(st.fundPct), ownerPct: Number(st.ownerPct), teamCapPct: Number(st.teamCapPct),
        startDate: s("start_date") ? new Date(s("start_date")!) : null, dueDate: s("due_date") ? new Date(s("due_date")!) : null, description: s("description"),
      }).returning();
      await db.update(bans).set({ consumedByProject: p.id }).where(isNull(bans.consumedByProject));
      if (cl && !["ACTIVE", "DONE"].includes(cl.stage) && ["APPROVED", "IN_PROGRESS"].includes(p.status)) {
        await db.update(clients).set({ stage: "ACTIVE", updatedAt: new Date() }).where(eq(clients.id, cl.id));
        await db.insert(clientEvents).values({ clientId: cl.id, stage: "ACTIVE", note: `بدأ مشروع: ${p.name}`, by: u.id });
      }
      revalidatePath("/projects");
      return { created: p.name, client: p.client, linkedToClient: !!cl, link: `/projects/${p.id}` };
    }
    case "set_project_status": {
      const p = pick(await allProjects(), s("project")!, "مشروع");
      const status = s("status") as keyof typeof STATUS;
      await db.update(projects).set({ status, closedAt: status === "CLOSED" ? (p.closedAt ?? new Date()) : null }).where(eq(projects.id, p.id));
      revalidatePath(`/projects/${p.id}`); revalidatePath("/projects"); revalidatePath("/finance");
      return { project: p.name, status: STATUS[status] };
    }
    case "add_role": {
      const p = pick(await allProjects(), s("project")!, "مشروع");
      const people = (Array.isArray(a.people) ? (a.people as string[]) : [String(a.people)]).map(async (x) => pick((await team()).filter((t) => t.active), x, "موظف"));
      const ids = (await Promise.all(people)).map((x) => x.id);
      const sh = Array.isArray(a.shares) && (a.shares as number[]).length === ids.length ? (a.shares as number[]) : ids.map((_, i) => (i === ids.length - 1 ? 100 - Math.floor(100 / ids.length) * (ids.length - 1) : Math.floor(100 / ids.length)));
      return { project: p.name, result: done(await saveRole({}, fd({ projectId: p.id, title: s("title"), fee: n("fee"), dueDate: s("due_date"), scope: s("scope"), deliverables: s("deliverables"), userId: ids, share: sh }))) };
    }
    case "record_payment": {
      const p = pick(await allProjects(), s("project")!, "مشروع");
      return { project: p.name, currency: p.currency, result: done(await addPayment({}, fd({ projectId: p.id, amount: n("amount"), note: s("note") }))) };
    }
    case "add_project_cost": {
      const p = pick(await allProjects(), s("project")!, "مشروع");
      return { project: p.name, result: done(await addCost({}, fd({ projectId: p.id, name: s("name"), amount: n("amount_egp") }))) };
    }
    case "add_installment": {
      const c = pick(await allClients(), s("client")!, "عميل");
      const pr = s("project") ? pick((await allProjects()).filter((x) => x.clientId === c.id), s("project")!, "مشروع للعميل ده") : undefined;
      return { client: c.name, result: done(await addInstallment({}, fd({ clientId: c.id, label: s("label"), amount: n("amount"), currency: s("currency"), dueNote: s("due_note"), projectId: pr?.id }))) };
    }
    case "mark_installment_paid": {
      const c = pick(await allClients(), s("client")!, "عميل");
      const its = (await db.select().from(installments).where(eq(installments.clientId, c.id))).map((x) => ({ ...x, name: x.label }));
      const it = pick(its, s("label")!, "دفعة");
      await togglePaid(fd({ id: it.id }));
      return { client: c.name, payment: it.label, nowPaid: !it.paidAt };
    }
    case "add_supplier":
      return { result: done(await saveSupplier({}, fd({ category: s("category"), provider: s("provider"), item: s("item"), price: n("price"), currency: s("currency"), billing: s("billing"), details: s("details") }))) };
    case "add_credential": {
      const p = pick(await allProjects(), s("project")!, "مشروع");
      return { project: p.name, result: done(await saveCredential({}, fd({ projectId: p.id, label: s("label"), url: s("url"), username: s("username"), secret: s("secret"), notes: s("notes") }))) };
    }
    case "create_employee": {
      const password = randomBytes(9).toString("base64url");
      const r = await createMember({}, fd({ name: s("name"), username: s("username"), password, jobTitle: s("job_title"), role: s("role") || "MEMBER" }));
      done(r);
      return { created: s("name"), username: s("username"), password, note: "الباسورد ده بيظهر مرة واحدة. ابعته للموظف، وهو يقدر يغيّره من حسابه." };
    }
    case "record_payout": {
      const person = pick((await team()), s("person")!, "موظف");
      const pr = s("project") ? pick(await allProjects(), s("project")!, "مشروع") : undefined;
      return { person: person.name, result: done(await addPayout({}, fd({ userId: person.id, projectId: pr?.id, amount: n("amount"), note: s("note") }))) };
    }
    case "import_old_project": {
      const st = await getSettings();
      const cname = s("client")!;
      let cl = (await allClients()).find((x) => norm(x.name) === norm(cname));
      const status = (s("status") || "CLOSED") as "IN_PROGRESS" | "DELIVERED" | "CLOSED" | "CANCELLED";
      if (!cl) {
        [cl] = await db.insert(clients).values({ name: cname, company: s("client_company"), phone: s("client_phone"), country: s("client_country"), email: s("client_email"), website: s("client_website"), socials: s("client_socials"), notes: s("client_notes"), need: s("description"), stage: status === "IN_PROGRESS" ? "ACTIVE" : status === "CANCELLED" ? "LOST" : "DONE" }).returning();
        await db.insert(clientEvents).values({ clientId: cl.id, stage: cl.stage, note: "عميل قديم اتضاف من المساعد", by: u.id });
      }
      else {
        // Existing client: fill in only the details that are still empty, never overwrite.
        const fill: Partial<typeof clients.$inferInsert> = {};
        const add = (k: "company" | "phone" | "country" | "email" | "website" | "socials" | "notes", v?: string) => { if (v && !cl![k]) fill[k] = v; };
        add("company", s("client_company")); add("phone", s("client_phone")); add("country", s("client_country")); add("email", s("client_email")); add("website", s("client_website")); add("socials", s("client_socials")); add("notes", s("client_notes"));
        if (Object.keys(fill).length) await db.update(clients).set({ ...fill, updatedAt: new Date() }).where(eq(clients.id, cl.id));
      }
      const cur = s("currency") || "EGP";
      const rate = cur === "SAR" ? Number(st.rateSAR) : cur === "USD" ? Number(st.rateUSD) : 1;
      const start = s("start_date") ? new Date(s("start_date")!) : null, end = s("end_date") ? new Date(s("end_date")!) : null;
      if ((await allProjects()).some((x) => norm(x.name) === norm(s("project")!) && x.clientId === cl!.id)) throw new Error("المشروع ده متسجل قبل كده لنفس العميل.");
      const [p] = await db.insert(projects).values({
        name: s("project")!, client: cl.name, clientId: cl.id, currency: cur, rate, price: n("price") ?? 0, status, size: "MEDIUM",
        billing: s("billing") === "SUBSCRIPTION" ? "SUBSCRIPTION" : "ONE_TIME", monthlyFee: n("monthly_fee") ?? null,
        fundPct: Number(st.fundPct), ownerPct: Number(st.ownerPct), teamCapPct: Number(st.teamCapPct),
        startDate: start, dueDate: end, closedAt: status === "CLOSED" ? (end ?? new Date()) : null, description: s("description"), createdAt: start ?? undefined,
      }).returning();
      const paid = n("paid_amount");
      if (paid) await db.insert(projectPayments).values({ projectId: p.id, amount: paid, paidAt: end ?? start ?? new Date(), note: "مدفوع (مشروع قديم)" });
      const added: string[] = [];
      const people = await team();
      for (const t of (Array.isArray(a.team) ? (a.team as { person: string; role: string; fee?: number }[]) : [])) {
        const who = pick(people, t.person, "موظف");
        const [r] = await db.insert(projectRoles).values({ projectId: p.id, title: t.role, fee: Number(t.fee) || 0, dueDate: end, deliveredAt: status === "IN_PROGRESS" ? null : end, progress: status === "IN_PROGRESS" ? 0 : 100 }).returning();
        await db.insert(roleMembers).values({ roleId: r.id, userId: who.id, sharePct: 100 });
        if (status === "CLOSED" && a.team_already_paid !== false && Number(t.fee) > 0)
          await db.insert(payouts).values({ userId: who.id, projectId: p.id, amountEgp: Number(t.fee), paidAt: end ?? new Date(), note: "مشروع قديم (اتصرف قبل السيستم)" });
        added.push(`${who.name} (${t.role})`);
      }
      const kind = s("files_kind") || "FINAL";
      const stored = await storeFiles(files, u, kind === "FINAL" ? { projectId: p.id, kind } : { clientId: cl.id, kind: kind.replace("CLIENT_", "") });
      revalidatePath("/projects"); revalidatePath("/clients"); revalidatePath("/finance");
      return { client: cl.name, project: p.name, status: STATUS[status], paid: paid ?? 0, currency: cur, team: added, files: stored, link: `/projects/${p.id}`,
        note: added.length && status === "CLOSED" ? (a.team_already_paid === false ? "أجور الفريق متسجلة كمستحقة لسه ما اتصرفتش." : "أجور الفريق اتسجلت إنها اتصرفت.") : undefined };
    }
    case "attach_files": {
      if (!files.some((f) => !f.used)) return { error: "مفيش ملفات مرفقة في الرسالة دي." };
      if (s("target") === "project") { const p = pick(await allProjects(), s("name")!, "مشروع"); return { project: p.name, files: await storeFiles(files, u, { projectId: p.id, kind: "FINAL" }) }; }
      const c = pick(await allClients(), s("name")!, "عميل");
      return { client: c.name, files: await storeFiles(files, u, { clientId: c.id, kind: ["BRIEF", "CONTRACT"].includes(s("kind") || "") ? s("kind")! : "OTHER" }) };
    }
    case "record_expense": {
      const amount = n("amount_egp");
      if (!amount || amount <= 0) throw new Error("المبلغ غير صحيح.");
      await db.insert(expenses).values({ name: s("name")!, amountEgp: amount, category: s("category") || "OTHER", spentAt: s("date") ? new Date(s("date")!) : new Date(), note: s("note") });
      revalidatePath("/finance");
      return { recorded: s("name"), amount_egp: amount };
    }
    case "update_project": {
      const p = pick(await allProjects(), s("project")!, "مشروع");
      const set: Partial<typeof projects.$inferInsert> = {};
      if (s("client")) { const c = pick(await allClients(), s("client")!, "عميل"); set.clientId = c.id; set.client = c.name; }
      if (s("billing")) set.billing = s("billing");
      if (n("monthly_fee") !== undefined) set.monthlyFee = n("monthly_fee");
      if (s("next_due_date")) set.nextDueDate = new Date(s("next_due_date")!);
      if (n("reminder_days") !== undefined) set.reminderDays = Math.max(0, Math.min(30, n("reminder_days")!));
      if (Array.isArray(a.kinds)) set.kinds = (a.kinds as string[]).join(",") || null;
      if (n("price") !== undefined) set.price = n("price");
      if (s("start_date")) set.startDate = new Date(s("start_date")!);
      if (s("due_date")) set.dueDate = new Date(s("due_date")!);
      if (s("status")) { set.status = s("status") as typeof p.status; set.closedAt = set.status === "CLOSED" ? (p.closedAt ?? new Date()) : null; }
      if (s("description")) set.description = s("description");
      if (!Object.keys(set).length) throw new Error("مفيش حاجة اتطلب تتغير.");
      await db.update(projects).set(set).where(eq(projects.id, p.id));
      revalidatePath(`/projects/${p.id}`); revalidatePath("/projects"); revalidatePath("/finance"); revalidatePath("/clients"); revalidatePath("/");
      return { project: p.name, changed: Object.keys(set), link: `/projects/${p.id}` };
    }
    case "add_project_asset": {
      const p = pick(await allProjects(), s("project")!, "مشروع");
      await db.insert(projectAssets).values({ projectId: p.id, kind: s("kind")!, name: s("name")!, url: s("url"), provider: s("provider"), details: s("details"), cost: n("cost") ?? null, currency: s("currency") || "EGP", billing: s("billing") || "MONTHLY", paidBy: s("paid_by") || "CLIENT", renewsAt: s("renews_at") ? new Date(s("renews_at")!) : null, inBrief: a.in_brief !== false });
      revalidatePath(`/projects/${p.id}`);
      return { project: p.name, added: s("name"), link: `/projects/${p.id}` };
    }
    case "subscriptions_due": {
      const { dueSubscriptions } = await import("./subscriptions");
      return (await dueSubscriptions()).map((x) => ({ project: x.name, client: x.client, fee: x.fee, currency: x.currency, due: x.due.toISOString().slice(0, 10), status: x.overdue ? `متأخر ${-x.days} يوم` : `بعد ${x.days} يوم` }));
    }
    case "generate_brief": {
      const p = pick(await allProjects(), s("project")!, "مشروع");
      const r = await generateBrief({}, fd({ projectId: p.id, lang: s("lang") || "ar", extra: s("context") ?? p.description ?? "" }));
      if (r.error) throw new Error(r.error);
      return { project: p.name, result: r.ok, link: `/api/briefs/${r.id}` };
    }
  }
  return { error: "أداة غير معروفة." };
}
