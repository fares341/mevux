"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { addRoleNote } from "./role-notes-actions";
import { useVoiceNote } from "../work-forms";

export default function RoleNoteForm({ roleId }: { roleId: string }) {
  const [s, a, p] = useActionState(addRoleNote, {});
  const [picked, setPicked] = useState<File[]>([]);
  const form = useRef<HTMLFormElement>(null);
  const voice = useVoiceNote();
  useEffect(() => { if (s?.ok) { form.current?.reset(); setPicked([]); voice.clear(); } }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  return (<form action={a} ref={form}>
    {s?.error && <div className="msg bad" role="alert">{s.error}</div>}
    {s?.ok && <div className="msg ok">{s.ok}</div>}
    <input type="hidden" name="roleId" value={roleId} />
    <label>التيكت<textarea name="text" rows={4} placeholder={"المطلوب بالظبط، الخطوات، الروابط، الأولويات…\nمثال: اربط شيت المنيو بالبوت، واعمل رد تلقائي على سؤال الأسعار."} /></label>
    <div className="actions" style={{ marginTop: 10 }}>
      <label className="btn secondary file-pick">ارفع صور أو ملفات
        <input type="file" name="files" multiple hidden accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.zip,.fig,.n8n" onChange={(e) => setPicked(Array.from(e.target.files || []))} />
      </label>
      <button type="button" className={voice.state === "rec" ? "danger" : "ghost"} onClick={voice.toggle}>
        {voice.state === "rec" ? `إيقاف التسجيل (${voice.secs} ث)` : voice.file ? "سجّل فويس تاني" : "🎤 سجّل فويس نوت"}
      </button>
      <input type="file" name="voice" hidden ref={voice.input} />
    </div>
    {voice.error && <div className="msg bad">{voice.error}</div>}
    {picked.length > 0 && <ul className="picked">{picked.map((f) => <li key={f.name + f.size}>{f.type.startsWith("image/") ? <img src={URL.createObjectURL(f)} alt="" /> : null}<span>{f.name}</span></li>)}</ul>}
    {voice.url && <div className="voice-prev"><audio controls src={voice.url} /><button type="button" className="sm ghost" onClick={voice.clear}>شيل الفويس</button></div>}
    <button disabled={p || voice.state === "rec"} style={{ marginTop: 12 }}>{p ? "بيترفع…" : "حفظ التفاصيل"}</button>
  </form>);
}
