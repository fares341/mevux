import "server-only";
import { db, projects, projectPayments, projectCosts, payouts, fixedCosts, expenses, fundSpends } from "./db";

export const mkey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export type Month = { key: string; income: number; subs: number; projectCosts: number; team: number; fixed: number; expenses: number; fund: number; out: number; net: number };

/** Real money in and out per month (EGP). Income = client payments at each project's rate. */
export async function cashflow(monthsBack = 12) {
  const [ps, pays, costs, outs, fixed, exps, fspends] = await Promise.all([
    db.select().from(projects), db.select().from(projectPayments), db.select().from(projectCosts), db.select().from(payouts),
    db.select().from(fixedCosts), db.select().from(expenses), db.select().from(fundSpends),
  ]);
  const proj = new Map(ps.map((p) => [p.id, p]));
  const fixedMonthly = fixed.filter((f) => f.active).reduce((a, f) => a + f.amountEgp, 0);
  const months: Month[] = [];
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: mkey(d), income: 0, subs: 0, projectCosts: 0, team: 0, fixed: 0, expenses: 0, fund: 0, out: 0, net: 0 });
  }
  const at = (d: Date) => months.find((m) => m.key === mkey(d));
  for (const x of pays) { const p = proj.get(x.projectId); const m = at(x.paidAt); if (!p || !m) continue; const v = x.amount * p.rate; m.income += v; if (p.billing === "SUBSCRIPTION") m.subs += v; }
  for (const x of costs) { const m = at(x.createdAt); if (m) m.projectCosts += x.amountEgp; }
  for (const x of outs) { const m = at(x.paidAt); if (m) m.team += x.amountEgp; }
  for (const x of exps) { const m = at(x.spentAt); if (m) m.expenses += x.amountEgp; }
  for (const x of fspends) { const m = at(x.spentAt); if (m) m.fund += x.amountEgp; }
  // Fixed costs count from the first month with any activity.
  const firstActive = months.findIndex((m) => m.income || m.projectCosts || m.team || m.expenses || m.fund);
  months.forEach((m, i) => { if (firstActive !== -1 && i >= firstActive) m.fixed = fixedMonthly; m.out = m.projectCosts + m.team + m.fixed + m.expenses + m.fund; m.net = m.income - m.out; });

  const shown = firstActive === -1 ? months.slice(-1) : months.slice(firstActive);
  // Subscriptions
  const thisMonth = mkey(now);
  const subs = ps.filter((p) => p.billing === "SUBSCRIPTION" && p.status !== "CANCELLED").map((p) => {
    const mine = pays.filter((x) => x.projectId === p.id).sort((a, b) => +b.paidAt - +a.paidAt);
    return { id: p.id, name: p.name, client: p.client, currency: p.currency, fee: p.monthlyFee ?? 0, feeEgp: (p.monthlyFee ?? 0) * p.rate,
      nextDue: p.nextDueDate, reminderDays: p.reminderDays,
      paidThisMonth: mine.some((x) => mkey(x.paidAt) === thisMonth), lastPaid: mine[0]?.paidAt ?? null, totalEgp: mine.reduce((a, x) => a + x.amount * p.rate, 0) };
  });
  return { months: shown, subs, mrr: subs.reduce((a, s) => a + s.feeEgp, 0), fixedMonthly, exps: exps.sort((a, b) => +b.spentAt - +a.spentAt).slice(0, 30) };
}
