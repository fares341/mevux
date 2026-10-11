"use client";
import { useActionState } from "react";
import { generateBrief } from "./brief-actions";

export function BriefForm({ projectId, suppliers, hint, currency }: { projectId: string; suppliers: { id: string; label: string }[]; hint: string; currency?: string }) {
  const [s, a, p] = useActionState(generateBrief, {});
  return (<form action={a}>
    {s?.error && <div className="msg bad" role="alert">{s.error}</div>}
    {s?.ok && <div className="msg ok">{s.ok} {s.id && <a href={`/api/briefs/${s.id}`} target="_blank" rel="noopener"><b>افتح البريف</b></a>}</div>}
    <input type="hidden" name="projectId" value={projectId} />
    <div className="row">
      <label>لغة البريف<select id="b-lang" name="lang" defaultValue="ar"><option value="ar">عربي</option><option value="en">English</option></select></label>
    </div>
    <label style={{ marginBottom: 12 }}>السياق<small>كل اللي تعرفه: اللي اتقال في الميتنج، تحليل وضع العميل، أرقامه (عدد عملاء، نسب، تكاليف بيدفعها)، الأدوات اللي شغال بيها، والمطلوب بالتفصيل. كل ما تكتب أكتر البريف يطلع أدق. الأسعار والدفعات والمدة بتتاخد من السيستم.</small>
      <textarea id="b-extra" name="extra" rows={10} placeholder={hint} /></label>
    <div className="row">
      <label>تقدير الاستهلاك الشهري ({currency || "بعملة المشروع"})<small>اختياري: رسائل واستهلاك AI فوق الاشتراك. بيتجمع مع الاشتراكات في الخلاصة</small><input id="b-usage" name="usageEstimate" type="number" min="0" step="0.01" dir="ltr" /></label>
      <label>ملاحظة على التكلفة الشهرية<small>اختياري: تظهر تحت تكاليف التشغيل</small><input id="b-opsnote" name="opsNote" maxLength={600} placeholder="الردود خلال 24 ساعة من رسالة العميل مجانية…" /></label>
    </div>
    {suppliers.length > 0 && <fieldset style={{ border: "1px solid var(--line)", borderRadius: 5, padding: "8px 14px", marginBottom: 12 }}>
      <legend style={{ fontWeight: 700, color: "var(--navy)", fontSize: 13 }}>تكاليف تشغيل تظهر للعميل</legend>
      {suppliers.map((x) => <label key={x.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, fontWeight: 400 }}><input type="checkbox" name="supplierId" value={x.id} style={{ width: "auto" }} /> {x.label}</label>)}
    </fieldset>}
    <button disabled={p}>{p ? "جارٍ كتابة البريف وتجهيز الـ PDF… (حوالي دقيقة)" : "توليد البريف"}</button>
  </form>);
}
