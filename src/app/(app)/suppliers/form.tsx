"use client";
import { useActionState } from "react";
import { saveSupplier } from "./actions";

import { BILLING } from "@/lib/labels";
type S = { id?: string; category: string; provider?: string; item?: string; price?: string; currency?: string; billing?: string; details?: string | null };

export default function SupplierForm({ s, label }: { s: S; label: string }) {
  const [st, a, p] = useActionState(saveSupplier, {});
  const k = s.id || "new-" + s.category;
  return (<form action={a}>
    {st?.error && <div className="msg bad" role="alert">{st.error}</div>}{st?.ok && <div className="msg ok">{st.ok}</div>}
    <input type="hidden" name="id" value={s.id || ""} /><input type="hidden" name="category" value={s.category} />
    <div className="row">
      <label>المزود<input id={k + "-prov"} name="provider" defaultValue={s.provider} required /></label>
      <label>الخدمة / البند<input id={k + "-item"} name="item" defaultValue={s.item} required placeholder={s.category === "WHATSAPP" ? "رسالة تسويقية" : s.category === "VPS" ? "KVM 2" : "Claude Sonnet"} /></label>
      <label>السعر<input id={k + "-price"} name="price" type="number" step="0.0001" min="0" dir="ltr" defaultValue={s.price} required /></label>
      <label>العملة<select id={k + "-cur"} name="currency" defaultValue={s.currency || "EGP"}><option value="EGP">جنيه</option><option value="SAR">ريال</option><option value="USD">دولار</option></select></label>
      <label>طريقة الحساب<select id={k + "-bill"} name="billing" defaultValue={s.billing || "MONTHLY"}>{Object.entries(BILLING).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    </div>
    <label style={{ marginBottom: 14 }}>التفاصيل<small>المواصفات، الحدود المجانية، ملاحظات</small><textarea id={k + "-det"} name="details" defaultValue={s.details || ""} /></label>
    <button disabled={p}>{label}</button>
  </form>);
}
