import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db, users } from "./db";
import { derivedKey } from "./secret";

const COOKIE = "mevix_session";
const MAX_AGE = 60 * 60 * 10; // 10 hours

export type SessionUser = { id: string; name: string; username: string; role: "ADMIN" | "TEAM_LEAD" | "MEMBER" };

export async function createSession(userId: string, sessionVersion: number) {
  const token = await new SignJWT({ v: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(derivedKey("jwt"));
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== "false",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

// Identity always comes from the signed cookie + live DB check, never from user input.
export async function getUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, derivedKey("jwt"), { algorithms: ["HS256"] });
    const u = await db.query.users.findFirst({ where: eq(users.id, String(payload.sub)) });
    if (!u || !u.active || u.sessionVersion !== payload.v) return null;
    return { id: u.id, name: u.name, username: u.username, role: u.role };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "ADMIN") redirect("/");
  return u;
}

export const ROLE_LABEL = { ADMIN: "مدير النظام", TEAM_LEAD: "تيم ليد", MEMBER: "عضو الفريق" } as const;
