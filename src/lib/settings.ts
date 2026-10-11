import { inArray } from "drizzle-orm";
import { db, settings } from "./db";

export const DEFAULTS = {
  teamCapPct: "35",
  fundPct: "5",
  ownerPct: "70",
  latePctPerDay: "5",
  lateMaxPct: "25",
  reworkPct: "10",
  noReplyPct: "5",
  clientLossPct: "80",
  clientRefusePct: "100",
  rateSAR: "13",
  rateUSD: "49",
  aiModel: "anthropic/claude-sonnet-4.5",
  aiAudioModel: "google/gemini-2.5-flash",
} as const;
export type SettingKey = keyof typeof DEFAULTS;

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const rows = await db.select().from(settings).where(inArray(settings.key, Object.keys(DEFAULTS)));
  const out = { ...DEFAULTS } as Record<SettingKey, string>;
  for (const r of rows) out[r.key as SettingKey] = r.value;
  return out;
}

export async function setSetting(key: string, value: string) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function getRaw(key: string): Promise<string | null> {
  const r = await db.query.settings.findFirst({ where: (t, { eq }) => eq(t.key, key) });
  return r?.value ?? null;
}
