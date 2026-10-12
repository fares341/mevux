"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { addTodoAction } from "./todo-actions";

export default function TodoForm({ defaultKind = "TASK" }: { defaultKind?: "TASK" | "IDEA" }) {
  const [s, a, p] = useActionState(addTodoAction, {});
  const [kind, setKind] = useState(defaultKind);
  const [more, setMore] = useState(false);
  const form = useRef<HTMLFormElement>(null), title = useRef<HTMLInputElement>(null);
  useEffect(() => { if (s?.ok) { form.current?.reset(); setMore(false); title.current?.focus(); } }, [s]);
  return (<form action={a} ref={form} className="todo-add">
    {s?.error && <div className="msg bad" role="alert">{s.error}</div>}
    <input type="hidden" name="kind" value={kind} />
    <div className="todo-line">
      <div className="seg" role="radiogroup" aria-label="النوع">
        <button type="button" role="radio" aria-checked={kind === "TASK"} className={kind === "TASK" ? "on" : ""} onClick={() => setKind("TASK")}>مهمة</button>
        <button type="button" role="radio" aria-checked={kind === "IDEA"} className={kind === "IDEA" ? "on" : ""} onClick={() => setKind("IDEA")}>فكرة</button>
      </div>
      <input ref={title} name="title" required maxLength={300} aria-label={kind === "IDEA" ? "الفكرة" : "المهمة"} placeholder={kind === "IDEA" ? "فكرة عايز تفتكرها…" : "محتاج تعمل إيه؟ مثلاً: أكلّم عميل مطعم الريف"} />
      {kind === "TASK" && <input type="datetime-local" name="due" aria-label="إمتى (اختياري)" title="إمتى (اختياري)" className="todo-due" />}
      <button disabled={p}>{p ? "…" : "إضافة"}</button>
    </div>
    <button type="button" className="linkish" onClick={() => setMore((x) => !x)}>{more ? "− إخفاء التفاصيل" : "+ تفاصيل"}</button>
    {more && <textarea name="details" rows={3} placeholder="أي تفاصيل أو روابط" />}
  </form>);
}
