"use client";
import { useActionState } from "react";
import { createMember, resetPassword, type R } from "./actions";

function Msg({ s }: { s: R }) {
  return s?.error ? <div className="msg bad" role="alert">{s.error}</div> : s?.ok ? <div className="msg ok">{s.ok}</div> : null;
}

export function NewMember() {
  const [s, a, p] = useActionState(createMember, {});
  return (
    <form action={a}>
      <Msg s={s} />
      <div className="row">
        <label>الاسم الكامل<input id="m-name" name="name" required maxLength={80} /></label>
        <label>اسم المستخدم<small>حروف إنجليزية صغيرة وأرقام</small><input id="m-user" name="username" dir="ltr" required /></label>
        <label>كلمة المرور<small>10 أحرف على الأقل</small><input id="m-pass" name="password" type="text" dir="ltr" required minLength={10} autoComplete="new-password" /></label>
      </div>
      <div className="row">
        <label>المسمى / التخصص<input id="m-job" name="jobTitle" placeholder="أوتوميشن، داشبورد…" /></label>
        <label>الهاتف<input id="m-phone" name="phone" dir="ltr" /></label>
        <label>الصلاحية<select id="m-role" name="role" defaultValue="MEMBER"><option value="MEMBER">عضو فريق</option><option value="TEAM_LEAD">تيم ليد</option><option value="ADMIN">مدير</option></select></label>
      </div>
      <button disabled={p}>إضافة الموظف</button>
    </form>
  );
}

export function ResetPw({ id }: { id: string }) {
  const [s, a, p] = useActionState(resetPassword, {});
  return (
    <form action={a} style={{ marginTop: 10 }}>
      <Msg s={s} />
      <input type="hidden" name="id" value={id} />
      <div className="actions"><input id={"pw-" + id} name="password" dir="ltr" placeholder="كلمة مرور جديدة" minLength={10} required style={{ maxWidth: 220 }} /><button className="sm" disabled={p}>حفظ</button></div>
    </form>
  );
}
