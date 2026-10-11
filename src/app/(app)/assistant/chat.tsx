"use client";
import { useEffect, useRef, useState } from "react";

type P = { id: string; summary: string; state?: "busy" | "done" };
type M = { role: "user" | "assistant"; content: string; pending?: P[] };

import { toWav } from "@/lib/wav";

// Turns internal paths like /projects/abc or /api/briefs/x into links.
function Linkify({ text }: { text: string }) {
  const parts = text.split(/(\/(?:projects|clients|briefs|api\/briefs|chats|finance|team|suppliers|settings|tasks|follow|complaints)(?:\/[\w-]+)?)/g);
  return <>{parts.map((p, i) => (i % 2 ? <a key={i} href={p} target={p.startsWith("/api/") ? "_blank" : undefined} rel="noopener">{p.startsWith("/api/briefs") ? "افتح البريف" : "افتح"}</a> : p))}</>;
}

export default function Chat({ initial, hints }: { initial: M[]; hints: string[] }) {
  const [msgs, setMsgs] = useState<M[]>(initial);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  async function send(body: { text?: string; audio?: Blob }) {
    const t = (body.text ?? "").trim();
    if (!t && !body.audio && !files.length) return;
    setErr(""); setBusy(true);
    const fd = new FormData();
    if (t) fd.append("text", t);
    if (body.audio) fd.append("audio", body.audio, "voice.wav");
    files.forEach((f) => fd.append("files", f));
    const label = [t, body.audio ? "🎙️ فويس" : "", files.length ? `📎 ${files.map((f) => f.name).join("، ")}` : ""].filter(Boolean).join("\n");
    setMsgs((m) => [...m, { role: "user", content: label }]);
    setText(""); setFiles([]); if (fileInput.current) fileInput.current.value = "";
    try {
      const r = await fetch("/api/assistant", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "حصل خطأ");
      setMsgs((m) => {
        const copy = [...m];
        if (j.transcript) copy[copy.length - 1] = { role: "user", content: [t, `🎙️ ${j.transcript}`].filter(Boolean).join("\n") + (label.includes("📎") ? "\n" + label.split("\n").pop() : "") };
        return [...copy, { role: "assistant", content: j.reply, pending: j.pending?.length ? j.pending : undefined }];
      });
    } catch (e) { setErr(e instanceof Error ? e.message : "حصل خطأ"); }
    finally { setBusy(false); }
  }

  // Sensitive actions only run when the owner clicks here (the assistant can't approve them itself).
  async function decide(mi: number, p: P, cancel = false) {
    const mark = (state: P["state"]) => setMsgs((m) => m.map((x, i) => (i === mi ? { ...x, pending: x.pending?.map((y) => (y.id === p.id ? { ...y, state } : y)) } : x)));
    mark("busy"); setErr("");
    try {
      const r = await fetch("/api/assistant/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: p.id, cancel }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "حصل خطأ");
      mark("done"); setMsgs((m) => [...m, { role: "assistant", content: j.reply }]);
    } catch (e) { mark(undefined); setErr(e instanceof Error ? e.message : "حصل خطأ"); }
  }

  async function toggleMic() {
    if (rec) { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream); const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = async () => { stream.getTracks().forEach((t) => t.stop()); setRec(null); try { await send({ text, audio: await toWav(new Blob(chunks, { type: r.mimeType })) }); } catch { setErr("مش قادر أقرا التسجيل."); } };
      r.start(); setRec(r);
      setTimeout(() => r.state === "recording" && r.stop(), 180000);
    } catch { setErr("المتصفح رفض الوصول للمايك. اسمح بيه من إعدادات المتصفح."); }
  }

  async function clearChat() { await fetch("/api/assistant", { method: "DELETE" }); setMsgs([]); }

  return (<div className="chat card plain">
    <div className="msgs" aria-live="polite">
      {!msgs.length && <div className="hints"><p className="sub">جرّب:</p>{hints.map((h) => <button key={h} className="sm ghost" onClick={() => send({ text: h })} disabled={busy}>{h}</button>)}</div>}
      {msgs.map((m, i) => <div key={i} className={"bubble " + m.role}>{m.role === "assistant" ? <Linkify text={m.content} /> : m.content}
        {m.pending?.map((p) => <div key={p.id} className="confirm-box">
          <b>محتاج تأكيدك:</b><span>{p.summary}</span>
          {p.state === "done" ? <small>✓ اتعمل</small> : <div className="actions">
            <button className="sm" disabled={p.state === "busy"} onClick={() => decide(i, p)}>تأكيد</button>
            <button className="sm ghost" disabled={p.state === "busy"} onClick={() => decide(i, p, true)}>إلغاء</button></div>}
        </div>)}</div>)}
      {busy && <div className="bubble assistant typing">بيفكر…</div>}
      <div ref={end} />
    </div>
    {err && <div className="msg bad" role="alert">{err}</div>}
    {files.length > 0 && <div className="sub">📎 {files.map((f) => f.name).join("، ")} <button className="sm ghost" onClick={() => { setFiles([]); if (fileInput.current) fileInput.current.value = ""; }}>إزالة</button></div>}
    <form className="composer" onSubmit={(e) => { e.preventDefault(); send({ text }); }}>
      <textarea id="chat-text" aria-label="رسالتك" value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب رسالتك…" rows={2}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send({ text }); } }} disabled={busy || !!rec} />
      <div className="actions">
        <button type="button" className={rec ? "danger" : "ghost"} onClick={toggleMic} disabled={busy} aria-pressed={!!rec}>{rec ? "⏹ إيقاف وإرسال" : "🎙️ فويس"}</button>
        <label className="btn ghost-link" style={{ cursor: "pointer", flexDirection: "row" }}>📎 ملف<input ref={fileInput} type="file" multiple hidden onChange={(e) => setFiles([...(e.target.files || [])].slice(0, 5))} /></label>
        <button disabled={busy || !!rec}>إرسال</button>
        {msgs.length > 0 && <button type="button" className="sm ghost" onClick={clearChat} disabled={busy}>محادثة جديدة</button>}
      </div>
    </form>
  </div>);
}
