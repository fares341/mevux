"use client";
import { useActionState, useState } from "react";
import { login } from "./actions";
export default function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  const [show, setShow] = useState(false);
  // Controlled so a failed attempt doesn't wipe the username (form actions reset uncontrolled fields).
  const [user, setUser] = useState("");
  return (
    <form action={action} className="lg-fields">
      {state?.error && <div className="msg bad" role="alert">{state.error}</div>}
      <label>اسم المستخدم<input id="username" name="username" value={user} onChange={(e) => setUser(e.target.value)} dir="ltr" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={64} autoFocus={!state?.username} /></label>
      <label>كلمة المرور
        <span className="pw"><input id="password" name="password" autoFocus={!!state?.username} type={show ? "text" : "password"} dir="ltr" autoComplete="current-password" required maxLength={200} />
          <button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{show ? "إخفاء" : "إظهار"}</button></span>
      </label>
      <button disabled={pending} className="lg-submit">{pending ? "جارٍ الدخول…" : "تسجيل الدخول"}</button>
    </form>
  );
}
