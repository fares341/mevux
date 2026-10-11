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
export const stageLabel = (c: { stage: Stage; customStage?: string | null }) => c.customStage || STAGES[c.stage];
export const KINDS = { AUTOMATION: "أوتوميشن", CHATBOT: "شات بوت / وكيل AI", WEBSITE: "موقع", APP: "تطبيق", SAAS: "SaaS", DASHBOARD: "داشبورد / نظام" } as const;
export const KINDS_EN: Record<string, string> = { AUTOMATION: "Automation", CHATBOT: "Chatbot / AI agent", WEBSITE: "Website", APP: "App", SAAS: "SaaS", DASHBOARD: "Dashboard / system" };
export const ASSET_KINDS = { WEBSITE: "موقع", APP: "تطبيق", SAAS: "SaaS", SERVER: "سيرفر / استضافة", DOMAIN: "دومين", OTHER: "أخرى" } as const;
export const ASSET_KINDS_EN: Record<string, string> = { WEBSITE: "Website", APP: "App", SAAS: "SaaS", SERVER: "Server / hosting", DOMAIN: "Domain", OTHER: "Other" };
export const PAID_BY = { CLIENT: "العميل بيدفعها", US: "إحنا بندفعها", INCLUDED: "ضمن الاشتراك" } as const;
export const PAID_BY_EN: Record<string, string> = { CLIENT: "paid by the client", US: "paid by MEVIX", INCLUDED: "included in the subscription" };
