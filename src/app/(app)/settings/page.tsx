import { asc } from "drizzle-orm";
import { db, fixedCosts } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getSettings, getRaw } from "@/lib/settings";
import { removeFixedCost } from "./actions";
import { FinanceForm, FixedCostForm, AiForm } from "./forms";

export default async function Settings() {
  await requireAdmin();
  const [s, fixed, hint] = await Promise.all([
    getSettings(),
    db.select().from(fixedCosts).orderBy(asc(fixedCosts.createdAt)),
    getRaw("openrouterKeyHint"),
  ]);
  const total = fixed.filter((f) => f.active).reduce((a, f) => a + Number(f.amountEgp), 0);
  return (<>
    <div className="head"><div><span className="tag">الإدارة</span><h1>الإعدادات</h1><p className="sub">النسب، قواعد الخصم، المصاريف الثابتة، وإعدادات الذكاء الاصطناعي.</p></div></div>
    <div className="card"><FinanceForm s={s} /></div>
    <div className="card">
      <h2>المصاريف الثابتة الشهرية · <span className="num">{total.toLocaleString("en-US")}</span> ج</h2>
      {fixed.length > 0 && <div className="table-wrap" style={{ marginBottom: 14 }}><table>
        <thead><tr><th>البند</th><th>المبلغ الشهري</th><th></th></tr></thead>
        <tbody>{fixed.map((f) => <tr key={f.id}><td>{f.name}</td><td><span className="num">{Number(f.amountEgp).toLocaleString("en-US")}</span> ج</td>
          <td><form action={removeFixedCost}><input type="hidden" name="id" value={f.id} /><button className="sm ghost">حذف</button></form></td></tr>)}</tbody>
      </table></div>}
      <FixedCostForm />
    </div>
    <div className="card"><h2>الذكاء الاصطناعي (OpenRouter)</h2>
      <div className="note">المفتاح يتخزن مشفراً ولا يظهر كاملاً لأي أحد. لو الرصيد خلص، ضع مفتاحاً جديداً هنا والنظام يكمل عليه مباشرة.</div>
      <AiForm s={s} hint={hint} />
    </div>
  </>);
}
