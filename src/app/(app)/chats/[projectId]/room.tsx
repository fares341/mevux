"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type M = { id: string; userId: string; name: string; text: string; file: { id: string; name: string | null; size: number | null } | null; at: string };
const time = (iso: string) => new Date(iso).toLocaleString("ar-EG", { weekday: "short", hour: "numeric", minute: "2-digit" });

export default function Room({ projectId, me }: { projectId: string; me: string }) {
  const [msgs, setMsgs] = useState<M[]>([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null), fileRef = useRef<HTMLInputElement>(null);
  const lastAt = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/chat/${projectId}${lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : ""}`, { cache: "no-store" });
      if (!r.ok) return;
      const j: { messages: M[] } = await r.json();
      if (j.messages.length) {
        lastAt.current = j.messages[j.messages.length - 1].at;
        setMsgs((m) => { const seen = new Set(m.map((x) => x.id)); return [...m, ...j.messages.filter((x) => !seen.has(x.id))]; });
      }
    } catch {}
  }, [projectId]);

  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !file) return;
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("text", text); if (file) fd.append("file", file);
    try {
      const r = await fetch(`/api/chat/${projectId}`, { method: "POST", body: fd });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "مبعتتش");
      setText(""); setFile(null); if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (x) { setErr(x instanceof Error ? x.message : "مبعتتش"); }
    finally { setBusy(false); }
  }

  return (<div className="chat card plain">
    <div className="msgs" aria-live="polite">
      {!msgs.length && <p className="sub">ابدأ المحادثة: اكتب وصلت لإيه أو اسأل الفريق.</p>}
      {msgs.map((m) => <div key={m.id} className={"bubble " + (m.userId === me ? "user" : "assistant")}>
        {m.userId !== me && <b className="who">{m.name}</b>}
        {m.text}
        {m.file && <a className="att" href={`/api/chat-files/${m.file.id}`} target="_blank" rel="noopener">📎 {m.file.name}</a>}
        <span className="at">{time(m.at)}</span>
      </div>)}
      <div ref={end} />
    </div>
    {err && <div className="msg bad" role="alert">{err}</div>}
    {file && <div className="sub">📎 {file.name} <button type="button" className="sm ghost" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>إزالة</button></div>}
    <form className="composer" onSubmit={send}>
      <textarea id="room-text" aria-label="رسالتك" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب رسالة للفريق…"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} />
      <div className="actions">
        <label className="btn ghost-link" style={{ cursor: "pointer", flexDirection: "row" }}>📎 ملف<input ref={fileRef} type="file" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <button disabled={busy}>{busy ? "بيبعت…" : "إرسال"}</button>
      </div>
    </form>
  </div>);
}
