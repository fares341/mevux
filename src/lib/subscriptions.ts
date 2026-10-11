import "server-only";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db, projects } from "./db";

const DAY = 864e5;
export const addMonth = (d: Date) => { const x = new Date(d); const day = x.getDate(); x.setMonth(x.getMonth() + 1); if (x.getDate() < day) x.setDate(0); return x; };

/** Subscriptions whose payment date is within their reminder window, or already overdue. */
export async function dueSubscriptions() {
  const rows = await db.select().from(projects).where(and(eq(projects.billing, "SUBSCRIPTION"), ne(projects.status, "CANCELLED"), isNotNull(projects.nextDueDate)));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return rows.map((p) => {
    const due = new Date(p.nextDueDate!); due.setHours(0, 0, 0, 0);
    const days = Math.round((+due - +today) / DAY);
    return { id: p.id, name: p.name, client: p.client, clientId: p.clientId, fee: p.monthlyFee ?? 0, currency: p.currency, due: p.nextDueDate!, days, overdue: days < 0, reminderDays: p.reminderDays };
  }).filter((x) => x.days <= x.reminderDays).sort((a, b) => a.days - b.days);
}

/** After a subscription payment, move the next due date one month forward (only if it was due within ~2 weeks or overdue). */
export async function advanceAfterPayment(projectId: string) {
  const p = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!p || p.billing !== "SUBSCRIPTION" || !p.nextDueDate) return;
  if (+p.nextDueDate - Date.now() > 14 * DAY) return;
  await db.update(projects).set({ nextDueDate: addMonth(p.nextDueDate) }).where(eq(projects.id, p.id));
}
