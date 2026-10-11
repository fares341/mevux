import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db, users, clients, clientEvents, projects, installments, suppliers, bans } from "./db";
import type { SessionUser } from "./auth";
import type { ToolDef } from "./ai";
import { getSettings } from "./settings";
import { STAGES, stageLabel } from "./labels";
import { STATUS } from "./projects";
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
  fn("create_client", "Add a new client.", { name: S("client name"), company: S("company / business"), phone: S("phone"), country: S("country"), need: S("what they need"), stage: E(STAGE_KEYS, "deal stage, default NEW"), next_step: S("next step"), next_date: S("YYYY-MM-DD") }, ["name"]),
  fn("update_client_stage", "Move a client to a stage and/or write a custom status, log what happened, set the next step.", { client: S("client name"), stage: E(STAGE_KEYS, "fixed stage"), custom_status: S("owner's own status wording, optional"), note: S("what happened"), next_step: S("next step"), next_date: S("YYYY-MM-DD") }, ["client"]),
  fn("create_project", "Create a project, optionally for an existing client.", { name: S("project name"), client: S("client name (existing client or free text)"), price: N("implementation / setup price"), currency: CUR, billing: E(["ONE_TIME", "SUBSCRIPTION"], "contract type"), monthly_fee: N("monthly subscription if SUBSCRIPTION"), free_messages: N("free WhatsApp messages per month, default 1000"), status: E(["MEETING", "BRIEF", "APPROVED", "IN_PROGRESS"], "stage"), start_date: S("YYYY-MM-DD"), due_date: S("YYYY-MM-DD"), size: E(["SMALL", "MEDIUM", "LARGE"], "size"), description: S("description") }, ["name", "client", "price", "currency"]),
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

export async function runAdminTool(name: string, a: Record<string, unknown>, u: SessionUser): Promise<unknown> {
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
      const [c] = await db.insert(clients).values({ name: s("name")!, company: s("company"), phone: s("phone"), country: s("country"), need: s("need"), stage, nextStep: s("next_step"), nextDate: s("next_date") ? new Date(s("next_date")!) : null }).returning();
      await db.insert(clientEvents).values({ clientId: c.id, stage, note: "اتضاف من المساعد", by: u.id });
      revalidatePath("/clients");
      return { created: c.name, stage: STAGES[stage], link: `/clients/${c.id}` };
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
    case "generate_brief": {
      const p = pick(await allProjects(), s("project")!, "مشروع");
      const r = await generateBrief({}, fd({ projectId: p.id, lang: s("lang") || "ar", extra: s("context") ?? p.description ?? "" }));
      if (r.error) throw new Error(r.error);
      return { project: p.name, result: r.ok, link: `/api/briefs/${r.id}` };
    }
  }
  return { error: "أداة غير معروفة." };
}
