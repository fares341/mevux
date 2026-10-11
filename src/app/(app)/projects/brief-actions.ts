"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, projectBriefs, clientFiles } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { briefFacts, writeBrief, reviseBrief, parseContent, renderBrief, toPdf, type Lang, type BriefOpts, type BriefContent, type Facts } from "@/lib/brief";
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
    const opts: BriefOpts = { supplierIds, usageEstimate: Number.isFinite(usage) && usage > 0 ? usage : undefined, opsNote: String(fd.get("opsNote") || "").slice(0, 600) };
    const facts = await briefFacts(projectId, opts);
    const content = await writeBrief(facts, lang, extra);
    const b = await saveVersion(admin.id, facts, content, lang, opts, { version: 1 });
    await audit(admin.id, "brief_generate", `${projectId} ${lang}`);
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

async function saveVersion(adminId: string, facts: Facts, content: BriefContent, lang: Lang, opts: BriefOpts, v: { version: number; parentId?: string; instruction?: string }) {
  const pdf = await toPdf(await renderBrief(content, facts, lang));
  const name = `MEVIX_${facts.p.name}_Brief_${lang.toUpperCase()}_v${v.version}.pdf`.replace(/[\\/:*?"<>|\s]+/g, "_");
  const file = new File([new Uint8Array(pdf)], name, { type: "application/pdf" });
  const s = await saveFile(file);
  const [b] = await db.insert(projectBriefs).values({ projectId: facts.p.id, lang, storedName: s.stored, size: s.size, createdBy: adminId, version: v.version, parentId: v.parentId ?? null, instruction: v.instruction ?? null, contentJson: JSON.stringify(content), optsJson: JSON.stringify(opts) }).returning();
  if (facts.client) {
    const c = await saveFile(file);
    await db.insert(clientFiles).values({ clientId: facts.client.id, kind: "BRIEF", uploadedBy: adminId, originalName: name, storedName: c.stored, size: c.size, mime: "application/pdf", note: v.instruction ? `نسخة معدّلة: ${v.instruction.slice(0, 120)}` : `اتولّد من مشروع ${facts.p.name}` });
    revalidatePath(`/clients/${facts.client.id}`);
  }
  revalidatePath(`/projects/${facts.p.id}`); revalidatePath("/briefs");
  return b;
}

/** "عدّل كذا": applies a written or spoken instruction to a brief and saves it as the next version. */
export async function reviseBriefAction(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  if (!rateLimit("brief:" + admin.id, 10, 10 * 60_000)) return { error: "استنى شوية قبل تعديل تاني." };
  const instruction = String(fd.get("instruction") || "").trim().slice(0, 4000);
  if (instruction.length < 3) return { error: "اكتب أو سجّل التعديل المطلوب." };
  const base = await db.query.projectBriefs.findFirst({ where: eq(projectBriefs.id, String(fd.get("id"))) });
  if (!base?.contentJson) return { error: "البريف ده اتعمل قبل خاصية التعديل. ولّد بريف جديد." };
  try {
    const lang = base.lang as Lang;
    const opts: BriefOpts = base.optsJson ? JSON.parse(base.optsJson) : { supplierIds: [] };
    const facts = await briefFacts(base.projectId, opts);
    const content = await reviseBrief(parseContent(base.contentJson), instruction, lang);
    const rootId = base.parentId ?? base.id;
    const last = await db.select({ v: projectBriefs.version }).from(projectBriefs).where(eq(projectBriefs.parentId, rootId));
    const version = Math.max(base.version, ...last.map((x) => x.v)) + 1;
    const b = await saveVersion(admin.id, facts, content, lang, opts, { version, parentId: rootId, instruction });
    await audit(admin.id, "brief_revise", `${base.id} → v${version}`);
    return { ok: `اتعملت النسخة ${version}.`, id: b.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "حصل خطأ في التعديل." };
  }
}
