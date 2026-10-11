import { requireUser } from "@/lib/auth";
import { eq, count, sum } from "drizzle-orm";
import { db, users, suppliers, fixedCosts, clients } from "@/lib/db";
import { and, asc, isNotNull, notInArray } from "drizzle-orm";
import Link from "next/link";
import { STAGES } from "@/lib/labels";
export default async function Home() {
  const u = await requireUser();
  const admin = u.role === "ADMIN";
  const [members, supplierCount, fixed] = admin ? await Promise.all([
    db.select({ n: count() }).from(users).where(eq(users.active, true)).then((r) => r[0].n),
    db.select({ n: count() }).from(suppliers).then((r) => r[0].n),
    db.select({ s: sum(fixedCosts.amountEgp) }).from(fixedCosts).where(eq(fixedCosts.active, true)).then((r) => Number(r[0].s ?? 0)),
  ]) : [0, 0, 0];
  return (<>
    <div className="head"><div><span className="tag">الرئيسية</span><h1>أهلاً {u.name}</h1><p className="sub">لوحة متابعة MEVIX.</p></div></div>
    {admin && <div className="grid">
      <div className="stat"><b>{members}</b><span>موظف نشط</span></div>
      <div className="stat"><b>{supplierCount}</b><span>خدمة مسجلة عند الموردين</span></div>
      <div className="stat"><b className="num">{fixed.toLocaleString("en-US")} ج</b><span>المصاريف الثابتة شهرياً</span></div>
    </div>}
    {admin && <FollowUps />}
  </>);
}

async function FollowUps() {
  const rows = await db.select().from(clients).where(and(isNotNull(clients.nextDate), notInArray(clients.stage, ["LOST", "DONE"]))).orderBy(asc(clients.nextDate)).limit(12);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return (<section className="card"><h2>متابعات العملاء الجاية</h2>
    {rows.length ? rows.map((c) => <div key={c.id} className="actions" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBlock: 8 }}>
      <span><Link href={`/clients/${c.id}`}><b>{c.name}</b></Link> · {c.nextStep || STAGES[c.stage]}</span>
      <span className={c.nextDate! < t ? "pill bad" : "pill info"}>{c.nextDate!.toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" })}</span></div>)
      : <p className="sub">مفيش متابعات متحددة. سجّل الخطوة الجاية وموعدها من صفحة العميل.</p>}
  </section>);
}
