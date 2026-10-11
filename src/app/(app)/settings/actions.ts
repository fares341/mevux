"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, fixedCosts } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { setSetting, getRaw, DEFAULTS } from "@/lib/settings";
import { encrypt, decrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/ratelimit";

type R = { ok?: string; error?: string };
const pct = z.coerce.number().min(0).max(100);
const NUM_KEYS = ["teamCapPct","fundPct","ownerPct","latePctPerDay","lateMaxPct","reworkPct","noReplyPct","clientLossPct","clientRefusePct"] as const;

export async function saveFinance(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  for (const k of NUM_KEYS) {
    const p = pct.safeParse(fd.get(k));
    if (!p.success) return { error: "كل النسب لازم تكون بين 0 و 100." };
    await setSetting(k, String(p.data));
  }
  for (const k of ["rateSAR", "rateUSD"]) {
    const p = z.coerce.number().positive().max(10000).safeParse(fd.get(k));
    if (!p.success) return { error: "سعر الصرف غير صحيح." };
    await setSetting(k, String(p.data));
  }
  await audit(admin.id, "settings_finance");
  revalidatePath("/settings");
  return { ok: "تم حفظ الإعدادات المالية." };
}

export async function addFixedCost(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const p = z.object({ name: z.string().trim().min(1).max(80), amount: z.coerce.number().min(0).max(1e9) }).safeParse({ name: fd.get("name"), amount: fd.get("amount") });
  if (!p.success) return { error: "اكتب اسم البند والمبلغ." };
  await db.insert(fixedCosts).values({ name: p.data.name, amountEgp: p.data.amount });
  await audit(admin.id, "fixed_cost_add", p.data.name);
  revalidatePath("/settings");
  return { ok: "تمت الإضافة." };
}

export async function removeFixedCost(fd: FormData) {
  const admin = await requireAdmin();
  await db.delete(fixedCosts).where(eq(fixedCosts.id, String(fd.get("id"))));
  await audit(admin.id, "fixed_cost_remove");
  revalidatePath("/settings");
}

const MODEL = z.string().trim().regex(/^[a-z0-9._-]+\/[a-zA-Z0-9._:-]+$/, "اسم الموديل بصيغة provider/model");

export async function saveAi(_: R, fd: FormData): Promise<R> {
  const admin = await requireAdmin();
  const m = MODEL.safeParse(fd.get("aiModel") || DEFAULTS.aiModel);
  const am = MODEL.safeParse(fd.get("aiAudioModel") || DEFAULTS.aiAudioModel);
  const cm = MODEL.safeParse(fd.get("aiChatModel") || DEFAULTS.aiChatModel);
  if (!m.success || !am.success || !cm.success) return { error: "اسم الموديل بصيغة provider/model، مثل anthropic/claude-sonnet-4.5" };
  await setSetting("aiModel", m.data);
  await setSetting("aiAudioModel", am.data);
  await setSetting("aiChatModel", cm.data);
  const key = String(fd.get("apiKey") || "").trim();
  if (key) {
    if (!/^sk-or-[A-Za-z0-9_-]{20,200}$/.test(key)) return { error: "مفتاح OpenRouter غير صحيح. يبدأ بـ sk-or-" };
    await setSetting("openrouterKey", encrypt(key));
    await setSetting("openrouterKeyHint", key.slice(-4));
  }
  await audit(admin.id, "settings_ai", key ? "key_changed" : undefined);
  revalidatePath("/settings");
  return { ok: key ? "تم حفظ المفتاح الجديد والموديلات." : "تم حفظ الموديلات." };
}

export async function testAi(_: R): Promise<R> {
  const admin = await requireAdmin();
  if (!rateLimit("aitest:" + admin.id, 5, 60000)) return { error: "انتظر دقيقة قبل الاختبار مرة أخرى." };
  const enc = await getRaw("openrouterKey");
  if (!enc) return { error: "لم يتم إدخال مفتاح بعد." };
  try {
    const r = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: "Bearer " + decrypt(enc) }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return { error: `المفتاح مرفوض من OpenRouter (${r.status}).` };
    const j = await r.json();
    const d = j?.data ?? {};
    const left = d.limit == null ? "بدون حد" : `${(Number(d.limit) - Number(d.usage || 0)).toFixed(2)}$ متبقي`;
    const s = await (await import("@/lib/settings")).getSettings();
    let models = "";
    try {
      const ml = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(10000) });
      const ids = new Set(((await ml.json()).data ?? []).map((x: { id: string }) => x.id));
      const missing = [s.aiModel, s.aiChatModel, s.aiAudioModel].filter((x) => !ids.has(x));
      models = missing.length ? ` · ⚠ موديلات مش موجودة على OpenRouter: ${missing.join("، ")}` : " · الموديلات التلاتة موجودة";
    } catch {}
    return { ok: `الاتصال يعمل · الاستهلاك ${Number(d.usage || 0).toFixed(2)}$ · ${left}${models}` };
  } catch {
    return { error: "تعذر الوصول إلى OpenRouter من السيرفر." };
  }
}
