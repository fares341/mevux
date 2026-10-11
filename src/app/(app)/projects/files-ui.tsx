"use client";
import { useActionState, useState } from "react";
import { uploadRoleFile, uploadFinalFile, saveCredential } from "./files-actions";
type R = { ok?: string; error?: string };
const Msg = ({ s }: { s: R }) => s?.error ? <div className="msg bad" role="alert">{s.error}</div> : s?.ok ? <div className="msg ok">{s.ok}</div> : null;

export function RoleUpload({ roleId, delivered }: { roleId: string; delivered: boolean }) {
  const [s, a, p] = useActionState(uploadRoleFile, {});
  return (<form action={a}><Msg s={s} /><input type="hidden" name="roleId" value={roleId} />
    <div className="row">
      <label>الملف<small>حتى 25 ميجا</small><input id={"rf-" + roleId} name="file" type="file" required /></label>
      <label>ملاحظة<input id={"rn-" + roleId} name="note" placeholder="إيه اللي في الملف" /></label>
    </div>
    {!delivered && <label style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, fontWeight: 400 }}><input type="checkbox" name="delivered" style={{ width: "auto" }} /> كده خلّصت الدور وسلّمته</label>}
    <button className="sm" disabled={p}>{p ? "جارٍ الرفع…" : "رفع الملف"}</button>
  </form>);
}

export function FinalUpload({ projectId }: { projectId: string }) {
  const [s, a, p] = useActionState(uploadFinalFile, {});
  return (<form action={a}><Msg s={s} /><input type="hidden" name="projectId" value={projectId} />
    <div className="row">
      <label>الملف النهائي<small>حتى 25 ميجا</small><input id="ff" name="file" type="file" required /></label>
      <label>ملاحظة<input id="fn" name="note" placeholder="نسخة التسليم، الكود، العرض…" /></label>
    </div>
    <button className="sm" disabled={p}>{p ? "جارٍ الرفع…" : "رفع الملف النهائي"}</button>
  </form>);
}

export function CredentialForm({ projectId }: { projectId: string }) {
  const [s, a, p] = useActionState(saveCredential, {});
  return (<form action={a}><Msg s={s} /><input type="hidden" name="projectId" value={projectId} />
    <div className="row">
      <label>الاسم<input id="cr-label" name="label" required placeholder="سيرفر المشروع، حساب n8n للعميل…" /></label>
      <label>الرابط / IP<input id="cr-url" name="url" dir="ltr" /></label>
      <label>اسم المستخدم<input id="cr-user" name="username" dir="ltr" autoComplete="off" /></label>
      <label>كلمة المرور / المفتاح<input id="cr-secret" name="secret" dir="ltr" autoComplete="new-password" /></label>
    </div>
    <label style={{ marginBottom: 12 }}>ملاحظات<textarea id="cr-notes" name="notes" /></label>
    <button className="sm" disabled={p}>حفظ البيانات</button>
  </form>);
}

export function Secret({ value }: { value: string }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  return (<span className="actions" style={{ display: "inline-flex" }}>
    <code className="num" style={{ background: "var(--pale)", padding: "2px 8px", borderRadius: 4 }}>{show ? value : "••••••••"}</code>
    <button type="button" className="sm ghost" onClick={() => setShow(!show)}>{show ? "إخفاء" : "إظهار"}</button>
    <button type="button" className="sm ghost" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}>{copied ? "اتنسخ" : "نسخ"}</button>
  </span>);
}
