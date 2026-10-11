import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db, users, payouts, fundSpends, fixedCosts } from "@/lib/db";
import { earnings } from "@/lib/projects";
import { egp } from "@/lib/finance";
import { removePayout, removeExpense } from "./actions";
import { PayoutForm, FundForm, ExpenseForm } from "./forms";
import { cashflow } from "@/lib/cashflow";

const mkey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const mlabel = (k: string) => new Date(k + "-01").toLocaleDateString("ar-EG", { month: "long", year: "numeric" });

export default async function Finance() {
  await requireAdmin();
  const [{ map, projectsCalc }, team, pays, spends, fixed, cf] = await Promise.all([
    earnings(),
    db.select({ id: users.id, name: users.name, active: users.active }).from(users).orderBy(asc(users.name)),
    db.select().from(payouts).orderBy(desc(payouts.paidAt)),
    db.select().from(fundSpends).orderBy(desc(fundSpends.spentAt)),
    db.select().from(fixedCosts),
    cashflow(12),
  ]);
  const cur = cf.months[cf.months.length - 1];
  const yr = cf.months.reduce((a, m) => ({ income: a.income + m.income, out: a.out + m.out, net: a.net + m.net }), { income: 0, out: 0, net: 0 });
  const CATS: Record<string, string> = { ADS: "إعلانات", TOOLS: "أدوات", SALARIES: "رواتب", OTHER: "أخرى" };
  const CURS: Record<string, string> = { EGP: "ج", SAR: "ريال", USD: "$" };
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
    <h2>الشهر ده · {mlabel(cur.key)}</h2>
    <div className="grid">
      <div className="stat"><b className="num">{egp(cur.income)}</b><span>دخل فعلي (فلوس وصلت)</span></div>
      <div className="stat"><b className="num">{egp(cur.out)}</b><span>صرفنا</span></div>
      <div className="stat" style={{ borderBottomColor: cur.net < 0 ? "var(--bad)" : "var(--ok)" }}><b className="num" style={{ color: cur.net < 0 ? "var(--bad)" : undefined }}>{egp(cur.net)}</b><span>كسبنا (الدخل − المصروف)</span></div>
      <div className="stat"><b className="num">{egp(cf.mrr)}</b><span>الاشتراكات الشهرية · {cf.subs.length} عميل</span></div>
    </div>

    <section className="card"><h2>الاشتراكات الشهرية · <span className="num">{egp(cf.mrr)}</span> ج في الشهر</h2>
      {cf.subs.length ? <div className="table-wrap"><table>
        <thead><tr><th>المشروع</th><th>العميل</th><th>الاشتراك</th><th>بالجنيه</th><th>الشهر ده</th><th>آخر دفعة</th><th>إجمالي اللي دفعه</th></tr></thead>
        <tbody>{cf.subs.map((x) => <tr key={x.id}><td><Link href={`/projects/${x.id}`}><b>{x.name}</b></Link></td><td>{x.client}</td>
          <td><span className="num">{egp(x.fee)}</span> {CURS[x.currency]}</td><td className="num">{egp(x.feeEgp)}</td>
          <td>{x.paidThisMonth ? <span className="pill ok">دفع</span> : <span className="pill bad">لسه</span>}</td>
          <td className="sub">{x.lastPaid ? x.lastPaid.toLocaleDateString("ar-EG") : "—"}</td><td className="num">{egp(x.totalEgp)}</td></tr>)}</tbody></table></div>
        : <p className="sub">مفيش مشاريع باشتراك شهري. اختار "اشتراك شهري ثابت" في نوع التعاقد لما تعمل المشروع.</p>}
      <p className="sub">دفعة الاشتراك بتتسجل من صفحة المشروع (دفعات العميل) أو قول للمساعد: "شركة الأمل دفعت اشتراك الشهر".</p>
    </section>

    <section className="card"><h2>شهر بشهر: دخلنا كام وصرفنا كام</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>الشهر</th><th>الدخل</th><th>منه اشتراكات</th><th>تكاليف مشاريع</th><th>صرف للفريق</th><th>مصاريف ثابتة</th><th>مصروفات</th><th>من الصندوق</th><th>إجمالي المصروف</th><th>الصافي</th></tr></thead>
        <tbody>{[...cf.months].reverse().map((m) => <tr key={m.key}><td>{mlabel(m.key)}</td><td className="num">{egp(m.income)}</td><td className="num">{m.subs ? egp(m.subs) : "—"}</td>
          <td className="num">{egp(m.projectCosts)}</td><td className="num">{egp(m.team)}</td><td className="num">{egp(m.fixed)}</td><td className="num">{egp(m.expenses)}</td><td className="num">{egp(m.fund)}</td>
          <td className="num">{egp(m.out)}</td><td><b className="num" style={{ color: m.net < 0 ? "var(--bad)" : "var(--ok)" }}>{egp(m.net)}</b></td></tr>)}
          <tr><td><b>الإجمالي</b></td><td><b className="num">{egp(yr.income)}</b></td><td colSpan={6}></td><td><b className="num">{egp(yr.out)}</b></td><td><b className="num" style={{ color: yr.net < 0 ? "var(--bad)" : "var(--ok)" }}>{egp(yr.net)}</b></td></tr>
        </tbody></table></div>
    </section>

    <section className="card"><h2>المصروفات العامة</h2>
      <ExpenseForm />
      {cf.exps.length > 0 && <div className="table-wrap" style={{ marginTop: 14 }}><table>
        <thead><tr><th>التاريخ</th><th>المصروف</th><th>النوع</th><th>المبلغ</th><th></th></tr></thead>
        <tbody>{cf.exps.map((e) => <tr key={e.id}><td className="sub">{e.spentAt.toLocaleDateString("ar-EG")}</td><td>{e.name}</td><td>{CATS[e.category] || "أخرى"}</td><td className="num">{egp(e.amountEgp)}</td>
          <td><form action={removeExpense}><input type="hidden" name="id" value={e.id} /><button className="sm ghost">حذف</button></form></td></tr>)}</tbody></table></div>}
    </section>

    <h2 style={{ marginTop: 26 }}>أرباح المشاريع المقفولة</h2>
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

    <section className="card"><h2>أرباح المشاريع المقفولة شهر بشهر</h2><p className="sub" style={{ marginTop: -6 }}>المشروع بيتحسب في الشهر اللي اتقفل فيه، بعد ما نخصم أجور الفريق والتكاليف والصندوق.</p>
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
