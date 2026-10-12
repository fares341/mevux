import "server-only";
import { eq, inArray, desc } from "drizzle-orm";
import { db, projects, projectPayments, projectCosts, projectRoles, roleMembers, deductions } from "./db";
import { rulesFor } from "./project-rules";
import { getSettings } from "./settings";
import { computeProject, type ProjectIn, type Rules } from "./finance";

export const STATUS = {
  MEETING: "ميتنج", BRIEF: "بريف", APPROVED: "موافقة وعربون", IN_PROGRESS: "تنفيذ", DELIVERED: "تم التسليم", CLOSED: "مقفول ومدفوع", CANCELLED: "ملغي",
} as const;
export const ACTIVE = ["APPROVED", "IN_PROGRESS", "DELIVERED"] as const;
export const SIZE = { SMALL: "صغير", MEDIUM: "متوسط", LARGE: "كبير" } as const;
export const DED = { REWORK: "رجوع شغل فيه أخطاء", NO_REPLY: "عدم الرد على البوت", CLIENT_LOSS: "خسارة عميل", CLIENT_REFUSE: "رفض العميل الإعادة", OTHER: "أخرى" } as const;

export async function rules(): Promise<Rules & Record<string, number>> {
  const s = await getSettings();
  const n = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v)])) as Record<string, number>;
  return { ...n, latePctPerDay: n.latePctPerDay, lateMaxPct: n.lateMaxPct };
}

// Loads projects with everything needed for money math. Only call from admin code paths
// or reduce the result before it reaches a member view.
export async function loadProjects(ids?: string[]) {
  const ps = ids ? await db.select().from(projects).where(inArray(projects.id, ids)) : await db.select().from(projects).orderBy(desc(projects.createdAt));
  if (!ps.length) return [];
  const pid = ps.map((p) => p.id);
  const [pays, costs, roles] = await Promise.all([
    db.select().from(projectPayments).where(inArray(projectPayments.projectId, pid)),
    db.select().from(projectCosts).where(inArray(projectCosts.projectId, pid)),
    db.select().from(projectRoles).where(inArray(projectRoles.projectId, pid)),
  ]);
  const rid = roles.map((r) => r.id);
  const [mems, deds] = rid.length ? await Promise.all([
    db.select().from(roleMembers).where(inArray(roleMembers.roleId, rid)),
    db.select().from(deductions).where(inArray(deductions.roleId, rid)),
  ]) : [[], []];
  return ps.map((p) => {
    const pr = roles.filter((r) => r.projectId === p.id).sort((a, b) => +a.createdAt - +b.createdAt).map((r) => ({
      ...r,
      members: mems.filter((m) => m.roleId === r.id),
      deductions: deds.filter((d) => d.roleId === r.id),
    }));
    return { ...p, payments: pays.filter((x) => x.projectId === p.id), costs: costs.filter((x) => x.projectId === p.id), roles: pr };
  });
}

export type Loaded = Awaited<ReturnType<typeof loadProjects>>[number];
export function calc(p: Loaded, r: Rules) {
  // Each project's own deduction rules override the global ones.
  const pr = rulesFor((p as { dedRules?: string | null }).dedRules, r as unknown as Record<string, unknown>);
  return computeProject(p as unknown as ProjectIn, { ...r, latePctPerDay: pr.latePctPerDay, lateMaxPct: pr.lateMaxPct });
}

export async function loadProject(id: string) {
  const [p] = await loadProjects([id]);
  return p ?? null;
}


// SAFE view for team members: selects only non-financial columns. Never add price/fee here.
export async function loadTeamView(onlyActive = true) {
  const { users } = await import("./db");
  const ps = await db.select({ id: projects.id, name: projects.name, client: projects.client, status: projects.status, startDate: projects.startDate, dueDate: projects.dueDate, description: projects.description, dedRules: projects.dedRules, rulesNote: projects.rulesNote })
    .from(projects).orderBy(desc(projects.createdAt));
  const list = onlyActive ? ps.filter((p) => (ACTIVE as readonly string[]).includes(p.status)) : ps;
  if (!list.length) return [];
  const roles = await db.select({ id: projectRoles.id, projectId: projectRoles.projectId, title: projectRoles.title, scope: projectRoles.scope, deliverables: projectRoles.deliverables, dueDate: projectRoles.dueDate, deliveredAt: projectRoles.deliveredAt, progress: projectRoles.progress, createdAt: projectRoles.createdAt,
      // work order (no money)
      doneDefinition: projectRoles.doneDefinition, checklist: projectRoles.checklist, checklistDone: projectRoles.checklistDone, deadlineAt: projectRoles.deadlineAt, graceHours: projectRoles.graceHours,
      issuedAt: projectRoles.issuedAt, acceptedAt: projectRoles.acceptedAt, extUntil: projectRoles.extUntil, extReason: projectRoles.extReason, extStatus: projectRoles.extStatus,
      reviewStatus: projectRoles.reviewStatus, reviewNote: projectRoles.reviewNote, reworkDueAt: projectRoles.reworkDueAt })
    .from(projectRoles).where(inArray(projectRoles.projectId, list.map((p) => p.id)));
  const mems = roles.length ? await db.select({ roleId: roleMembers.roleId, userId: roleMembers.userId, isLead: roleMembers.isLead, name: users.name })
    .from(roleMembers).innerJoin(users, eq(roleMembers.userId, users.id)).where(inArray(roleMembers.roleId, roles.map((r) => r.id))) : [];
  return list.map((p) => ({ ...p, roles: roles.filter((r) => r.projectId === p.id).sort((a, b) => +a.createdAt - +b.createdAt).map((r) => ({ ...r, members: mems.filter((m) => m.roleId === r.id) })) }));
}

// Per-person earnings across all projects. Entitled = project CLOSED (client accepted and paid).
export async function earnings() {
  const [ps, r] = await Promise.all([loadProjects(), rules()]);
  const map = new Map<string, { expected: number; entitled: number; deducted: number; items: { projectId: string; project: string; status: string; title: string; base: number; net: number; deducted: number; days: number }[] }>();
  const projectsCalc = ps.map((p) => ({ p, c: calc(p, r) }));
  for (const { p, c } of projectsCalc) {
    if (p.status === "CANCELLED") continue;
    for (const l of c.lines) {
      const e = map.get(l.userId) ?? { expected: 0, entitled: 0, deducted: 0, items: [] };
      if (p.status === "CLOSED") e.entitled += l.net; else e.expected += l.net;
      e.deducted += l.deducted;
      e.items.push({ projectId: p.id, project: p.name, status: p.status, title: l.title, base: l.base, net: l.net, deducted: l.deducted, days: l.days });
      map.set(l.userId, e);
    }
  }
  return { map, projectsCalc, rules: r };
}
