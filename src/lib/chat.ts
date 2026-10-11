import "server-only";
import { and, asc, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db, projects, projectMessages, chatReads, users } from "./db";
import type { SessionUser } from "./auth";
import { canAccessProject } from "./access";
import { myProjectIds } from "./work";

// A project's group = everyone holding a role in it + the admin. Created implicitly with the project.

export async function chatProjects(u: SessionUser) {
  const ids = u.role === "ADMIN" ? null : await myProjectIds(u.id);
  if (ids && !ids.length) return [];
  const ps = await db.select({ id: projects.id, name: projects.name, client: projects.client, status: projects.status, createdAt: projects.createdAt }).from(projects)
    .where(ids ? inArray(projects.id, ids) : ne(projects.status, "CANCELLED"));
  if (!ps.length) return [];
  const pid = ps.map((p) => p.id);
  const last = await db.select({ projectId: projectMessages.projectId, at: sql<Date>`max(${projectMessages.createdAt})`.as("at") }).from(projectMessages).where(inArray(projectMessages.projectId, pid)).groupBy(projectMessages.projectId);
  const reads = await db.select().from(chatReads).where(and(eq(chatReads.userId, u.id), inArray(chatReads.projectId, pid)));
  const unread = await Promise.all(ps.map(async (p) => {
    const since = reads.find((r) => r.projectId === p.id)?.lastReadAt;
    const r = await db.select({ n: sql<number>`count(*)::int` }).from(projectMessages).where(and(eq(projectMessages.projectId, p.id), ne(projectMessages.userId, u.id), since ? gt(projectMessages.createdAt, since) : undefined));
    return r[0].n;
  }));
  const lastMsgs = await Promise.all(ps.map((p) => db.select({ text: projectMessages.text, fileName: projectMessages.fileName, name: users.name }).from(projectMessages).innerJoin(users, eq(projectMessages.userId, users.id)).where(eq(projectMessages.projectId, p.id)).orderBy(desc(projectMessages.createdAt)).limit(1)));
  return ps.map((p, i) => ({ ...p, lastAt: last.find((l) => l.projectId === p.id)?.at ? new Date(last.find((l) => l.projectId === p.id)!.at) : null, unread: unread[i], last: lastMsgs[i][0] ?? null }))
    .sort((a, b) => +(b.lastAt ?? b.createdAt) - +(a.lastAt ?? a.createdAt));
}

export type ChatMember = { id: string; name: string; roles: string[]; isAdmin: boolean; color: number; lastReadAt: string | null };

/** Everyone in the group, with their roles in this project and when they last opened the chat. */
export async function groupInfo(projectId: string): Promise<ChatMember[]> {
  const { roleMembers, projectRoles } = await import("./db");
  const rows = await db.select({ id: users.id, name: users.name, title: projectRoles.title }).from(roleMembers)
    .innerJoin(projectRoles, eq(roleMembers.roleId, projectRoles.id)).innerJoin(users, eq(roleMembers.userId, users.id)).where(eq(projectRoles.projectId, projectId));
  const admins = await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.role, "ADMIN"), eq(users.active, true)));
  const reads = await db.select().from(chatReads).where(eq(chatReads.projectId, projectId));
  const map = new Map<string, ChatMember>();
  for (const a of admins) map.set(a.id, { id: a.id, name: a.name, roles: [], isAdmin: true, color: 0, lastReadAt: null });
  for (const r of rows) { const m = map.get(r.id) ?? { id: r.id, name: r.name, roles: [], isAdmin: false, color: 0, lastReadAt: null }; if (!m.roles.includes(r.title)) m.roles.push(r.title); map.set(r.id, m); }
  const list = [...map.values()].sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.name.localeCompare(b.name, "ar"));
  // Stable colour per person (like WhatsApp names), from their id.
  list.forEach((m) => { m.color = [...m.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 8; m.lastReadAt = reads.find((r) => r.userId === m.id)?.lastReadAt?.toISOString() ?? null; });
  return list;
}

export async function messages(u: SessionUser, projectId: string) {
  if (!(await canAccessProject(u, projectId))) throw new Error("forbidden");
  const rows = (await db.select({ m: projectMessages, name: users.name }).from(projectMessages).innerJoin(users, eq(projectMessages.userId, users.id))
    .where(eq(projectMessages.projectId, projectId)).orderBy(desc(projectMessages.createdAt)).limit(400)).reverse();
  await markRead(u.id, projectId);
  const byId = new Map(rows.map((r) => [r.m.id, r]));
  const preview = (id: string | null) => {
    const r = id ? byId.get(id) : undefined;
    if (!r) return null;
    return { id: r.m.id, name: r.name, userId: r.m.userId, text: r.m.deletedAt ? "رسالة اتمسحت" : r.m.text || (r.m.isVoice ? "🎤 فويس نوت" : r.m.mime?.startsWith("image/") ? "📷 صورة" : r.m.fileName ? "📎 " + r.m.fileName : "") };
  };
  return rows.map((r) => {
    const del = !!r.m.deletedAt;
    return {
      id: r.m.id, userId: r.m.userId, name: r.name, text: del ? "" : r.m.text, deleted: del,
      file: !del && r.m.storedName ? { id: r.m.id, name: r.m.fileName, size: r.m.fileSize, mime: (r.m.mime || "").split(";")[0], voice: r.m.isVoice } : null,
      reply: del ? null : preview(r.m.replyToId), at: r.m.createdAt.toISOString(),
    };
  });
}

async function markRead(userId: string, projectId: string) {
  const ex = await db.select({ id: chatReads.id }).from(chatReads).where(and(eq(chatReads.userId, userId), eq(chatReads.projectId, projectId)));
  if (ex.length) await db.update(chatReads).set({ lastReadAt: new Date() }).where(eq(chatReads.id, ex[0].id));
  else await db.insert(chatReads).values({ userId, projectId });
}

export async function groupMembers(projectId: string) {
  const { roleMembers, projectRoles } = await import("./db");
  return db.selectDistinct({ id: users.id, name: users.name }).from(roleMembers).innerJoin(projectRoles, eq(roleMembers.roleId, projectRoles.id)).innerJoin(users, eq(roleMembers.userId, users.id)).where(eq(projectRoles.projectId, projectId));
}
