import { asc } from "drizzle-orm";
import { db, suppliers } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { deleteSupplier } from "./actions";
import SupplierForm from "./form";
import { BILLING } from "@/lib/labels";

const CATS = [
  { key: "VPS", title: "السيرفرات (VPS)", hint: "الاستضافة والسيرفرات وقواعد البيانات." },
  { key: "API", title: "خدمات API", hint: "OpenRouter، نماذج الذكاء الاصطناعي، وأي API مدفوع." },
  { key: "WHATSAPP", title: "مزود واتساب", hint: "الاشتراك وسعر كل نوع رسالة والحد المجاني." },
  { key: "OTHER", title: "أخرى", hint: "أي خدمة لا تندرج تحت الأقسام السابقة." },
] as const;
const CUR = { EGP: "ج", SAR: "ريال", USD: "$" } as Record<string, string>;

export default async function Suppliers() {
  await requireAdmin();
  const all = await db.select().from(suppliers).orderBy(asc(suppliers.provider), asc(suppliers.createdAt));
  return (<>
    <div className="head"><div><span className="tag">الإدارة</span><h1>الموردون والخدمات</h1><p className="sub">أسعار الخدمات الثابتة التي تعتمد عليها المشاريع. تظهر للمدير فقط.</p></div></div>
    {CATS.map((c) => {
      const rows = all.filter((s) => s.category === c.key);
      return (<section className="card" key={c.key}>
        <h2>{c.title} <span className="pill info">{rows.length}</span></h2>
        <p className="sub" style={{ marginTop: -6, marginBottom: 14 }}>{c.hint}</p>
        {rows.length > 0 && <div className="table-wrap" style={{ marginBottom: 16 }}><table>
          <thead><tr><th>المزود</th><th>الخدمة</th><th>السعر</th><th>طريقة الحساب</th><th>التفاصيل</th><th></th></tr></thead>
          <tbody>{rows.map((s) => (<tr key={s.id}>
            <td><b>{s.provider}</b></td><td>{s.item}</td>
            <td><span className="num">{Number(s.price).toLocaleString("en-US", { maximumFractionDigits: 4 })}</span> {CUR[s.currency]}</td>
            <td>{BILLING[s.billing]}</td>
            <td style={{ maxWidth: 260, whiteSpace: "pre-wrap" }}>{s.details || "—"}</td>
            <td><details><summary>تعديل</summary><div style={{ minWidth: 320, marginTop: 10 }}>
              <SupplierForm label="حفظ التعديل" s={{ id: s.id, category: s.category, provider: s.provider, item: s.item, price: String(s.price), currency: s.currency, billing: s.billing, details: s.details }} />
              <form action={deleteSupplier} style={{ marginTop: 8 }}><input type="hidden" name="id" value={s.id} /><button className="sm danger">حذف البند</button></form>
            </div></details></td>
          </tr>))}</tbody>
        </table></div>}
        <details open={rows.length === 0}><summary>إضافة بند في {c.title}</summary><div style={{ marginTop: 12 }}><SupplierForm label="إضافة" s={{ category: c.key }} /></div></details>
      </section>);
    })}
  </>);
}
