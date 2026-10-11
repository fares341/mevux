import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, projects, projectRoles, clients, clientEvents, installments, suppliers } from "./db";
import { chat } from "./ai";
import { BILLING } from "./labels";

export type Lang = "ar" | "en";

// ---------- facts from the database (numbers never come from the AI) ----------
export async function briefFacts(projectId: string, supplierIds: string[]) {
  const p = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!p) throw new Error("المشروع غير موجود.");
  const [roles, client, plan, sups] = await Promise.all([
    db.select().from(projectRoles).where(eq(projectRoles.projectId, p.id)).orderBy(asc(projectRoles.createdAt)),
    p.clientId ? db.query.clients.findFirst({ where: eq(clients.id, p.clientId) }) : Promise.resolve(undefined),
    db.select().from(installments).where(and(eq(installments.projectId, p.id))).orderBy(asc(installments.sort)),
    supplierIds.length ? db.select().from(suppliers).where(inArray(suppliers.id, supplierIds)) : Promise.resolve([]),
  ]);
  const notes = client ? await db.select().from(clientEvents).where(eq(clientEvents.clientId, client.id)).orderBy(desc(clientEvents.createdAt)).limit(15) : [];
  const weeks = p.startDate && p.dueDate ? Math.max(1, Math.round((+p.dueDate - +p.startDate) / (7 * 864e5))) : null;
  return { p, roles, client, plan, sups, notes, weeks };
}
export type Facts = Awaited<ReturnType<typeof briefFacts>>;

// ---------- AI writes the words only ----------
const Content = z.object({
  title1: z.string().max(60), title2: z.string().max(60).default(""),
  tagline: z.array(z.string().max(40)).min(1).max(3),
  intro: z.string().max(320),
  findings: z.array(z.object({ tag: z.string().max(40), title: z.string().max(80), text: z.string().max(330) })).max(4).default([]),
  tracks: z.array(z.object({
    tag: z.string().max(40), title: z.string().max(70), lead: z.string().max(200).default(""),
    items: z.array(z.object({ title: z.string().max(70), text: z.string().max(260).default(""), bullets: z.array(z.string().max(160)).max(4).default([]) })).min(1).max(4),
    output: z.string().max(220).default(""),
  })).min(1).max(2),
  flow: z.array(z.object({ title: z.string().max(50), text: z.string().max(140) })).max(3).default([]),
  highlight: z.object({ title: z.string().max(70), text: z.string().max(260) }).optional(),
  scope: z.string().max(220).default(""),
});
export type BriefContent = z.infer<typeof Content>;

export async function writeBrief(f: Facts, lang: Lang, extra: string): Promise<BriefContent> {
  const facts = {
    project: f.p.name, client: f.client?.name ?? f.p.client, company: f.client?.company, need: f.client?.need,
    description: f.p.description, size: f.p.size,
    roles: f.roles.map((r) => ({ role: r.title, scope: r.scope, deliverables: r.deliverables })),
    meetingNotes: f.notes.map((n) => n.note).filter(Boolean),
  };
  const sys = `You write the content of a client-facing project brief for MEVIX AI, an automation agency.
Write in ${lang === "ar" ? "Modern Standard Arabic suitable for Gulf/Egyptian business clients" : "clear professional English"}.
Return ONLY a JSON object with keys: title1, title2, tagline (array of 3 short phrases), intro, findings (up to 4 {tag,title,text} describing the client's current problems), tracks (1-2 work tracks {tag,title,lead,items:[{title,text,bullets[]}],output}), flow (up to 3 steps {title,text}), highlight {title,text} (the most valuable deliverable), scope (one sentence).
Rules: use only facts provided; never write prices, amounts, percentages of money, or dates (they are added separately); keep every field within its length; concrete and specific, no filler.`;
  const user = `FACTS:\n${JSON.stringify(facts, null, 1)}\n\nEXTRA CONTEXT FROM THE OWNER:\n${extra || "(none)"}`;
  const m = await chat([{ role: "system", content: sys }, { role: "user", content: user }], undefined, { json: true, maxTokens: 3500 });
  const raw = (m?.content || "").replace(/^```json\s*|```$/g, "");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("الموديل رجّع رد مش مفهوم. جرّب تاني أو غيّر الموديل من الإعدادات."); }
  const r = Content.safeParse(trimDeep(parsed));
  if (!r.success) throw new Error("محتوى البريف ناقص: " + r.error.issues[0].path.join("."));
  return r.data;
}
// Clip over-long strings instead of failing the whole brief.
function trimDeep(v: unknown, max = 330): unknown {
  if (typeof v === "string") return v.slice(0, max);
  if (Array.isArray(v)) return v.map((x) => trimDeep(x, max));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trimDeep(x, k === "title1" || k === "title2" ? 60 : k === "tag" ? 40 : max)]));
  return v;
}

// ---------- template (same identity as the original brief) ----------
const L = {
  ar: { dir: "rtl", kind: "العرض الفني والتجاري", cover: "بريف المشروع · العرض الفني والتجاري", for: "مُعدّ خصيصاً لـ", weeks: "أسابيع", duration: "مدة التنفيذ والتسليم المرحلي", fee: "التنفيذ والتطوير الشامل", monthly: "تشغيل الخدمات بشكل منفصل",
    s1: "الوضع الحالي", s1t: "الملاحظات التشغيلية", s2: "نطاق العمل", s4: "خطة التنفيذ", s4t: "التسليم المرحلي", s5: "العرض التجاري", s5t: "التكاليف وطريقة الدفع",
    output: "مخرج التسليم لهذا المسار", flow: "مسار العمل", total: "الإجمالي", payment: "الدفعة", amount: "المبلغ", when: "موعد الاستحقاق", feeTitle: "رسوم التنفيذ والتطوير الشاملة", feeNote: "إجمالي تنفيذ وتطوير نطاق العمل الموضح في هذا العرض.",
    ops: "التكلفة التشغيلية", opsNote: "تُدفع لمزودي الخدمات مباشرة، ومنفصلة عن رسوم التنفيذ.", service: "الخدمة", price: "السعر", scope: "نطاق المشروع", durationLine: "مدة التنفيذ", footer: "عرض مشروع لـ", cur: { EGP: "جنيه مصري", SAR: "ريال سعودي", USD: "دولار" } as Record<string, string>, curShort: { EGP: "ج", SAR: "ريال", USD: "$" } as Record<string, string> },
  en: { dir: "ltr", kind: "Technical & Commercial Proposal", cover: "Project Brief · Technical & Commercial Proposal", for: "Prepared for", weeks: "weeks", duration: "Delivery timeline", fee: "Full implementation", monthly: "Separate running costs",
    s1: "Current state", s1t: "Operational findings", s2: "Scope of work", s4: "Delivery plan", s4t: "Phased delivery", s5: "Commercial offer", s5t: "Pricing & payment terms",
    output: "Deliverable for this track", flow: "How it works", total: "Total", payment: "Payment", amount: "Amount", when: "Due", feeTitle: "Total implementation fee", feeNote: "Covers the full scope described in this proposal.",
    ops: "Running costs", opsNote: "Paid directly to the providers, separate from the implementation fee.", service: "Service", price: "Price", scope: "Project scope", durationLine: "Timeline", footer: "Proposal for", cur: { EGP: "EGP", SAR: "SAR", USD: "USD" } as Record<string, string>, curShort: { EGP: "EGP", SAR: "SAR", USD: "USD" } as Record<string, string> },
};
const BILL_EN: Record<string, string> = { MONTHLY: "monthly", YEARLY: "yearly", PER_MESSAGE: "per message", PER_USAGE: "by usage", ONE_TIME: "one-time" };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const n = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 4 });
const num = (x: string | number) => `<bdi dir="ltr">${esc(x)}</bdi>`;

async function asset(file: string, mime: string) {
  return `data:${mime};base64,${(await readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), "public", file))).toString("base64")}`;
}

export async function renderBrief(c: BriefContent, f: Facts, lang: Lang) {
  const t = L[lang];
  const [logo, f4, f7, f8] = await Promise.all([asset("logo.png", "image/png"), asset("fonts/Tajawal-Regular.ttf", "font/ttf"), asset("fonts/Tajawal-Bold.ttf", "font/ttf"), asset("fonts/Tajawal-ExtraBold.ttf", "font/ttf")]);
  const clientName = f.client?.name ?? f.p.client;
  const branch = f.client?.company || f.p.name;
  const cur = f.p.currency;
  const monthlyUsd = f.sups.filter((s) => s.billing === "MONTHLY");
  const monthlyLine = monthlyUsd.length ? monthlyUsd.map((s) => `${n(s.price)} ${t.curShort[s.currency]}`).join(" + ") + (lang === "ar" ? " / شهر" : " / month") : "";
  const pages: string[] = [];
  let pageNo = 0;
  const page = (inner: string, dark = false) => {
    pageNo++;
    return `<section class="page${dark ? " dark" : ""}"><header><div class="logo"><img src="${logo}"></div><small>${t.kind}<br>${esc(branch)}</small></header><main>${inner}</main><footer><span>MEVIX AI · ${t.footer} ${esc(clientName)}</span>${num(`0${pageNo} / 0__TOTAL__`)}</footer></section>`;
  };

  // 1 cover
  pages.push(page(`<div class="pill pink">${t.cover}</div><h1 class="cover">${esc(c.title1)}${c.title2 ? `<br>${esc(c.title2)}` : ""}</h1>
    <p class="tagline">${c.tagline.map(esc).join(" · ")}</p><p class="lead">${esc(c.intro)}</p>
    <div class="for"><small>${t.for}</small><b>${esc(clientName)}</b>${f.client?.company ? `<small>${esc(f.client.company)}</small>` : ""}</div>
    <div class="kpis">${f.weeks ? `<div><b>${num(f.weeks)} ${t.weeks}</b><span>${t.duration}</span></div>` : ""}<div><b>${num(n(f.p.price))} ${t.curShort[cur]}</b><span>${t.fee}</span></div>${monthlyLine ? `<div><b>${num(monthlyLine)}</b><span>${t.monthly}</span></div>` : ""}</div>`, true));

  // 2 findings
  let sec = 0;
  if (c.findings.length) {
    sec++;
    pages.push(page(`<div class="pill">${num("0" + sec)} · ${t.s1}</div><h1>${t.s1t}</h1>
      ${c.findings.map((x, i) => `<div class="card"><small class="k">${num("0" + (i + 1))} / ${esc(x.tag)}</small><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></div>`).join("")}`));
  }
  // 3..4 tracks
  c.tracks.forEach((tr, i) => {
    sec++;
    const isLast = i === c.tracks.length - 1;
    pages.push(page(`<div class="pill">${num("0" + sec)} · ${esc(tr.tag || t.s2)}</div><h1>${esc(tr.title)}</h1>${tr.lead ? `<p class="sub">${esc(tr.lead)}</p>` : ""}
      ${tr.items.map((it) => `<div class="card"><h3>${esc(it.title)}</h3>${it.text ? `<p>${esc(it.text)}</p>` : ""}${it.bullets.length ? `<ul>${it.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}</div>`).join("")}
      ${isLast && c.flow.length ? `<h2>${t.flow}</h2>${c.flow.map((s, k) => `<div class="step"><span>${num("0" + (k + 1))}</span><div><b>${esc(s.title)}</b><p>${esc(s.text)}</p></div></div>`).join("")}` : ""}
      ${isLast && c.highlight ? `<div class="darkbox"><h3>${esc(c.highlight.title)}</h3><p>${esc(c.highlight.text)}</p></div>` : ""}
      ${tr.output ? `<div class="note"><b>${t.output}</b><p>${esc(tr.output)}</p></div>` : ""}`));
  });
  // plan
  sec++;
  const plan = f.plan;
  pages.push(page(`<div class="pill">${num("0" + sec)} · ${t.s4}</div><h1>${t.s4t}</h1>
    ${f.weeks ? `<h2>${t.durationLine}: ${num(f.weeks)} ${t.weeks}</h2>` : ""}
    ${f.roles.map((r, k) => `<div class="step"><span>${num("0" + (k + 1))}</span><div><b>${esc(r.title)}</b><p>${esc(r.deliverables || r.scope || "")}</p></div></div>`).join("")}
    ${plan.length ? `<h2>${t.payment}</h2>${plan.map((x, k) => `<div class="step"><span>${num("0" + (k + 1))}</span><div><b>${esc(x.label)}</b><p>${esc(x.dueNote || "")}</p></div></div>`).join("")}` : ""}
    ${c.scope ? `<div class="note"><b>${t.scope}</b><p>${esc(c.scope)}</p></div>` : ""}`));
  // pricing
  sec++;
  const rows = plan.length ? plan.map((x) => `<tr><td>${esc(x.label)}</td><td>${num(n(x.amount))} ${t.curShort[x.currency]}</td><td>${esc(x.dueNote || "")}</td></tr>`).join("") : "";
  pages.push(page(`<div class="pill">${num("0" + sec)} · ${t.s5}</div><h1>${t.s5t}</h1>
    <div class="card fee"><small class="k">${t.feeTitle}</small><div class="big">${num(n(f.p.price))} <span>${t.cur[cur]}</span></div><p>${t.feeNote}</p></div>
    ${rows ? `<table><thead><tr><th>${t.payment}</th><th>${t.amount}</th><th>${t.when}</th></tr></thead><tbody>${rows}<tr class="tot"><td>${t.total}</td><td>${num(n(f.p.price))} ${t.curShort[cur]}</td><td></td></tr></tbody></table>` : ""}
    ${f.sups.length ? `<h2>${t.ops}</h2><table><thead><tr><th>${t.service}</th><th>${t.price}</th></tr></thead><tbody>${f.sups.map((s) => `<tr><td>${esc(s.provider)} · ${esc(s.item)}${s.details ? `<br><small>${esc(s.details)}</small>` : ""}</td><td>${num(n(s.price))} ${t.curShort[s.currency]} · ${lang === "ar" ? BILLING[s.billing] : BILL_EN[s.billing]}</td></tr>`).join("")}</tbody></table><p class="sub">${t.opsNote}</p>` : ""}`));

  const TOTAL = pages.length;
  const body = pages.join("").replaceAll("__TOTAL__", String(TOTAL));
  return `<!DOCTYPE html><html lang="${lang}" dir="${t.dir}"><head><meta charset="utf-8"><style>
@font-face{font-family:Tajawal;font-weight:400;src:url(${f4})}@font-face{font-family:Tajawal;font-weight:700;src:url(${f7})}@font-face{font-family:Tajawal;font-weight:800;src:url(${f8})}
:root{--navy:#152B7B;--deep:#0B1743;--blue:#168FE3;--cyan:#20C6EA;--pink:#E6197F;--ink:#14213D;--muted:#5C6882;--pale:#F4F7FC;--line:#D9E1F0;--light:#EAF5FD}
*{box-sizing:border-box}body{margin:0;font-family:Tajawal,sans-serif;color:var(--ink)}@page{size:A4;margin:0}
.page{width:210mm;height:297mm;padding:16mm 17mm 0;position:relative;overflow:hidden;page-break-after:always;background:#fff}
.page.dark{background:var(--deep);color:#fff}
header{height:24mm;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid var(--line)}.dark header{border-color:rgba(255,255,255,.18)}
header .logo{width:40mm}.dark header .logo{background:#fff;border-radius:3px;padding:2mm}header img{width:100%;display:block}
header small{font-size:10px;color:var(--muted);line-height:1.9}.dark header small{color:#C9D3EE}
main{padding-top:8mm}
.pill{display:inline-block;background:var(--blue);color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px}.pill.pink{background:var(--pink);margin-top:14mm}
h1{font-size:30px;font-weight:800;color:var(--navy);margin:12px 0 10px;line-height:1.35}.cover{font-size:42px;color:#fff;margin:9mm 0 6mm}
.tagline{color:var(--cyan);font-size:20px;font-weight:700;margin:0 0 8mm}.lead{font-size:15px;line-height:2;color:#E3E8F6;max-width:165mm}
.for{border-inline-start:3px solid var(--pink);padding-inline-start:12px;margin-top:14mm;display:flex;flex-direction:column;gap:6px}.for small{color:#C9D3EE;font-size:12px}.for b{font-size:22px}
.kpis{position:absolute;bottom:26mm;left:17mm;right:17mm;border-top:1px solid rgba(255,255,255,.18);padding-top:8mm;display:flex;gap:10mm}.kpis div{flex:1}.kpis b{display:block;color:var(--cyan);font-size:19px;font-weight:800}.kpis span{font-size:12px;color:#C9D3EE}
h2{font-size:18px;color:var(--navy);margin:14px 0 8px}h3{font-size:16px;color:var(--navy);margin:0 0 6px;font-weight:800}
p{font-size:13.5px;line-height:1.9;margin:4px 0}.sub{color:var(--muted);font-size:13px}
.card{background:var(--pale);border:1px solid var(--line);border-top:3px solid var(--blue);border-radius:5px;padding:12px 16px;margin:10px 0}
.k{display:block;color:var(--blue);font-size:12px;font-weight:700;margin-bottom:4px}
ul{margin:4px 0;padding-inline-start:18px}li{font-size:13.5px;line-height:1.9}
.step{display:flex;gap:12px;align-items:flex-start;border-bottom:1px solid var(--line);padding:10px 0}.step>span{background:var(--blue);color:#fff;font-size:11px;font-weight:700;border-radius:3px;padding:5px 7px}.step b{color:var(--navy);font-size:15px}
.darkbox{background:var(--deep);color:#fff;border-radius:5px;padding:14px 18px;margin-top:12px}.darkbox h3{color:#fff}.darkbox p{color:#E3E8F6}
.note{background:var(--light);border-inline-start:3px solid var(--cyan);padding:10px 16px;margin-top:12px}.note b{color:var(--navy)}
.fee .big{font-size:36px;font-weight:800;color:var(--navy)}.fee .big span{font-size:18px}
table{width:100%;border-collapse:collapse;font-size:13px;margin:10px 0}th{background:var(--navy);color:#fff;padding:9px 12px;text-align:start}td{padding:9px 12px;border-bottom:1px solid var(--line)}tbody tr:nth-child(even){background:var(--pale)}tr.tot td{font-weight:800}td small{color:var(--muted)}
footer{position:absolute;bottom:11mm;left:17mm;right:17mm;border-top:1px solid var(--line);padding-top:9px;display:flex;justify-content:space-between;font-size:9px;color:var(--muted)}.dark footer{border-color:rgba(255,255,255,.18);color:#9AA6CC}
.tight p,.tight li{font-size:12px;line-height:1.7}.tight .card{padding:9px 13px;margin:7px 0}.tight h1{font-size:26px;margin:8px 0 6px}
.tighter p,.tighter li{font-size:11px;line-height:1.6}.tighter .card{padding:7px 11px;margin:5px 0}.tighter h3{font-size:14px}
bdi{unicode-bidi:isolate}
</style></head><body>${body}</body></html>`;
}

/** HTML → PDF with headless Chromium; shrinks text on any page that would overflow its footer. */
export async function toPdf(html: string): Promise<Buffer> {
  const { chromium } = await import("playwright-core");
  const { existsSync } = await import("fs");
  const exe = [process.env.CHROMIUM_PATH, "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((x) => x && existsSync(x));
  if (!exe) throw new Error("Chromium مش متركب على السيرفر، فمش هقدر أعمل PDF.");
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      const over = (s: Element) => { const m = s.querySelector("main")!, f = s.querySelector("footer")!; return m.getBoundingClientRect().bottom > f.getBoundingClientRect().top - 6; };
      for (const s of document.querySelectorAll(".page:not(.dark)")) { if (over(s)) s.classList.add("tight"); if (over(s)) s.classList.add("tighter"); }
    });
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
  } finally { await browser.close(); }
}
