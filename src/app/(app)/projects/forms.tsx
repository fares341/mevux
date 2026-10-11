"use client";
import { useActionState, useState } from "react";
import { createProject, updateProject, addPayment, addCost, saveRole, addDeduction, respondDeduction, deleteProject, type R } from "./actions";

export function Msg({ s }: { s: R }) {
  return s?.error ? <div className="msg bad" role="alert">{s.error}</div> : s?.ok ? <div className="msg ok">{s.ok}</div> : null;
}
const d = (x?: Date | string | null) => (x ? new Date(x).toISOString().slice(0, 10) : "");

export function NewProject({ clients = [], clientId }: { clients?: { id: string; name: string }[]; clientId?: string }) {
  const [s, a, p] = useActionState(createProject, {});
  const [cid, setCid] = useState(clientId || "");
  return (<form action={a}><Msg s={s} />
    <div className="row">
      <label>اسم المشروع<input id="np-name" name="name" required /></label>
      <label>العميل<select id="np-clientId" name="clientId" value={cid} onChange={(e) => setCid(e.target.value)}><option value="">— عميل مش متسجل —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {!cid && <label>اسم العميل<input id="np-client" name="client" required /></label>}
      <label>الحجم<select id="np-size" name="size" defaultValue="MEDIUM"><option value="SMALL">صغير</option><option value="MEDIUM">متوسط</option><option value="LARGE">كبير</option></select></label>
    </div>
    <div className="row">
      <label>السعر<input id="np-price" name="price" type="number" min="0" step="0.01" dir="ltr" required /></label>
      <label>العملة<small>سعر الصرف يتثبت من الإعدادات وقت الإنشاء</small><select id="np-cur" name="currency" defaultValue="EGP"><option value="EGP">جنيه</option><option value="SAR">ريال</option><option value="USD">دولار</option></select></label>
      <label>المرحلة<select id="np-status" name="status" defaultValue="MEETING"><option value="MEETING">ميتنج</option><option value="BRIEF">بريف</option><option value="APPROVED">موافقة وعربون</option><option value="IN_PROGRESS">تنفيذ</option></select></label>
      <label>البداية<input id="np-start" name="startDate" type="date" /></label>
      <label>موعد التسليم<input id="np-due" name="dueDate" type="date" /></label>
    </div>
    <BillingFields k="np" d={{}} />
    <Kinds k="np" />
    <label style={{ marginBottom: 14 }}>وصف المشروع<textarea id="np-desc" name="description" /></label>
    <button disabled={p}>إنشاء المشروع</button>
  </form>);
}

type P = { clientId?: string | null; kinds?: string | null; nextDueDate?: Date | null; reminderDays?: number; billing?: string; monthlyFee?: number | null; freeMessages?: number | null; id: string; name: string; client: string; price: number; rate: number; size: string; status: string; startDate: Date | null; dueDate: Date | null; description: string | null; currency: string };
export function EditProject({ p, clients = [] }: { p: P; clients?: { id: string; name: string }[] }) {
  const [s, a, pend] = useActionState(updateProject, {});
  return (<form action={a}><Msg s={s} /><input type="hidden" name="id" value={p.id} />
    <div className="row">
      <label>اسم المشروع<input id="ep-name" name="name" defaultValue={p.name} required /></label>
      <label>العميل<small>اختار عميل متسجل عشان كل مشاريعه تبقى تحته</small><select id="ep-clientId" name="clientId" defaultValue={p.clientId || ""}><option value="">— مش متربط بعميل —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <input type="hidden" name="client" value={p.client} />
      <label>المرحلة<select id="ep-status" name="status" defaultValue={p.status}>
        <option value="MEETING">ميتنج</option><option value="BRIEF">بريف</option><option value="APPROVED">موافقة وعربون</option><option value="IN_PROGRESS">تنفيذ</option><option value="DELIVERED">تم التسليم</option><option value="CLOSED">مقفول ومدفوع</option><option value="CANCELLED">ملغي</option></select></label>
      <label>الحجم<select id="ep-size" name="size" defaultValue={p.size}><option value="SMALL">صغير</option><option value="MEDIUM">متوسط</option><option value="LARGE">كبير</option></select></label>
    </div>
    <div className="row">
      <label>السعر ({p.currency})<input id="ep-price" name="price" type="number" step="0.01" dir="ltr" defaultValue={p.price} required /></label>
      <label>سعر الصرف للجنيه<input id="ep-rate" name="rate" type="number" step="0.0001" dir="ltr" defaultValue={p.rate} required /></label>
      <label>البداية<input id="ep-start" name="startDate" type="date" defaultValue={d(p.startDate)} /></label>
      <label>موعد التسليم<input id="ep-due" name="dueDate" type="date" defaultValue={d(p.dueDate)} /></label>
    </div>
    <BillingFields k="ep" d={{ billing: p.billing, monthlyFee: p.monthlyFee, freeMessages: p.freeMessages, nextDueDate: p.nextDueDate, reminderDays: p.reminderDays }} />
    <Kinds k="ep" v={p.kinds} />
    <label style={{ marginBottom: 14 }}>وصف المشروع<textarea id="ep-desc" name="description" defaultValue={p.description || ""} /></label>
    <p className="sub" style={{ marginTop: 0 }}>اختيار <b>مقفول ومدفوع</b> يعني إن العميل استلم ووافق ودفع، وساعتها مستحقات الفريق تتحسب ويبقى ينفع تصرفها.</p>
    <button disabled={pend}>حفظ</button>
  </form>);
}

export function PaymentForm({ projectId, currency }: { projectId: string; currency: string }) {
  const [s, a, p] = useActionState(addPayment, {});
  return (<form action={a}><Msg s={s} /><input type="hidden" name="projectId" value={projectId} />
    <div className="row">
      <label>المبلغ ({currency})<input id="pay-amt" name="amount" type="number" step="0.01" min="0" dir="ltr" required /></label>
      <label>التاريخ<input id="pay-date" name="paidAt" type="date" /></label>
      <label>ملاحظة<input id="pay-note" name="note" placeholder="عربون، دفعة ثانية…" /></label>
    </div>
    <button className="sm" disabled={p}>تسجيل دفعة</button>
  </form>);
}

export function CostForm({ projectId, suppliers }: { projectId: string; suppliers: { id: string; label: string }[] }) {
  const [s, a, p] = useActionState(addCost, {});
  return (<form action={a}><Msg s={s} /><input type="hidden" name="projectId" value={projectId} />
    <div className="row">
      <label>من الموردين<small>اختياري</small><select id="cost-sup" name="supplierId" defaultValue=""><option value="">— بند يدوي —</option>{suppliers.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
      <label>اسم التكلفة<small>يتملأ تلقائياً لو اخترت مورد</small><input id="cost-name" name="name" /></label>
      <label>المبلغ (جنيه)<input id="cost-amt" name="amount" type="number" step="0.01" min="0" dir="ltr" required /></label>
    </div>
    <button className="sm" disabled={p}>إضافة تكلفة</button>
  </form>);
}

type U = { id: string; name: string; banned: boolean };
type RoleInit = { id?: string; title?: string; fee?: number; scope?: string | null; deliverables?: string | null; dueDate?: Date | null; members?: { userId: string; sharePct: number; isLead: boolean }[] };
export function RoleForm({ projectId, users, role, label }: { projectId: string; users: U[]; role?: RoleInit; label: string }) {
  const [s, a, p] = useActionState(saveRole, {});
  const k = role?.id || "new";
  const [rows, setRows] = useState(role?.members?.length ? role.members.map((m) => ({ userId: m.userId, share: m.sharePct })) : [{ userId: "", share: 100 }]);
  const [lead, setLead] = useState(role?.members?.find((m) => m.isLead)?.userId || "");
  const total = rows.reduce((t, r) => t + (Number(r.share) || 0), 0);
  return (<form action={a}><Msg s={s} />
    <input type="hidden" name="projectId" value={projectId} />{role?.id && <input type="hidden" name="roleId" value={role.id} />}
    <div className="row">
      <label>الدور<input id={k + "-title"} name="title" list="role-titles" defaultValue={role?.title} required placeholder="أوتوميشن، داشبورد، تيستر…" /></label>
      <label>أجر الدور (جنيه)<small>يتقسم على أعضاء الدور حسب النسبة</small><input id={k + "-fee"} name="fee" type="number" min="0" step="1" dir="ltr" defaultValue={role?.fee} required /></label>
      <label>موعد التسليم<input id={k + "-due"} name="dueDate" type="date" defaultValue={d(role?.dueDate)} /></label>
    </div>
    <datalist id="role-titles"><option value="أوتوميشن" /><option value="داشبورد / فرونت" /><option value="باك إند" /><option value="تيستر" /><option value="تيم ليد" /></datalist>
    <div style={{ marginBottom: 14 }}>
      <b style={{ color: "var(--navy)", fontSize: 13 }}>أعضاء الدور</b> <span className={Math.abs(total - 100) < 0.01 ? "pill ok" : "pill bad"}>المجموع {total}%</span>
      {rows.map((r, i) => (
        <div key={i} className="actions" style={{ marginTop: 8 }}>
          <select aria-label="الشخص" id={`${k}-u${i}`} name="userId" value={r.userId} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, userId: e.target.value } : x))} style={{ maxWidth: 220 }} required>
            <option value="">— اختر —</option>{users.map((u) => <option key={u.id} value={u.id} disabled={u.banned}>{u.name}{u.banned ? " (محروم)" : ""}</option>)}
          </select>
          <input aria-label="النسبة" id={`${k}-s${i}`} name="share" type="number" min="0" max="100" dir="ltr" value={r.share} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, share: Number(e.target.value) } : x))} style={{ maxWidth: 90 }} />%
          {rows.length > 1 && <label style={{ flexDirection: "row", alignItems: "center", fontWeight: 400 }}><input type="radio" name="lead" value={r.userId} checked={lead === r.userId} onChange={() => setLead(r.userId)} style={{ width: "auto" }} /> المسؤول الأول</label>}
          {rows.length > 1 && <button type="button" className="sm ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}>إزالة</button>}
        </div>))}
      <button type="button" className="sm ghost" style={{ marginTop: 8 }} onClick={() => setRows([...rows.map((x) => ({ ...x, share: Math.round(100 / (rows.length + 1)) })), { userId: "", share: 100 - Math.round(100 / (rows.length + 1)) * rows.length }])}>+ شخص تاني في نفس الدور</button>
    </div>
    <div className="row">
      <label>المطلوب<textarea id={k + "-scope"} name="scope" defaultValue={role?.scope || ""} /></label>
      <label>المخرجات<textarea id={k + "-del"} name="deliverables" defaultValue={role?.deliverables || ""} /></label>
    </div>
    <button disabled={p}>{label}</button>
  </form>);
}

type RoleOpt = { id: string; title: string; members: { userId: string; name: string }[] };
export function DeductionForm({ projectId, roles, rates }: { projectId: string; roles: RoleOpt[]; rates: Record<string, number> }) {
  const [s, a, p] = useActionState(addDeduction, {});
  const [roleId, setRole] = useState(roles[0]?.id || "");
  const [type, setType] = useState("REWORK");
  const role = roles.find((r) => r.id === roleId);
  return (<form action={a}><Msg s={s} /><input type="hidden" name="projectId" value={projectId} />
    <div className="row">
      <label>الدور<select id="ded-role" name="roleId" value={roleId} onChange={(e) => setRole(e.target.value)}>{roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
      <label>الشخص<select id="ded-user" name="userId" required defaultValue="">{<option value="">— اختر —</option>}{role?.members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label>
      <label>النوع<select id="ded-type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
        <option value="REWORK">رجوع شغل فيه أخطاء · {rates.reworkPct}%</option>
        <option value="NO_REPLY">عدم الرد على البوت · {rates.noReplyPct}%</option>
        <option value="CLIENT_LOSS">خسارة عميل · {rates.clientLossPct}% + حرمان</option>
        <option value="CLIENT_REFUSE">رفض العميل الإعادة · {rates.clientRefusePct}% + حرمان</option>
        <option value="OTHER">أخرى · نسبة تحددها</option></select></label>
      {type === "OTHER" && <label>النسبة %<input id="ded-pct" name="pct" type="number" min="0" max="100" dir="ltr" required /></label>}
    </div>
    <div className="row">
      <label>السبب<textarea id="ded-reason" name="reason" required /></label>
      <label>الدليل<small>رسالة العميل، رابط، وصف السكرين</small><textarea id="ded-ev" name="evidence" /></label>
    </div>
    <p className="sub" style={{ marginTop: 0 }}>التأخير بيتحسب لوحده من موعد التسليم، ومش محتاج تسجّله هنا. في حالة خسارة العميل: لو حد تاني هيعيد الشغل، ضيفه كدور جديد بأجر من المبلغ المخصوم.</p>
    <button disabled={p}>تسجيل الخصم للمراجعة</button>
  </form>);
}

export function RespondForm({ id }: { id: string }) {
  const [s, a, p] = useActionState(respondDeduction, {});
  return (<form action={a} style={{ marginTop: 8 }}><Msg s={s} /><input type="hidden" name="id" value={id} />
    <textarea id={"resp-" + id} name="response" placeholder="ردك على الخصم" required />
    <button className="sm" style={{ marginTop: 6 }} disabled={p}>إرسال الرد</button>
  </form>);
}

function BillingFields({ k, d }: { k: string; d: { billing?: string; monthlyFee?: number | null; freeMessages?: number | null; nextDueDate?: Date | null; reminderDays?: number } }) {
  const [b, setB] = useState(d.billing || "ONE_TIME");
  return (<div className="row">
    <label>نوع التعاقد<select id={k + "-billing"} name="billing" value={b} onChange={(e) => setB(e.target.value)}>
      <option value="ONE_TIME">تنفيذ + خدمات تشغيل منفصلة</option><option value="SUBSCRIPTION">اشتراك شهري ثابت</option></select></label>
    {b === "SUBSCRIPTION" && <>
      <label>الاشتراك الشهري<small>بنفس عملة المشروع · السعر فوق = رسوم التأسيس (ممكن صفر)</small><input id={k + "-monthly"} name="monthlyFee" type="number" min="0" step="0.01" dir="ltr" defaultValue={d.monthlyFee ?? ""} required /></label>
      <label>رسائل واتساب المجانية شهرياً<small>بعدها العميل يدفع لميتا مباشرة</small><input id={k + "-free"} name="freeMessages" type="number" min="0" dir="ltr" defaultValue={d.freeMessages ?? 1000} /></label>
      <label>ميعاد الدفع الجاي<small>إنت بتحدده، وبعد كل دفعة بيتنقل شهر لوحده</small><input id={k + "-next"} name="nextDueDate" type="date" defaultValue={d.nextDueDate ? new Date(d.nextDueDate).toISOString().slice(0, 10) : ""} /></label>
      <label>نبّهني قبلها بـ<small>أيام</small><input id={k + "-remind"} name="reminderDays" type="number" min="0" max="30" dir="ltr" defaultValue={d.reminderDays ?? 3} /></label>
    </>}
  </div>);
}

const KIND_LABELS: [string, string][] = [["AUTOMATION", "أوتوميشن"], ["CHATBOT", "شات بوت / وكيل AI"], ["WEBSITE", "موقع"], ["APP", "تطبيق"], ["SAAS", "SaaS"], ["DASHBOARD", "داشبورد / نظام"]];
function Kinds({ k, v }: { k: string; v?: string | null }) {
  const on = new Set((v || "").split(",").filter(Boolean));
  return (<fieldset style={{ border: "1px solid var(--line)", borderRadius: 5, padding: "8px 14px", marginBottom: 14 }}>
    <legend style={{ fontWeight: 700, color: "var(--navy)", fontSize: 13 }}>نوع الشغل</legend>
    <div className="actions">{KIND_LABELS.map(([key, l]) => <label key={key} style={{ flexDirection: "row", alignItems: "center", gap: 6, fontWeight: 400 }}><input type="checkbox" name="kinds" value={key} defaultChecked={on.has(key)} id={`${k}-kind-${key}`} style={{ width: "auto" }} />{l}</label>)}</div>
  </fieldset>);
}

export function DeleteProject({ id, name }: { id: string; name: string }) {
  const [s, a, p] = useActionState(deleteProject, {});
  return (<form action={a}>
    <Msg s={s} />
    <input type="hidden" name="id" value={id} />
    <p className="sub" style={{ marginTop: 0 }}>لو المشروع ده اتسجل بالغلط. هيتمسح «{name}» بكل اللي فيه: الأدوار، الدفعات، التكاليف، الصرف للفريق، الملفات، المهام، الشات والبريفات. العميل نفسه مش هيتمسح.</p>
    <div className="actions">
      <label style={{ maxWidth: 240 }}>اكتب «حذف» للتأكيد<input id="del-project" name="confirm" autoComplete="off" /></label>
      <button className="danger" disabled={p} style={{ alignSelf: "flex-end" }}>حذف المشروع نهائيًا</button>
    </div>
  </form>);
}
