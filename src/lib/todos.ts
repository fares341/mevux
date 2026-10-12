import "server-only";
import { and, asc, desc, eq, isNull, isNotNull, lte } from "drizzle-orm";
import { db, todos } from "./db";
import type { SessionUser } from "./auth";

// Every query is scoped to the owner. There is deliberately no way to read someone else's list.
export async function myTodos(u: SessionUser, view: "open" | "done" | "ideas" = "open") {
  const base = eq(todos.userId, u.id);
  if (view === "ideas") return db.select().from(todos).where(and(base, eq(todos.kind, "IDEA"), isNull(todos.doneAt))).orderBy(desc(todos.createdAt));
  if (view === "done") return db.select().from(todos).where(and(base, isNotNull(todos.doneAt))).orderBy(desc(todos.doneAt)).limit(100);
  // open tasks: dated first (soonest), then undated newest
  const rows = await db.select().from(todos).where(and(base, eq(todos.kind, "TASK"), isNull(todos.doneAt))).orderBy(asc(todos.dueAt), desc(todos.createdAt));
  return [...rows.filter((r) => r.dueAt), ...rows.filter((r) => !r.dueAt)];
}
/** Open personal tasks due by the end of today (or overdue), for the Today page. */
export async function todosDueToday(u: SessionUser) {
  const { cairoEndOfDay } = await import("./tz");
  const end = cairoEndOfDay();
  return db.select().from(todos).where(and(eq(todos.userId, u.id), isNull(todos.doneAt), eq(todos.kind, "TASK"), lte(todos.dueAt, end))).orderBy(asc(todos.dueAt));
}
export async function addTodo(u: SessionUser, d: { title: string; details?: string; kind?: string; dueAt?: Date | null; projectId?: string | null }) {
  const title = d.title.trim().slice(0, 300);
  if (title.length < 2) throw new Error("اكتب المهمة.");
  const [t] = await db.insert(todos).values({ userId: u.id, title, details: d.details?.trim().slice(0, 4000) || null, kind: d.kind === "IDEA" ? "IDEA" : "TASK", dueAt: d.dueAt ?? null, projectId: d.projectId ?? null }).returning();
  return t;
}
const mine = (u: SessionUser, id: string) => and(eq(todos.id, id), eq(todos.userId, u.id));
export async function toggleTodo(u: SessionUser, id: string) {
  const t = await db.query.todos.findFirst({ where: mine(u, id) });
  if (!t) throw new Error("مش موجودة.");
  await db.update(todos).set({ doneAt: t.doneAt ? null : new Date() }).where(mine(u, id));
  return { ...t, doneAt: t.doneAt ? null : new Date() };
}
export async function deleteTodo(u: SessionUser, id: string) { await db.delete(todos).where(mine(u, id)); }
export async function updateTodo(u: SessionUser, id: string, d: { title?: string; details?: string | null; dueAt?: Date | null; kind?: string }) {
  const set: Partial<typeof todos.$inferInsert> = {};
  if (d.title?.trim()) set.title = d.title.trim().slice(0, 300);
  if (d.details !== undefined) set.details = d.details?.trim().slice(0, 4000) || null;
  if (d.dueAt !== undefined) set.dueAt = d.dueAt;
  if (d.kind) set.kind = d.kind === "IDEA" ? "IDEA" : "TASK";
  if (Object.keys(set).length) await db.update(todos).set(set).where(mine(u, id));
}
