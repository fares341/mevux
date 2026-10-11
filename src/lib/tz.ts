// Company time is Cairo. Forms send "YYYY-MM-DDTHH:mm" with no zone; interpret it as Cairo time.
export const TZ = "Africa/Cairo";
export function cairoToDate(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h = "23", mi = "59"] = m.slice(1);
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  // offset of Cairo at that moment (handles summer time)
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asCairo = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return new Date(guess - (asCairo - guess));
}
/** Date → "YYYY-MM-DDTHH:mm" in Cairo time, for <input type="datetime-local">. */
export function dateToCairoInput(d: Date | null | undefined): string {
  if (!d) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}
export const fmtCairo = (d: Date | null | undefined, withTime = true) => d ? d.toLocaleString("ar-EG", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}) }) : "—";
