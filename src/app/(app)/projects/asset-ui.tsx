"use client";
import { useActionState } from "react";
import { saveAsset } from "./asset-actions";

type A = { id?: string; kind?: string; name?: string; url?: string | null; provider?: string | null; details?: string | null; cost?: number | null; currency?: string; billing?: string; paidBy?: string; renewsAt?: Date | null; inBrief?: boolean };
export function AssetForm({ projectId, a = {}, label }: { projectId: string; a?: A; label: string }) {
  const [s, act, p] = useActionState(saveAsset, {});
  const k = a.id || "new-asset";
  return (<form action={act}>
    {s?.error && <div className="msg bad" role="alert">{s.error}</div>}{s?.ok && <div className="msg ok">{s.ok}</div>}
    <input type="hidden" name="projectId" value={projectId} />{a.id && <input type="hidden" name="id" value={a.id} />}
    <div className="row">
      <label>النوع<select id={k + "-kind"} name="kind" defaultValue={a.kind || "WEBSITE"}><option value="WEBSITE">موقع</option><option value="APP">تطبيق</option><option value="SAAS">SaaS</option><option value="SERVER">سيرفر / استضافة</option><option value="DOMAIN">دومين</option><option value="OTHER">أخرى</option></select></label>
      <label>الاسم<input id={k + "-name"} name="name" defaultValue={a.name} required placeholder="موقع المطعم، تطبيق الطلبات، سيرفر n8n…" /></label>
      <label>الرابط / الدومين<input id={k + "-url"} name="url" dir="ltr" defaultValue={a.url || ""} /></label>
      <label>المزود / التقنية<input id={k + "-prov"} name="provider" defaultValue={a.provider || ""} placeholder="Hostinger، Vercel، WordPress، Flutter…" /></label>
    </div>
    <label style={{ marginBottom: 14 }}>التفاصيل<small>المواصفات، الصفحات، المميزات، أي حاجة تتذكر في البريف</small><textarea id={k + "-det"} name="details" defaultValue={a.details || ""} /></label>
    <div className="row">
      <label>التكلفة<small>اختياري</small><input id={k + "-cost"} name="cost" type="number" min="0" step="0.01" dir="ltr" defaultValue={a.cost ?? ""} /></label>
      <label>العملة<select id={k + "-cur"} name="currency" defaultValue={a.currency || "EGP"}><option value="EGP">جنيه</option><option value="SAR">ريال</option><option value="USD">دولار</option></select></label>
      <label>كل<select id={k + "-bill"} name="billing" defaultValue={a.billing || "MONTHLY"}><option value="MONTHLY">شهر</option><option value="YEARLY">سنة</option><option value="ONE_TIME">مرة واحدة</option></select></label>
      <label>مين بيدفع<select id={k + "-paid"} name="paidBy" defaultValue={a.paidBy || "CLIENT"}><option value="CLIENT">العميل</option><option value="US">إحنا</option><option value="INCLUDED">ضمن الاشتراك</option></select></label>
      <label>التجديد<small>للدومين/الاستضافة</small><input id={k + "-renew"} name="renewsAt" type="date" defaultValue={a.renewsAt ? new Date(a.renewsAt).toISOString().slice(0, 10) : ""} /></label>
    </div>
    <label style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, fontWeight: 400 }}><input type="checkbox" name="inBrief" defaultChecked={a.inBrief ?? true} style={{ width: "auto" }} /> يظهر في البريف</label>
    <button className="sm" disabled={p}>{label}</button>
  </form>);
}
