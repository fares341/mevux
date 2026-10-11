import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { db, assistantPending, assistantMessages } from "./db";
import type { SessionUser } from "./auth";
import { audit } from "./audit";

// Admin actions that change permissions, money owed to people, settings, or delete data.
// The assistant may PROPOSE them; they only run when the admin clicks "confirm" in the UI.
// This blocks prompt injection: text a member writes (an update, a complaint, a task) can
// never make the model perform these on its own.
export const SENSITIVE: Record<string, string> = {
  employee_account: "حساب موظف", create_employee: "إنشاء حساب موظف", record_payout: "تسجيل صرف لموظف",
  add_deduction: "تسجيل خصم", decide_deduction: "قرار خصم", update_setting: "تغيير إعداد",
  delete_project: "مسح مشروع", delete_client: "مسح عميل", delete_role: "مسح دور", remove_record: "مسح سجل",
  edit_role: "تعديل دور وأجره", add_role: "إضافة دور بأجر", record_payment: "تسجيل دفعة من عميل", mark_installment_paid: "تعليم دفعة اتدفعت",
};
const PREVIEW_ONLY = new Set(["delete_project", "delete_client", "delete_role"]);

/** Should this call wait for a human click? (Previews of deletes run directly; they change nothing.) */
export function needsConfirm(name: string, args: Record<string, unknown>, u: SessionUser) {
  if (u.role !== "ADMIN" || !(name in SENSITIVE)) return false;
  if (PREVIEW_ONLY.has(name) && args.confirmed !== true) return false;
  if (name === "employee_account" && args.action === "delete" && args.confirmed !== true) return false;
  return true;
}

const LABELS: Record<string, string> = { person: "الشخص", project: "المشروع", client: "العميل", amount: "المبلغ", amount_egp: "المبلغ", action: "الأمر", role: "الدور", title: "الدور", fee: "الأجر", people: "الناس", type: "النوع", pct: "النسبة", reason: "السبب", decision: "القرار", key: "الإعداد", value: "القيمة", kind: "النوع", name: "الاسم", label: "الدفعة", note: "ملاحظة", username: "اسم الدخول", new_title: "الاسم الجديد" };
function describe(name: string, args: Record<string, unknown>) {
  const parts = Object.entries(args).filter(([k, v]) => k !== "confirmed" && v !== undefined && v !== "" && LABELS[k]).map(([k, v]) => `${LABELS[k]}: ${Array.isArray(v) ? v.join("، ") : String(v)}`);
  return `${SENSITIVE[name]}${parts.length ? " — " + parts.join(" · ") : ""}`.slice(0, 400);
}

export async function propose(u: SessionUser, name: string, args: Record<string, unknown>) {
  const summary = describe(name, args);
  const [p] = await db.insert(assistantPending).values({ userId: u.id, tool: name, argsJson: JSON.stringify(args), summary }).returning();
  await audit(u.id, "assistant_propose", summary);
  return { id: p.id, summary };
}

/** Run a proposed action after the admin clicked confirm. Only the same admin, within 30 minutes, once. */
export async function confirmPending(u: SessionUser, id: string, run: (name: string, args: Record<string, unknown>) => Promise<unknown>) {
  if (u.role !== "ADMIN") throw new Error("غير مسموح.");
  const since = new Date(Date.now() - 30 * 60000);
  const [p] = await db.update(assistantPending).set({ status: "RUNNING" })
    .where(and(eq(assistantPending.id, id), eq(assistantPending.userId, u.id), eq(assistantPending.status, "PENDING"), gt(assistantPending.createdAt, since))).returning();
  if (!p) throw new Error("الطلب ده اتنفذ قبل كده أو انتهت صلاحيته (30 دقيقة). اطلبه تاني.");
  const args = JSON.parse(p.argsJson) as Record<string, unknown>;
  if (PREVIEW_ONLY.has(p.tool) || p.tool === "employee_account") args.confirmed = true;
  try {
    const result = await run(p.tool, args);
    const text = JSON.stringify(result).slice(0, 4000);
    await db.update(assistantPending).set({ status: "DONE", result: text }).where(eq(assistantPending.id, id));
    await audit(u.id, "assistant_confirmed", p.summary);
    return { summary: p.summary, result };
  } catch (e) {
    await db.update(assistantPending).set({ status: "PENDING" }).where(eq(assistantPending.id, id));
    throw e;
  }
}

export async function cancelPending(u: SessionUser, id: string) {
  await db.update(assistantPending).set({ status: "CANCELLED" }).where(and(eq(assistantPending.id, id), eq(assistantPending.userId, u.id), eq(assistantPending.status, "PENDING")));
}

export async function logConfirmation(u: SessionUser, text: string) {
  await db.insert(assistantMessages).values({ userId: u.id, role: "assistant", content: text });
}
