import { cutoff, lateDaysFor } from "./finance";

type WO = { issuedAt: Date | null; acceptedAt: Date | null; deliveredAt: Date | null; reviewStatus: string | null; extStatus: string | null; deadlineAt: Date | null; dueDate: Date | null; graceHours: number | null; reworkDueAt?: Date | null };
export type WOState = "DRAFT" | "SENT" | "WORKING" | "LATE" | "SUBMITTED" | "REWORK" | "DONE";
export const WO_LABEL: Record<WOState, string> = { DRAFT: "لسه ما اتبعتش", SENT: "مستني يستلم", WORKING: "شغال", LATE: "متأخر", SUBMITTED: "سلّم ومستني مراجعة", REWORK: "محتاج تعديل", DONE: "اتقبل" };
export const WO_PILL: Record<WOState, string> = { DRAFT: "", SENT: "warn", WORKING: "info", LATE: "bad", SUBMITTED: "info", REWORK: "warn", DONE: "ok" };

export function woState(r: WO, now = new Date()): WOState {
  if (r.reviewStatus === "ACCEPTED") return "DONE";
  if (r.reviewStatus === "REWORK") return "REWORK";
  if (r.reviewStatus === "PENDING" || (r.deliveredAt && !r.issuedAt)) return r.deliveredAt && !r.issuedAt ? "DONE" : "SUBMITTED";
  if (!r.issuedAt) return "DRAFT";
  if (!r.acceptedAt) return "SENT";
  const c = cutoff(r);
  return c && now > c ? "LATE" : "WORKING";
}
export { lateDaysFor, cutoff };
