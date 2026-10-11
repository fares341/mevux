"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, suppliers } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({
  category: z.enum(["VPS", "API", "WHATSAPP", "OTHER"]),
  provider: z.string().trim().min(1, "اكتب اسم المزود").max(80),
  item: z.string().trim().min(1, "اكتب اسم الخدمة").max(120),
  price: z.coerce.number().min(0, "السعر غير صحيح").max(1e9),
  currency: z.enum(["EGP", "SAR", "USD"]),
  billing: z.enum(["MONTHLY", "YEARLY", "PER_MESSAGE", "PER_USAGE", "ONE_TIME"]),
  details: z.string().trim().max(1000).optional(),
});

export async function saveSupplier(_: { ok?: string; error?: string }, fd: FormData): Promise<{ ok?: string; error?: string }> {
  const admin = await requireAdmin();
  const p = schema.safeParse(Object.fromEntries(["category","provider","item","price","currency","billing","details"].map((k) => [k, fd.get(k) || undefined])));
  if (!p.success) return { error: p.error.issues[0].message };
  const id = String(fd.get("id") || "");
  if (id) await db.update(suppliers).set(p.data).where(eq(suppliers.id, id));
  else await db.insert(suppliers).values(p.data);
  await audit(admin.id, id ? "supplier_update" : "supplier_create", p.data.provider + " · " + p.data.item);
  revalidatePath("/suppliers");
  return { ok: "تم الحفظ." };
}

export async function deleteSupplier(fd: FormData) {
  const admin = await requireAdmin();
  const id = String(fd.get("id"));
  await db.delete(suppliers).where(eq(suppliers.id, id));
  await audit(admin.id, "supplier_delete", id);
  revalidatePath("/suppliers");
}
