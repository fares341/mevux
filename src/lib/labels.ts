export const BILLING = { MONTHLY: "شهري", YEARLY: "سنوي", PER_MESSAGE: "لكل رسالة", PER_USAGE: "حسب الاستهلاك", ONE_TIME: "مرة واحدة" } as const;
export const STAGES = {
  NEW: "عميل جديد",
  MEETING_SET: "ميتنج متحدد",
  MEETING_DONE: "تم الميتنج",
  BRIEF_SENT: "تم إرسال البريف",
  NEGOTIATION: "تفاوض",
  AGREED: "اتفقنا",
  ACTIVE: "شغالين معاه",
  DONE: "سلّمنا",
  ON_HOLD: "متوقف",
  LOST: "مش هيكمل",
} as const;
export type Stage = keyof typeof STAGES;
export const STAGE_ORDER: Stage[] = ["NEW", "MEETING_SET", "MEETING_DONE", "BRIEF_SENT", "NEGOTIATION", "AGREED", "ACTIVE", "DONE"];
