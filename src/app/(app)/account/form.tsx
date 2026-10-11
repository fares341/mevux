"use client";
import { useActionState } from "react";
import { changePassword } from "./actions";
export default function PwForm() {
  const [s, a, p] = useActionState(changePassword, {});
  return (<form action={a}>
    {s?.error && <div className="msg bad" role="alert">{s.error}</div>}{s?.ok && <div className="msg ok">{s.ok}</div>}
    <div className="row">
      <label>كلمة المرور الحالية<input id="cur" name="current" type="password" dir="ltr" required autoComplete="current-password" /></label>
      <label>كلمة المرور الجديدة<input id="next" name="next" type="password" dir="ltr" required minLength={10} autoComplete="new-password" /></label>
      <label>تأكيد كلمة المرور<input id="rep" name="repeat" type="password" dir="ltr" required minLength={10} autoComplete="new-password" /></label>
    </div>
    <button disabled={p}>تغيير كلمة المرور</button>
  </form>);
}
