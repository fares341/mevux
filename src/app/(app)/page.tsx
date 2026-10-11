import { requireUser } from "@/lib/auth";
import { eq, count, sum } from "drizzle-orm";
import { db, users, suppliers, fixedCosts } from "@/lib/db";
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
    <div className="note">المشاريع، والأدوار، والمهام، والمالية، والشات بوت هتظهر هنا في المراحل الجاية.</div>
  </>);
}
