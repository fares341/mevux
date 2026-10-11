"use client";
import { useActionState } from "react";
import { createClient, updateClient, logStage } from "./actions";
import { STAGES } from "@/lib/labels";
type R = { ok?: string; error?: string };
const Msg = ({ s }: { s: R }) => s?.error ? <div className="msg bad" role="alert">{s.error}</div> : s?.ok ? <div className="msg ok">{s.ok}</div> : null;
const d = (x?: Date | null) => (x ? new Date(x).toISOString().slice(0, 10) : "");
const StageSelect = ({ id, v }: { id: string; v?: string }) => <select id={id} name="stage" defaultValue={v || "NEW"}>{Object.entries(STAGES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;

type C = { id?: string; name?: string; company?: string | null; phone?: string | null; email?: string | null; country?: string | null; source?: string | null; need?: string | null; stage?: string; nextStep?: string | null; nextDate?: Date | null };
function Fields({ c, k }: { c: C; k: string }) {
  return (<>
    <div className="row">
      <label>اسم العميل<input id={k + "name"} name="name" defaultValue={c.name} required /></label>
      <label>الشركة / النشاط<input id={k + "company"} name="company" defaultValue={c.company || ""} /></label>
      <label>الهاتف / واتساب<input id={k + "phone"} name="phone" dir="ltr" defaultValue={c.phone || ""} /></label>
      <label>الإيميل<input id={k + "email"} name="email" dir="ltr" defaultValue={c.email || ""} /></label>
    </div>
    <div className="row">
      <label>الدولة<input id={k + "country"} name="country" defaultValue={c.country || ""} placeholder="مصر، السعودية…" /></label>
      <label>جه منين<input id={k + "source"} name="source" defaultValue={c.source || ""} placeholder="ترشيح، إعلان، لينكدإن…" /></label>
      <label>المرحلة<StageSelect id={k + "stage"} v={c.stage} /></label>
    </div>
    <div className="row">
      <label>الخطوة الجاية<input id={k + "next"} name="nextStep" defaultValue={c.nextStep || ""} placeholder="ميتنج، إرسال البريف، متابعة…" /></label>
      <label>موعدها<input id={k + "nextDate"} name="nextDate" type="date" defaultValue={d(c.nextDate)} /></label>
    </div>
    <label style={{ marginBottom: 14 }}>العميل محتاج إيه<textarea id={k + "need"} name="need" defaultValue={c.need || ""} /></label>
  </>);
}

export function NewClient() {
  const [s, a, p] = useActionState(createClient, {});
  return <form action={a}><Msg s={s} /><Fields c={{}} k="nc-" /><button disabled={p}>إضافة العميل</button></form>;
}
export function EditClient({ c }: { c: C }) {
  const [s, a, p] = useActionState(updateClient, {});
  return <form action={a}><Msg s={s} /><input type="hidden" name="id" value={c.id} /><Fields c={c} k="ec-" /><button disabled={p}>حفظ البيانات</button></form>;
}
export function StageLog({ c }: { c: C }) {
  const [s, a, p] = useActionState(logStage, {});
  return (<form action={a}><Msg s={s} /><input type="hidden" name="id" value={c.id} />
    <div className="row">
      <label>المرحلة دلوقتي<StageSelect id="ls-stage" v={c.stage} /></label>
      <label>الخطوة الجاية<input id="ls-next" name="nextStep" defaultValue={c.nextStep || ""} /></label>
      <label>موعدها<input id="ls-date" name="nextDate" type="date" defaultValue={d(c.nextDate)} /></label>
    </div>
    <label style={{ marginBottom: 12 }}>إيه اللي حصل<textarea id="ls-note" name="note" placeholder="اتعمل الميتنج، العميل طلب تعديل في السعر…" /></label>
    <button disabled={p}>تسجيل</button>
  </form>);
}
