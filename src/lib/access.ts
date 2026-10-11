import "server-only";
import { and, eq } from "drizzle-orm";
import { db, roleMembers, projectRoles } from "./db";
import type { SessionUser } from "./auth";

// True when the person works on this project (or is the admin).
export async function canAccessProject(u: SessionUser, projectId: string): Promise<boolean> {
  if (u.role === "ADMIN") return true;
  const r = await db.select({ id: roleMembers.id }).from(roleMembers)
    .innerJoin(projectRoles, eq(roleMembers.roleId, projectRoles.id))
    .where(and(eq(projectRoles.projectId, projectId), eq(roleMembers.userId, u.id))).limit(1);
  return r.length > 0;
}

export async function isRoleMember(u: SessionUser, roleId: string): Promise<boolean> {
  if (u.role === "ADMIN") return true;
  const r = await db.select({ id: roleMembers.id }).from(roleMembers).where(and(eq(roleMembers.roleId, roleId), eq(roleMembers.userId, u.id))).limit(1);
  return r.length > 0;
}
