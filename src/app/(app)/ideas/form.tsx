"use client";
import { useActionState, useEffect, useRef } from "react";
import { addIdea } from "./actions";
import { IDEA_AREA, IDEA_PRIORITY } from "@/lib/labels";

export default function IdeaForm() {
  const [s, a, p] = useActionState(addIdea, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (s?.ok) ref.current?.reset(); }, [s]);
  return (<form action={a} ref={ref}>
    {s?.error && <div className="msg bad" role="alert">{s.error}</div>}
    {s?.ok && <div className="msg ok">{s.ok}</div>}
    <label>الفكرة<input id="idea-title" name="title" required placeholder="مثلاً: باقة صيانة شهرية للعملاء القدام" /></label>
    <label style={{ marginTop: 10 }}>تفاصيل (اختياري)<textarea id="idea-details" name="details" rows={3} placeholder="ليه، وإزاي، وأي حاجة في دماغك" /></label>
    <div className="row" style={{ marginTop: 10 }}>
      <label>تخص<select id="idea-area" name="area" defaultValue="COMPANY">{Object.entries(IDEA_AREA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label>الأهمية<select id="idea-priority" name="priority" defaultValue="MID">{Object.entries(IDEA_PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    </div>
    <button disabled={p} style={{ marginTop: 12 }}>حفظ الفكرة</button>
  </form>);
}
