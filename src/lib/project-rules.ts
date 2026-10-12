// Deduction rules per project. Every project can override the defaults from Settings.
export const RULE_KEYS = ["latePctPerDay", "lateMaxPct", "graceHours", "reworkPct", "noReplyPct", "clientLossPct", "clientRefusePct"] as const;
export type RuleKey = (typeof RULE_KEYS)[number];
export type ProjectRules = Record<RuleKey, number> & { banOnLoss: boolean; banOnRefuse: boolean };

export const RULE_LABEL: Record<RuleKey, { label: string; hint?: string; unit: string; max: number }> = {
  latePctPerDay: { label: "خصم التأخير لكل يوم", unit: "%", max: 100 },
  lateMaxPct: { label: "أقصى خصم للتأخير", unit: "%", max: 100 },
  graceHours: { label: "وقت السماح بعد المعاد", hint: "قبل ما خصم التأخير يبدأ", unit: "ساعة", max: 168 },
  reworkPct: { label: "رجوع شغل فيه أخطاء", hint: "لكل مرة", unit: "%", max: 100 },
  noReplyPct: { label: "عدم الرد", hint: "بعد التحذير", unit: "%", max: 100 },
  clientLossPct: { label: "خسارة عميل", unit: "%", max: 100 },
  clientRefusePct: { label: "رفض العميل الإعادة", unit: "%", max: 100 },
};

export function defaultsFrom(settings: Record<string, unknown>): ProjectRules {
  const r = Object.fromEntries(RULE_KEYS.map((k) => [k, Number(settings[k] ?? 0) || 0])) as Record<RuleKey, number>;
  return { ...r, banOnLoss: true, banOnRefuse: true };
}

/** Project rules = Settings defaults, overridden by whatever the owner set on this project. */
export function rulesFor(dedRules: string | null | undefined, settings: Record<string, unknown>): ProjectRules {
  const base = defaultsFrom(settings);
  if (!dedRules) return base;
  try {
    const o = JSON.parse(dedRules) as Partial<ProjectRules>;
    const out = { ...base };
    for (const k of RULE_KEYS) if (typeof o[k] === "number" && Number.isFinite(o[k])) out[k] = o[k] as number;
    if (typeof o.banOnLoss === "boolean") out.banOnLoss = o.banOnLoss;
    if (typeof o.banOnRefuse === "boolean") out.banOnRefuse = o.banOnRefuse;
    return out;
  } catch { return base; }
}

/** Read the rules fields from a form. Returns the JSON to store, or an error. */
export function readRules(fd: FormData): { json?: string; error?: string } {
  const o: Record<string, number | boolean> = {};
  for (const k of RULE_KEYS) {
    const raw = String(fd.get("r_" + k) ?? "").trim();
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > RULE_LABEL[k].max) return { error: `${RULE_LABEL[k].label}: لازم يكون من 0 لـ ${RULE_LABEL[k].max}.` };
    o[k] = Math.round(n * 100) / 100;
  }
  if ((o.lateMaxPct as number) < (o.latePctPerDay as number)) return { error: "أقصى خصم للتأخير لازم يكون أكبر من أو يساوي خصم اليوم الواحد." };
  o.banOnLoss = fd.get("r_banOnLoss") === "on";
  o.banOnRefuse = fd.get("r_banOnRefuse") === "on";
  return { json: JSON.stringify(o) };
}
export const DED_TO_KEY = { REWORK: "reworkPct", NO_REPLY: "noReplyPct", CLIENT_LOSS: "clientLossPct", CLIENT_REFUSE: "clientRefusePct" } as const;
