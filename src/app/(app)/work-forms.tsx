"use client";
import { useActionState, useState } from "react";
import { createTaskAction, addUpdateAction, fileComplaintAction, respondComplaintAction } from "./work-actions";
type R = { ok?: string; error?: string };
const Msg = ({ s }: { s: R }) => s?.error ? <div className="msg bad" role="alert">{s.error}</div> : s?.ok ? <div className="msg ok">{s.ok}</div> : null;
type P = { id: string; name: string };

export function TaskForm({ projects, people }: { projects: P[]; people: P[] }) {
  const [s, a, p] = useActionState(createTaskAction, {});
  return (<form action={a}><Msg s={s} />
    <div className="row">
      <label>المشروع<select id="t-proj" name="projectId" required defaultValue="">{<option value="">— اختر —</option>}{projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label>المهمة<input id="t-title" name="title" required maxLength={200} /></label>
      <label>مسؤول عنها<select id="t-who" name="assigneeId" defaultValue=""><option value="">—</option>{people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label>الموعد<input id="t-due" name="dueDate" type="date" /></label>
    </div>
    <label style={{ marginBottom: 12 }}>تفاصيل<textarea id="t-details" name="details" /></label>
    <button disabled={p}>إضافة المهمة</button>
  </form>);
}

export function UpdateForm({ projects }: { projects: P[] }) {
  const [s, a, p] = useActionState(addUpdateAction, {});
  return (<form action={a}><Msg s={s} />
    <div className="row">
      <label>المشروع<select id="u-proj" name="projectId" defaultValue={projects[0]?.id || ""}><option value="">عام</option>{projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    </div>
    <label style={{ marginBottom: 12 }}>وصلت لإيه النهارده<textarea id="u-text" name="text" required placeholder="خلصت ربط الدرايف، فاضل اختبار الحسابات…" /></label>
    <button disabled={p}>تسجيل التحديث</button>
  </form>);
}

export function ComplaintForm({ projects }: { projects: (P & { members: P[] })[] }) {
  const [s, a, p] = useActionState(fileComplaintAction, {});
  const [pid, setPid] = useState(projects[0]?.id || "");
  const members = projects.find((x) => x.id === pid)?.members || [];
  return (<form action={a}><Msg s={s} />
    <div className="row">
      <label>المشروع<select id="c-proj" name="projectId" value={pid} onChange={(e) => setPid(e.target.value)}>{projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label>على مين<select id="c-who" name="againstId" required defaultValue="">{<option value="">— اختر —</option>}{members.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    </div>
    <div className="row">
      <label>المشكلة<textarea id="c-text" name="text" required /></label>
      <label>الدليل<small>رابط، وصف سكرين، رسالة العميل</small><textarea id="c-ev" name="evidence" /></label>
    </div>
    <button disabled={p}>إرسال الشكوى</button>
  </form>);
}

export function RespondComplaint({ id }: { id: string }) {
  const [s, a, p] = useActionState(respondComplaintAction, {});
  return (<form action={a} style={{ marginTop: 8 }}><Msg s={s} /><input type="hidden" name="id" value={id} />
    <textarea id={"cr-" + id} name="response" required placeholder="ردك" /><button className="sm" style={{ marginTop: 6 }} disabled={p}>إرسال الرد</button></form>);
}
