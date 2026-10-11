"use client";
import { useActionState } from "react";
import { addPayout, addFundSpend, addExpense } from "./actions";
type R = { ok?: string; error?: string };
const Msg = ({ s }: { s: R }) => s?.error ? <div className="msg bad" role="alert">{s.error}</div> : s?.ok ? <div className="msg ok">{s.ok}</div> : null;

export function PayoutForm({ people, projects }: { people: { id: string; name: string; due: number }[]; projects: { id: string; name: string }[] }) {
  const [s, a, p] = useActionState(addPayout, {});
  return (<form action={a}><Msg s={s} />
    <div className="row">
      <label>الشخص<select id="po-user" name="userId" required defaultValue=""><option value="">— اختر —</option>{people.map((x) => <option key={x.id} value={x.id}>{x.name} · مستحق {Math.round(x.due).toLocaleString("en-US")} ج</option>)}</select></label>
      <label>المشروع<small>اختياري</small><select id="po-proj" name="projectId" defaultValue=""><option value="">—</option>{projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label>المبلغ (جنيه)<input id="po-amt" name="amount" type="number" min="0" step="1" dir="ltr" required /></label>
      <label>ملاحظة<input id="po-note" name="note" placeholder="فودافون كاش، تحويل…" /></label>
    </div>
    <button disabled={p}>تسجيل صرف</button>
  </form>);
}

export function FundForm() {
  const [s, a, p] = useActionState(addFundSpend, {});
  return (<form action={a}><Msg s={s} />
    <div className="row"><label>الاشتراك / الأداة<input id="fs-name" name="name" required /></label><label>المبلغ (جنيه)<input id="fs-amt" name="amount" type="number" min="0" step="1" dir="ltr" required /></label></div>
    <button className="sm" disabled={p}>صرف من الصندوق</button>
  </form>);
}

export function ExpenseForm() {
  const [s, a, p] = useActionState(addExpense, {});
  return (<form action={a}><Msg s={s} />
    <div className="row">
      <label>المصروف<input id="ex-name" name="name" required placeholder="إعلانات فيسبوك، اشتراك Canva…" /></label>
      <label>المبلغ (جنيه)<input id="ex-amt" name="amount" type="number" min="0" step="1" dir="ltr" required /></label>
      <label>النوع<select id="ex-cat" name="category" defaultValue="OTHER"><option value="ADS">إعلانات</option><option value="TOOLS">أدوات واشتراكات</option><option value="SALARIES">رواتب ثابتة</option><option value="OTHER">أخرى</option></select></label>
      <label>التاريخ<input id="ex-date" name="date" type="date" /></label>
    </div>
    <button className="sm" disabled={p}>تسجيل المصروف</button>
  </form>);
}
