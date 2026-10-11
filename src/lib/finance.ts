// Pure money math. All amounts in EGP unless noted.
export type Rules = { latePctPerDay: number; lateMaxPct: number };

export type RoleIn = {
  id: string; title: string; fee: number; dueDate: Date | null; deliveredAt: Date | null;
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

export function memberLine(role: RoleIn, userId: string, sharePct: number, r: Rules) {
  const base = role.fee * sharePct / 100;
  const days = lateDays(role.dueDate, role.deliveredAt);
  const latePct = Math.min(days * r.latePctPerDay, r.lateMaxPct);
  const otherPct = role.deductions.filter((d) => d.userId === userId && d.status === "APPROVED").reduce((a, d) => a + d.pct, 0);
  const totalPct = Math.min(100, latePct + otherPct);
  const deducted = base * totalPct / 100;
  return { base, days, latePct, otherPct, totalPct, deducted, net: base - deducted };
}

export function computeProject(p: ProjectIn, r: Rules) {
  const revenue = p.price * p.rate;
  const received = p.payments.reduce((a, x) => a + x.amount, 0) * p.rate;
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
