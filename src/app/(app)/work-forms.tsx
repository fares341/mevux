"use client";
import { useActionState, useState, useRef, useEffect } from "react";
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
  const [picked, setPicked] = useState<File[]>([]);
  const form = useRef<HTMLFormElement>(null);
  const voice = useVoiceNote();
  const members = projects.find((x) => x.id === pid)?.members || [];
  useEffect(() => { if (s?.ok) { form.current?.reset(); setPicked([]); voice.clear(); } }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  return (<form action={a} ref={form}><Msg s={s} />
    <div className="row">
      <label>المشروع<select id="c-proj" name="projectId" value={pid} onChange={(e) => setPid(e.target.value)}>{projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label>على مين<select id="c-who" name="againstId" required defaultValue="">{<option value="">— اختر —</option>}{members.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    </div>
    <div className="row">
      <label>المشكلة<textarea id="c-text" name="text" required placeholder="إيه اللي حصل، وإمتى، وأثّر على إيه" /></label>
      <label>الدليل بالكلام<small className="hint">رابط، أو وصف للسكرين، أو رسالة العميل</small><textarea id="c-ev" name="evidence" /></label>
    </div>
    <fieldset className="evidence">
      <legend>ارفق الدليل</legend>
      <p className="sub" style={{ margin: "0 0 10px" }}>صور، سكرينات، ملفات، فيديو، أو فويس نوت. بتوصل للمدير بس، والشخص اللي عليه الشكوى مش بيشوفها.</p>
      <div className="actions">
        <label className="btn secondary file-pick">
          ارفع صور أو ملفات
          <input id="c-files" type="file" name="files" multiple hidden accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" onChange={(e) => setPicked(Array.from(e.target.files || []))} />
        </label>
        <button type="button" className={voice.state === "rec" ? "danger" : "ghost"} onClick={voice.toggle}>
          {voice.state === "rec" ? `إيقاف التسجيل (${voice.secs} ث)` : voice.file ? "سجّل فويس تاني" : "سجّل فويس نوت"}
        </button>
        <input type="file" name="voice" hidden ref={voice.input} />
      </div>
      {voice.error && <div className="msg bad">{voice.error}</div>}
      {picked.length > 0 && <ul className="picked">{picked.map((f) => <li key={f.name + f.size}>{f.type.startsWith("image/") ? <img src={URL.createObjectURL(f)} alt="" /> : null}<span>{f.name}</span><small>{Math.max(1, Math.round(f.size / 1024))} ك.ب</small></li>)}</ul>}
      {voice.url && <div className="voice-prev"><audio controls src={voice.url} /><button type="button" className="sm ghost" onClick={voice.clear}>شيل الفويس</button></div>}
    </fieldset>
    <button disabled={p || voice.state === "rec"}>{p ? "بيترفع…" : "إرسال الشكوى"}</button>
  </form>);
}

/** Records a voice note and puts it into a hidden <input type=file name=voice> so it is sent with the form. */
function useVoiceNote() {
  const [state, setState] = useState<"idle" | "rec">("idle");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const put = (f: File | null) => {
    setFile(f); setUrl((old) => { if (old) URL.revokeObjectURL(old); return f ? URL.createObjectURL(f) : ""; });
    if (input.current) { const dt = new DataTransfer(); if (f) dt.items.add(f); input.current.files = dt.files; }
  };
  async function toggle() {
    if (state === "rec") { rec.current?.stop(); return; }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream); const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        setState("idle");
        const type = (r.mimeType || "audio/webm").split(";")[0];
        const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
        put(new File(chunks, `فويس-نوت.${ext}`, { type }));
      };
      r.start(); rec.current = r; setState("rec"); setSecs(0);
      timer.current = setInterval(() => setSecs((x) => x + 1), 1000);
      setTimeout(() => r.state === "recording" && r.stop(), 5 * 60 * 1000);
    } catch { setError("المتصفح رفض الوصول للمايك. اسمح بيه من إعدادات المتصفح."); }
  }
  return { state, url, file, secs, error, input, toggle, clear: () => put(null) };
}

export function RespondComplaint({ id }: { id: string }) {
  const [s, a, p] = useActionState(respondComplaintAction, {});
  return (<form action={a} style={{ marginTop: 8 }}><Msg s={s} /><input type="hidden" name="id" value={id} />
    <textarea id={"cr-" + id} name="response" required placeholder="ردك" /><button className="sm" style={{ marginTop: 6 }} disabled={p}>إرسال الرد</button></form>);
}
