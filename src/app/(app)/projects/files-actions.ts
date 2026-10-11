"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, projectFiles, projectRoles, credentials } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/auth";
import { isRoleMember } from "@/lib/access";
import { checkFile, saveFile, removeStored } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";

type R = { ok?: string; error?: string };
const refresh = (id: string) => { revalidatePath(`/projects/${id}`); revalidatePath("/projects"); };

// A role member uploads their work; optionally marks the role as delivered.
export async function uploadRoleFile(_: R, fd: FormData): Promise<R> {
  const me = await requireUser();
  const roleId = String(fd.get("roleId"));
  const role = await db.query.projectRoles.findFirst({ where: eq(projectRoles.id, roleId) });
  if (!role || !(await isRoleMember(me, roleId))) return { error: "مش مسموح ترفع على الدور ده." };
  const file = fd.get("file") as File;
  const err = checkFile(file); if (err) return { error: err };
  const s = await saveFile(file);
  await db.insert(projectFiles).values({ projectId: role.projectId, roleId, kind: "DELIVERABLE", uploadedBy: me.id, originalName: s.name, storedName: s.stored, size: s.size, mime: s.mime, note: String(fd.get("note") || "").slice(0, 500) || null });
  if (fd.get("delivered") === "on") await db.update(projectRoles).set({ deliveredAt: role.deliveredAt ?? new Date(), progress: 100 }).where(eq(projectRoles.id, roleId));
  await audit(me.id, "file_upload", `${roleId} ${s.name}`);
  refresh(role.projectId);
  return { ok: fd.get("delivered") === "on" ? "تم رفع الملف وتسجيل تسليم الدور." : "تم رفع الملف." };
}

export async function uploadFinalFile(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const projectId = String(fd.get("projectId"));
  const file = fd.get("file") as File;
  const err = checkFile(file); if (err) return { error: err };
  const s = await saveFile(file);
  await db.insert(projectFiles).values({ projectId, kind: "FINAL", uploadedBy: admin.id, originalName: s.name, storedName: s.stored, size: s.size, mime: s.mime, note: String(fd.get("note") || "").slice(0, 500) || null });
  await audit(admin.id, "final_upload", `${projectId} ${s.name}`);
  refresh(projectId);
  return { ok: "تم رفع الملف النهائي." };
}

export async function deleteFile(fd: FormData) {
  const me = await requireUser();
  const f = await db.query.projectFiles.findFirst({ where: eq(projectFiles.id, String(fd.get("id"))) });
  if (!f || (me.role !== "ADMIN" && f.uploadedBy !== me.id)) return;
  await db.delete(projectFiles).where(eq(projectFiles.id, f.id));
  await removeStored(f.storedName);
  await audit(me.id, "file_delete", f.originalName);
  refresh(f.projectId);
}

export async function saveCredential(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const p = z.object({ projectId: z.string().min(1), label: z.string().trim().min(2, "اكتب اسم البيان (مثلاً: سيرفر العميل)").max(120), url: z.string().trim().max(500).optional(), username: z.string().trim().max(200).optional(), secret: z.string().max(1000).optional(), notes: z.string().max(2000).optional() })
    .safeParse(Object.fromEntries(["projectId", "label", "url", "username", "secret", "notes"].map((k) => [k, (fd.get(k) as string) || undefined])));
  if (!p.success) return { error: p.error.issues[0].message };
  const { secret, ...rest } = p.data;
  await db.insert(credentials).values({ ...rest, secretEnc: secret ? encrypt(secret) : null });
  await audit(admin.id, "credential_add", `${p.data.projectId} ${p.data.label}`);
  refresh(p.data.projectId);
  return { ok: "تم حفظ البيانات." };
}

export async function deleteCredential(fd: FormData) {
  const admin = await requireAdmin();
  const id = String(fd.get("id")), projectId = String(fd.get("projectId"));
  await db.delete(credentials).where(and(eq(credentials.id, id), eq(credentials.projectId, projectId)));
  await audit(admin.id, "credential_delete", id);
  refresh(projectId);
}
