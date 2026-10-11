"use client";
import { useActionState, useEffect, useState } from "react";
import { issueWorkOrder, acceptWorkOrder, askQuestion, requestExtension, submitWork, reviewWork } from "./work-order-actions";
type R = { ok?: string; error?: string };
const Msg = ({ s }: { s: R }) => s?.error ? <div className="msg bad" role="alert">{s.error}</div> : s?.ok ? <div className="msg ok">{s.ok}</div> : null;

export function Countdown({ to, late }: { to: string; late?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  if (now === null) return null;
  const ms = new Date(to).getTime() - now, a = Math.abs(ms);
  const d = Math.floor(a / 86400000), h = Math.floor((a % 86400000) / 3600000), m = Math.floor((a % 3600000) / 60000);
  const txt = [d && `${d} يوم`, h && `${h} ساعة`, !d && `${m} دقيقة`].filter(Boolean).join(" و");
  return <span className={"wo-count" + (ms < 0 || late ? " late" : ms < 86400000 ? " soon" : "")}>{ms >= 0 ? `فاضل ${txt}` : `متأخر ${txt}`}</span>;
}

export function IssueForm({ roleId, init, defaultGrace }: { roleId: string; init: { scope: string; checklist: string; done: string; deadline: string; grace: number; sent: boolean }; defaultGrace: number }) {
  const [s, a, p] = useActionState(issueWorkOrder, {});
  return (<form action={a} className="wo-issue"><Msg s={s} />
    <input type="hidden" name="roleId" value={roleId} />
    <label>المطلوب (التيكت)<textarea name="scope" rows={4} defaultValue={init.scope} required placeholder="اشرح الشغل بالتفصيل: إيه المطلوب، الروابط، أي حاجة لازم يعرفها" /></label>
    <div className="row">
      <label>قائمة التسليمات<small className="hint">حاجة في كل سطر، والموظف بيعلّم عليها</small><textarea name="checklist" rows={4} defaultValue={init.checklist} required placeholder={"ربط شيت المنيو\nرد تلقائي على سؤال الأسعار\nفيديو تجربة"} /></label>
      <label>يعتبر خلص لما<small className="hint">جملة واضحة نحكم بيها</small><textarea name="doneDefinition" rows={4} defaultValue={init.done} required placeholder="البوت بيرد على 10 أسئلة تجربة صح من غير ما حد يتدخل" /></label>
    </div>
    <div className="row">
      <label>معاد التسليم (يوم وساعة)<input type="datetime-local" name="deadline" defaultValue={init.deadline} required /></label>
      <label>وقت السماح بعد المعاد (ساعات)<input type="number" name="graceHours" min={0} max={168} defaultValue={init.sent ? init.grace : defaultGrace} /></label>
    </div>
    <p className="sub" style={{ margin: "6px 0 10px" }}>الملفات والصور والفويس ضيفها من «تفاصيل الدور» تحت. بعد ما تبعت، الموظف لازم يدوس «استلمت وفهمت»، والخصم بيبدأ يتحسب بعد المعاد + وقت السماح.</p>
    <button disabled={p}>{p ? "بيتبعت…" : init.sent ? "حفظ التعديل وإعادة الإرسال" : "إرسال أمر الشغل للموظف"}</button>
  </form>);
}

export function AcceptBox({ roleId }: { roleId: string }) {
  const [s, a, p] = useActionState(acceptWorkOrder, {});
  const [q, qa, qp] = useActionState(askQuestion, {});
  const [ask, setAsk] = useState(false);
  return (<div className="wo-accept"><Msg s={s} /><Msg s={q} />
    <form action={a} style={{ display: "inline" }}><input type="hidden" name="roleId" value={roleId} /><button disabled={p}>✅ استلمت وفهمت</button></form>
    <button type="button" className="ghost" onClick={() => setAsk((x) => !x)}>عندي سؤال</button>
    {ask && <form action={qa} style={{ marginTop: 10 }}><input type="hidden" name="roleId" value={roleId} />
      <textarea name="text" rows={3} required placeholder="اكتب سؤالك أو اللي مش واضح" /><button className="sm" disabled={qp} style={{ marginTop: 6 }}>إرسال السؤال</button></form>}
  </div>);
}

export function WorkActions({ roleId, canExtend, extPending, minExt, rework }: { roleId: string; canExtend: boolean; extPending: boolean; minExt: string; rework: boolean }) {
  const [s, a, p] = useActionState(submitWork, {});
  const [e, ea, ep] = useActionState(requestExtension, {});
  const [q, qa, qp] = useActionState(askQuestion, {});
  const [open, setOpen] = useState<"" | "submit" | "ext" | "ask">("");
  const needForce = !!s?.error?.includes("ما علّمتش");
  return (<div className="wo-actions"><Msg s={s} /><Msg s={e} /><Msg s={q} />
    <div className="actions">
      <button type="button" onClick={() => setOpen(open === "submit" ? "" : "submit")}>📦 {rework ? "سلّمت التعديل" : "سلّمت"}</button>
      {canExtend && !extPending && <button type="button" className="ghost" onClick={() => setOpen(open === "ext" ? "" : "ext")}>⏳ اطلب تمديد</button>}
      {extPending && <span className="pill warn">طلب التمديد مستني رد المدير</span>}
      <button type="button" className="ghost" onClick={() => setOpen(open === "ask" ? "" : "ask")}>عندي سؤال</button>
    </div>
    {open === "submit" && <form action={a} className="wo-sub"><input type="hidden" name="roleId" value={roleId} />
      <p className="sub">ارفع ملفات شغلك الأول من «ارفع ملف شغلك»، وعلّم على قائمة التسليمات. العداد بيقف أول ما تدوس.</p>
      <label>ملاحظة التسليم (اختياري)<textarea name="note" rows={2} placeholder="لينك، أو حاجة المدير لازم يعرفها" /></label>
      {needForce && <label className="chk"><input type="checkbox" name="force" value="1" /> سلّم برضه، وكتبت السبب في الملاحظة</label>}
      <button disabled={p} style={{ marginTop: 8 }}>تأكيد التسليم</button></form>}
    {open === "ext" && <form action={ea} className="wo-sub"><input type="hidden" name="roleId" value={roleId} />
      <div className="row"><label>محتاج لحد إمتى<input type="datetime-local" name="until" min={minExt} required /></label>
        <label>السبب<input name="reason" required placeholder="مثلاً: العميل لسه ما بعتش الداتا" /></label></div>
      <button disabled={ep} className="sm">إرسال الطلب</button></form>}
    {open === "ask" && <form action={qa} className="wo-sub"><input type="hidden" name="roleId" value={roleId} />
      <textarea name="text" rows={3} required placeholder="اكتب سؤالك" /><button className="sm" disabled={qp} style={{ marginTop: 6 }}>إرسال</button></form>}
  </div>);
}

export function ReviewForm({ roleId, reworkPct }: { roleId: string; reworkPct: number }) {
  const [s, a, p] = useActionState(reviewWork, {});
  const [mode, setMode] = useState<"" | "rework">("");
  return (<form action={a} className="wo-review"><Msg s={s} /><input type="hidden" name="roleId" value={roleId} />
    <div className="actions">
      <button name="decision" value="ACCEPTED" disabled={p}>👏 مقبول</button>
      <button type="button" className="ghost" onClick={() => setMode(mode ? "" : "rework")}>🔁 محتاج تعديل</button>
    </div>
    {mode === "rework" && <div style={{ marginTop: 10 }}>
      <label>المطلوب تعديله<textarea name="note" rows={3} placeholder="إيه اللي غلط وإيه المطلوب بالظبط" /></label>
      <div className="row"><label>معاد التعديل<input type="datetime-local" name="reworkDue" /></label>
        <label>الخصم<select name="deduct" defaultValue="1"><option value="1">خصم رجوع شغل {reworkPct}%</option><option value="0">من غير خصم (تعديل بسيط)</option></select></label></div>
      <button name="decision" value="REWORK" className="danger" disabled={p}>إرسال للتعديل</button>
    </div>}
  </form>);
}
