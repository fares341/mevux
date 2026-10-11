import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db, users, payouts, fundSpends, fixedCosts } from "@/lib/db";
import { earnings } from "@/lib/projects";
import { egp } from "@/lib/finance";
import { removePayout } from "./actions";
import { PayoutForm, FundForm } from "./forms";

const mkey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const mlabel = (k: string) => new Date(k + "-01").toLocaleDateString("ar-EG", { month: "long", year: "numeric" });

export default async function Finance() {
  await requireAdmin();
  const [{ map, projectsCalc }, team, pays, spends, fixed] = await Promise.all([
    earnings(),
    db.select({ id: users.id, name: users.name, active: users.active }).from(users).orderBy(asc(users.name)),
    db.select().from(payouts).orderBy(desc(payouts.paidAt)),
    db.select().from(fundSpends).orderBy(desc(fundSpends.spentAt)),
    db.select().from(fixedCosts),
  ]);
  const closed = projectsCalc.filter((x) => x.p.status === "CLOSED");
  const sum = (f: (x: (typeof closed)[number]) => number) => closed.reduce((a, x) => a + f(x), 0);
  const fixedMonthly = fixed.filter((f) => f.active).reduce((a, f) => a + f.amountEgp, 0);

  // Months from the first closed project to now: company carries the fixed costs each month.
  const months = new Map<string, { revenue: number; owner: number; company: number; fund: number; n: number }>();
  for (const x of closed) {
    const k = mkey(x.p.closedAt ?? x.p.createdAt);
    const m = months.get(k) ?? { revenue: 0, owner: 0, company: 0, fund: 0, n: 0 };
    m.revenue += x.c.revenue; m.owner += x.c.owner; m.company += x.c.company; m.fund += x.c.fund; m.n++;
    months.set(k, m);
  }
  if (months.size) {
    const first = [...months.keys()].sort()[0];
    for (let d = new Date(first + "-01"); mkey(d) <= mkey(new Date()); d.setMonth(d.getMonth() + 1))
      if (!months.has(mkey(d))) months.set(mkey(d), { revenue: 0, owner: 0, company: 0, fund: 0, n: 0 });
  }
  const monthRows = [...months.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const fixedTotal = fixedMonthly * monthRows.length;
  const fundIn = sum((x) => x.c.fund), fundOut = spends.reduce((a, s) => a + s.amountEgp, 0);
  const paidBy = (uid: string) => pays.filter((p) => p.userId === uid).reduce((a, p) => a + p.amountEgp, 0);
  const people = team.map((u) => { const e = map.get(u.id); const paid = paidBy(u.id); return { ...u, expected: e?.expected ?? 0, entitled: e?.entitled ?? 0, deducted: e?.deducted ?? 0, paid, due: (e?.entitled ?? 0) - paid }; })
    .filter((u) => u.active || u.entitled || u.paid);
  const name = (id: string) => team.find((u) => u.id === id)?.name || "—";
  const pname = (id: string | null) => projectsCalc.find((x) => x.p.id === id)?.p.name;

  return (<>
    <div className="head"><div><span className="tag">الإدارة</span><h1>المالية</h1><p className="sub">الأرقام بالجنيه. المشاريع بتتحسب في الأرباح لما تتقفل (العميل وافق ودفع).</p></div></div>
    <div className="grid">
      <div className="stat"><b className="num">{egp(sum((x) => x.c.revenue))}</b><span>دخل المشاريع المقفولة</span></div>
      <div className="stat"><b className="num">{egp(sum((x) => x.c.owner))}</b><span>دخلك</span></div>
      <div className="stat"><b className="num">{egp(sum((x) => x.c.company) - fixedTotal)}</b><span>خزنة الشركة بعد المصاريف الثابتة</span></div>
      <div className="stat"><b className="num">{egp(fundIn - fundOut)}</b><span>رصيد صندوق الاشتراكات</span></div>
      <div className="stat"><b className="num">{egp(people.reduce((a, p) => a + Math.max(0, p.due), 0))}</b><span>مستحق للفريق ولسه ما اتصرفش</span></div>
    </div>

    <section className="card"><h2>الفريق</h2><div className="table-wrap"><table>
      <thead><tr><th>الشخص</th><th>متوقع (مشاريع شغالة)</th><th>مستحق (مشاريع مقفولة)</th><th>اتصرف</th><th>الباقي له</th><th>إجمالي الخصومات</th></tr></thead>
      <tbody>{people.map((u) => <tr key={u.id}><td><b>{u.name}</b></td><td className="num">{egp(u.expected)}</td><td className="num">{egp(u.entitled)}</td><td className="num">{egp(u.paid)}</td>
        <td><b className="num" style={{ color: u.due > 0 ? "var(--warn)" : undefined }}>{egp(u.due)}</b></td><td className="num">{u.deducted ? egp(u.deducted) : "—"}</td></tr>)}</tbody></table></div>
      <h2 style={{ marginTop: 18 }}>تسجيل صرف لموظف</h2>
      <PayoutForm people={people.map((u) => ({ id: u.id, name: u.name, due: u.due }))} projects={projectsCalc.map((x) => ({ id: x.p.id, name: x.p.name }))} />
      {pays.length > 0 && <details style={{ marginTop: 14 }}><summary>سجل الصرف ({pays.length})</summary><div className="table-wrap" style={{ marginTop: 10 }}><table>
        <thead><tr><th>التاريخ</th><th>الشخص</th><th>المشروع</th><th>المبلغ</th><th>ملاحظة</th><th></th></tr></thead>
        <tbody>{pays.map((p) => <tr key={p.id}><td>{p.paidAt.toLocaleDateString("ar-EG")}</td><td>{name(p.userId)}</td><td>{pname(p.projectId) || "—"}</td><td className="num">{egp(p.amountEgp)}</td><td>{p.note || "—"}</td>
          <td><form action={removePayout}><input type="hidden" name="id" value={p.id} /><button className="sm ghost">حذف</button></form></td></tr>)}</tbody></table></div></details>}
    </section>

    <section className="card"><h2>شهر بشهر</h2>
      {monthRows.length ? <div className="table-wrap"><table>
        <thead><tr><th>الشهر</th><th>مشاريع اتقفلت</th><th>الدخل</th><th>دخلك</th><th>نصيب الشركة</th><th>مصاريف ثابتة</th><th>الشركة بعد المصاريف</th></tr></thead>
        <tbody>{monthRows.map(([k, m]) => <tr key={k}><td>{mlabel(k)}</td><td className="num">{m.n}</td><td className="num">{egp(m.revenue)}</td><td className="num">{egp(m.owner)}</td><td className="num">{egp(m.company)}</td><td className="num">{egp(fixedMonthly)}</td>
          <td><b className="num" style={{ color: m.company - fixedMonthly < 0 ? "var(--bad)" : undefined }}>{egp(m.company - fixedMonthly)}</b></td></tr>)}</tbody></table></div>
        : <p className="sub">لسه مفيش مشاريع مقفولة.</p>}
    </section>

    <section className="card"><h2>صندوق الاشتراكات · <span className="num">{egp(fundIn - fundOut)}</span> ج</h2>
      <p className="sub" style={{ marginTop: -6 }}>داخل <span className="num">{egp(fundIn)}</span> ج من المشاريع المقفولة، وخارج <span className="num">{egp(fundOut)}</span> ج.</p>
      {spends.map((s) => <div key={s.id} className="sub">{s.spentAt.toLocaleDateString("ar-EG")} · {s.name} · <span className="num">{egp(s.amountEgp)}</span> ج</div>)}
      <div style={{ marginTop: 12 }}><FundForm /></div>
    </section>

    <section className="card plain"><h2>المشاريع المقفولة</h2>{closed.length ? closed.map((x) => <div key={x.p.id}><Link href={`/projects/${x.p.id}`}>{x.p.name}</Link> · <span className="num">{egp(x.c.net)}</span> ج صافي</div>) : <p className="sub">لا يوجد.</p>}</section>
  </>);
}
