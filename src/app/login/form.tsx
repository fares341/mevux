"use client";
import { useActionState } from "react";
import { login } from "./actions";
export default function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action}>
      {state?.error && <div className="msg bad" role="alert">{state.error}</div>}
      <label>اسم المستخدم<input id="username" name="username" dir="ltr" autoComplete="username" required maxLength={64} /></label>
      <label>كلمة المرور<input id="password" name="password" type="password" dir="ltr" autoComplete="current-password" required maxLength={200} /></label>
      <button disabled={pending}>{pending ? "جارٍ الدخول…" : "تسجيل الدخول"}</button>
    </form>
  );
}
