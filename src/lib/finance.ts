// Pure money math. All amounts in EGP unless noted.
export type Rules = { latePctPerDay: number; lateMaxPct: number };

export type RoleIn = {
  id: string; title: string; fee: number; dueDate: Date | null; deliveredAt: Date | null;
  deadlineAt?: Date | null; graceHours?: number | null;
  members: { userId: string; sharePct: number }[];
  deductions: { userId: string; pct: number; status: string }[];
};
export type ProjectIn = {
  price: number; rate: number; fundPct: number; ownerPct: number; teamCapPct: number; status: string;
  payments: { amount: number }[]; costs: { amountEgp: number }[]; roles: RoleIn[];
};

const DAY = 86400000;
export function lateDays(due: Date | null, delivered: Date | null, now = new Date()): number {
  if (!due) return 0;
  const end = delivered ?? now;
  // Due date counts as the whole day: delivering any time on it is on time.
  return Math.max(0, Math.floor((end.getTime() - due.getTime()) / DAY));
}

/**
 * The moment after which lateness starts.
 * Work orders: exact deadline + grace hours. Older roles (date only): the whole due day counts.
 */
export function cutoff(role: Pick<RoleIn, "dueDate" | "deadlineAt" | "graceHours">): Date | null {
  if (role.deadlineAt) return new Date(role.deadlineAt.getTime() + (role.graceHours ?? 0) * 3600000);
  if (role.dueDate) return new Date(role.dueDate.getTime() + DAY);
  return null;
}
/** Every started day after the cutoff counts as one late day (1 minute late = day 1). */
export function lateDaysFor(role: Pick<RoleIn, "dueDate" | "deadlineAt" | "graceHours" | "deliveredAt">, now = new Date()): number {
  const c = cutoff(role);
  if (!c) return 0;
  const end = role.deliveredAt ?? now;
  return end <= c ? 0 : Math.ceil((end.getTime() - c.getTime()) / DAY);
}
/** What the employee loses for each day late, in EGP, until the cap. */
export function deductionSchedule(base: number, role: Pick<RoleIn, "dueDate" | "deadlineAt" | "graceHours">, r: Rules) {
  const c = cutoff(role);
  if (!c || r.latePctPerDay <= 0) return [];
  const steps = Math.ceil(r.lateMaxPct / r.latePctPerDay);
  return Array.from({ length: steps }, (_, i) => {
    const pct = Math.min((i + 1) * r.latePctPerDay, r.lateMaxPct);
    return { day: i + 1, from: new Date(c.getTime() + i * DAY), to: new Date(c.getTime() + (i + 1) * DAY), pct, amount: Math.round(base * pct / 100), last: i === steps - 1 };
  });
}

export function memberLine(role: RoleIn, userId: string, sharePct: number, r: Rules) {
  const base = role.fee * sharePct / 100;
  const days = lateDaysFor(role);
  const latePct = Math.min(days * r.latePctPerDay, r.lateMaxPct);
  const otherPct = role.deductions.filter((d) => d.userId === userId && d.status === "APPROVED").reduce((a, d) => a + d.pct, 0);
  const totalPct = Math.min(100, latePct + otherPct);
  const deducted = base * totalPct / 100;
  return { base, days, latePct, otherPct, totalPct, deducted, net: base - deducted };
}

export function computeProject(p: ProjectIn, r: Rules) {
  const received = p.payments.reduce((a, x) => a + x.amount, 0) * p.rate;
  // Subscriptions (and any overpayment) earn more than the agreed price: count what was actually received.
  const revenue = Math.max(p.price * p.rate, received);
  const costs = p.costs.reduce((a, x) => a + x.amountEgp, 0);
  const fund = revenue * p.fundPct / 100;
  const lines = p.roles.flatMap((role) => role.members.map((m) => ({ roleId: role.id, title: role.title, userId: m.userId, sharePct: m.sharePct, ...memberLine(role, m.userId, m.sharePct, r) })));
  const teamGross = p.roles.reduce((a, x) => a + x.fee, 0);
  const teamNet = lines.reduce((a, x) => a + x.net, 0);
  const deductedTotal = lines.reduce((a, x) => a + x.deducted, 0);
  const capBase = Math.max(0, revenue - costs);
  const capLimit = capBase * p.teamCapPct / 100;
  const teamPctOfNet = capBase > 0 ? teamGross / capBase * 100 : (teamGross > 0 ? Infinity : 0);
  const net = revenue - costs - fund - teamNet;
  const owner = net * p.ownerPct / 100;
  const company = net - owner;
  return {
    revenue, received, remaining: revenue - received, costs, fund, teamGross, teamNet, deductedTotal,
    capLimit, teamPctOfNet, overCap: teamGross > capLimit + 0.01, net, owner, company, lines,
    fullyPaid: received >= revenue - 0.01,
  };
}

export const egp = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString("en-US");
