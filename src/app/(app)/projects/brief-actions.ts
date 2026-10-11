"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, projectBriefs, clientFiles } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { briefFacts, writeBrief, renderBrief, toPdf, type Lang } from "@/lib/brief";
import { saveFile, removeStored } from "@/lib/storage";

type R = { ok?: string; error?: string; id?: string };

export async function generateBrief(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  if (!rateLimit("brief:" + admin.id, 6, 10 * 60_000)) return { error: "استنى شوية قبل ما تولّد بريف تاني." };
  const projectId = String(fd.get("projectId"));
  const lang: Lang = fd.get("lang") === "en" ? "en" : "ar";
  const extra = String(fd.get("extra") || "").slice(0, 6000);
  const supplierIds = fd.getAll("supplierId").map(String).slice(0, 20);
  try {
    const usage = Number(fd.get("usageEstimate"));
    const facts = await briefFacts(projectId, { supplierIds, usageEstimate: Number.isFinite(usage) && usage > 0 ? usage : undefined, opsNote: String(fd.get("opsNote") || "").slice(0, 600) });
    const content = await writeBrief(facts, lang, extra);
    const pdf = await toPdf(await renderBrief(content, facts, lang));
    const name = `MEVIX_${facts.p.name}_Brief_${lang.toUpperCase()}.pdf`.replace(/[\\/:*?"<>|\s]+/g, "_");
    const file = new File([new Uint8Array(pdf)], name, { type: "application/pdf" });
    const s = await saveFile(file);
    const [b] = await db.insert(projectBriefs).values({ projectId, lang, storedName: s.stored, size: s.size, createdBy: admin.id }).returning();
    if (facts.client) { const c = await saveFile(file); await db.insert(clientFiles).values({ clientId: facts.client.id, kind: "BRIEF", uploadedBy: admin.id, originalName: name, storedName: c.stored, size: c.size, mime: "application/pdf", note: `اتولّد من مشروع ${facts.p.name}` }); revalidatePath(`/clients/${facts.client.id}`); }
    await audit(admin.id, "brief_generate", `${projectId} ${lang}`);
    revalidatePath(`/projects/${projectId}`); revalidatePath("/briefs");
    return { ok: "البريف جاهز." + (facts.client ? " واتحفظ نسخة في ملف العميل." : ""), id: b.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "حصل خطأ في توليد البريف." };
  }
}

export async function deleteBrief(fd: FormData) {
  const admin = await requireAdmin();
  const b = await db.query.projectBriefs.findFirst({ where: eq(projectBriefs.id, String(fd.get("id"))) });
  if (!b) return;
  await db.delete(projectBriefs).where(eq(projectBriefs.id, b.id));
  await removeStored(b.storedName);
  await audit(admin.id, "brief_delete", b.id);
  revalidatePath(`/projects/${b.projectId}`); revalidatePath("/briefs");
}
