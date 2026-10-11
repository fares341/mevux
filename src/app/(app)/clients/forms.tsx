"use client";
import { useActionState } from "react";
import { createClient, updateClient, logStage, uploadClientFile, addInstallment } from "./actions";
import { STAGES } from "@/lib/labels";
type R = { ok?: string; error?: string };
const Msg = ({ s }: { s: R }) => s?.error ? <div className="msg bad" role="alert">{s.error}</div> : s?.ok ? <div className="msg ok">{s.ok}</div> : null;
const d = (x?: Date | null) => (x ? new Date(x).toISOString().slice(0, 10) : "");
const StageSelect = ({ id, v }: { id: string; v?: string }) => <select id={id} name="stage" defaultValue={v || "NEW"}>{Object.entries(STAGES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;

type C = { customStage?: string | null; id?: string; name?: string; company?: string | null; phone?: string | null; email?: string | null; website?: string | null; socials?: string | null; notes?: string | null; country?: string | null; source?: string | null; need?: string | null; stage?: string; nextStep?: string | null; nextDate?: Date | null };
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
    <div className="row">
      <label>الموقع<input id={k + "website"} name="website" dir="ltr" defaultValue={c.website || ""} placeholder="example.com أو سيبها فاضية لو مفيش" /></label>
      <label>السوشيال (لينك في كل سطر)<textarea id={k + "socials"} name="socials" dir="ltr" rows={2} defaultValue={c.socials || ""} placeholder={"instagram.com/…\nfacebook.com/…"} /></label>
    </div>
    <label style={{ marginBottom: 14 }}>ملاحظات عن العميل<textarea id={k + "notes"} name="notes" rows={2} defaultValue={c.notes || ""} /></label>
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
      <label>أو اكتب الحالة بكلامك<small>بتظهر بدل اسم المرحلة · سيبها فاضية للرجوع للثابت</small><input id="ls-custom" name="customStage" defaultValue={c.customStage || ""} maxLength={80} placeholder="مستني موافقة الشريك…" /></label>
      <label>الخطوة الجاية<input id="ls-next" name="nextStep" defaultValue={c.nextStep || ""} /></label>
      <label>موعدها<input id="ls-date" name="nextDate" type="date" defaultValue={d(c.nextDate)} /></label>
    </div>
    <label style={{ marginBottom: 12 }}>إيه اللي حصل<textarea id="ls-note" name="note" placeholder="اتعمل الميتنج، العميل طلب تعديل في السعر…" /></label>
    <button disabled={p}>تسجيل</button>
  </form>);
}

export function ClientFileForm({ clientId }: { clientId: string }) {
  const [s, a, p] = useActionState(uploadClientFile, {});
  return (<form action={a}><Msg s={s} /><input type="hidden" name="clientId" value={clientId} />
    <div className="row">
      <label>الملف<small>حتى 25 ميجا</small><input id="cf-file" name="file" type="file" required /></label>
      <label>النوع<select id="cf-kind" name="kind" defaultValue="BRIEF"><option value="BRIEF">بريف</option><option value="CONTRACT">عقد / اتفاق</option><option value="OTHER">أخرى</option></select></label>
      <label>ملاحظة<input id="cf-note" name="note" placeholder="النسخة التانية بعد التعديل…" /></label>
    </div>
    <button className="sm" disabled={p}>{p ? "جارٍ الرفع…" : "رفع الملف"}</button>
  </form>);
}

export function InstallmentForm({ clientId, projects }: { clientId: string; projects: { id: string; name: string; currency: string }[] }) {
  const [s, a, p] = useActionState(addInstallment, {});
  return (<form action={a}><Msg s={s} /><input type="hidden" name="clientId" value={clientId} />
    <div className="row">
      <label>الدفعة<input id="in-label" name="label" required placeholder="عربون، دفعة تانية، نهائية…" /></label>
      <label>المبلغ<input id="in-amount" name="amount" type="number" min="0" step="0.01" dir="ltr" required /></label>
      <label>العملة<select id="in-cur" name="currency" defaultValue={projects[0]?.currency || "EGP"}><option value="EGP">جنيه</option><option value="SAR">ريال</option><option value="USD">دولار</option></select></label>
      <label>إمتى<input id="in-due" name="dueNote" placeholder="عند البدء، بعد ربط الدرايف…" /></label>
      <label>المشروع<small>لو اخترته، الدفعة تتسجل في حساباته لما تعلّم إنها اتدفعت</small><select id="in-proj" name="projectId" defaultValue={projects[0]?.id || ""}><option value="">— بدون —</option>{projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    </div>
    <button className="sm" disabled={p}>إضافة للاتفاق</button>
  </form>);
}
