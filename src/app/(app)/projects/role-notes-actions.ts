"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, roleNotes, projectRoles } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { checkFile, saveFile, removeStored } from "@/lib/storage";

type R = { ok?: string; error?: string };

/** One "ticket" for a role: text and/or up to 8 files/images and/or one voice note. Each file becomes its own row. */
export async function addRoleNote(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const role = await db.query.projectRoles.findFirst({ where: eq(projectRoles.id, String(fd.get("roleId") || "")) });
  if (!role) return { error: "الدور مش موجود." };
  const text = String(fd.get("text") || "").trim().slice(0, 8000);
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const voice = fd.get("voice");
  const all = [...files.map((f) => ({ f, v: false })), ...(voice instanceof File && voice.size ? [{ f: voice, v: true }] : [])];
  if (!text && !all.length) return { error: "اكتب التفاصيل أو ارفع ملف أو سجّل فويس." };
  if (files.length > 8) return { error: "أقصى حاجة 8 ملفات في المرة." };
  if (all.reduce((a, x) => a + x.f.size, 0) > 50 * 1024 * 1024) return { error: "مجموع الملفات أكبر من 50 ميجا." };
  for (const { f } of all) { const e = checkFile(f); if (e) return { error: `${f.name}: ${e}` }; }
  if (text) await db.insert(roleNotes).values({ roleId: role.id, authorId: admin.id, text });
  for (const { f, v } of all) {
    const s = await saveFile(f);
    await db.insert(roleNotes).values({ roleId: role.id, authorId: admin.id, fileName: s.name, storedName: s.stored, size: s.size, mime: s.mime, isVoice: v });
  }
  await audit(admin.id, "role_note_add", `${role.id} files:${all.length}`);
  revalidatePath(`/projects/${role.projectId}`);
  return { ok: "اتحفظت تفاصيل الدور، وهتظهر للي في الدور ده." };
}

export async function deleteRoleNote(fd: FormData) {
  const admin = await requireAdmin();
  const n = await db.query.roleNotes.findFirst({ where: eq(roleNotes.id, String(fd.get("id") || "")) });
  if (!n) return;
  const role = await db.query.projectRoles.findFirst({ where: eq(projectRoles.id, n.roleId) });
  await db.delete(roleNotes).where(eq(roleNotes.id, n.id));
  if (n.storedName) await removeStored(n.storedName);
  await audit(admin.id, "role_note_delete", n.id);
  if (role) revalidatePath(`/projects/${role.projectId}`);
}
