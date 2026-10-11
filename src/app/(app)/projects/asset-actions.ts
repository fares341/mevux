"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, projectAssets, projects } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

type R = { ok?: string; error?: string };
const o = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? "").trim(); return v || undefined; };

export async function saveAsset(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const p = z.object({
    projectId: z.string().min(1), kind: z.enum(["WEBSITE", "APP", "SAAS", "SERVER", "DOMAIN", "OTHER"]), name: z.string().trim().min(2, "اكتب الاسم").max(120),
    url: z.string().max(400).optional(), provider: z.string().max(120).optional(), details: z.string().max(2000).optional(),
    cost: z.coerce.number().min(0).max(1e9).optional(), currency: z.enum(["EGP", "SAR", "USD"]), billing: z.enum(["MONTHLY", "YEARLY", "ONE_TIME"]),
    paidBy: z.enum(["CLIENT", "US", "INCLUDED"]), renewsAt: z.preprocess((v) => (v ? new Date(String(v)) : null), z.date().nullable()),
  }).safeParse({ projectId: o(fd, "projectId"), kind: o(fd, "kind"), name: o(fd, "name"), url: o(fd, "url"), provider: o(fd, "provider"), details: o(fd, "details"), cost: o(fd, "cost"), currency: o(fd, "currency") || "EGP", billing: o(fd, "billing") || "MONTHLY", paidBy: o(fd, "paidBy") || "CLIENT", renewsAt: o(fd, "renewsAt") });
  if (!p.success) return { error: p.error.issues[0].message };
  if (!(await db.query.projects.findFirst({ where: eq(projects.id, p.data.projectId) }))) return { error: "المشروع غير موجود." };
  const id = o(fd, "id");
  const data = { ...p.data, cost: p.data.cost ?? null, inBrief: fd.get("inBrief") === "on" };
  if (id) await db.update(projectAssets).set(data).where(and(eq(projectAssets.id, id), eq(projectAssets.projectId, p.data.projectId)));
  else await db.insert(projectAssets).values(data);
  await audit(admin.id, id ? "asset_update" : "asset_add", p.data.name);
  revalidatePath(`/projects/${p.data.projectId}`); revalidatePath("/clients");
  return { ok: "اتحفظ." };
}

export async function deleteAsset(fd: FormData) {
  const admin = await requireAdmin();
  const id = String(fd.get("id")), projectId = String(fd.get("projectId"));
  await db.delete(projectAssets).where(and(eq(projectAssets.id, id), eq(projectAssets.projectId, projectId)));
  await audit(admin.id, "asset_delete", id);
  revalidatePath(`/projects/${projectId}`); revalidatePath("/clients");
}
