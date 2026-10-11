"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Member = { id: string; name: string; roles: string[]; isAdmin: boolean; color: number; lastReadAt: string | null };
type Reply = { id: string; name: string; userId: string; text: string } | null;
type M = { id: string; userId: string; name: string; text: string; deleted: boolean; file: { id: string; name: string | null; size: number | null; mime: string; voice: boolean } | null; reply: Reply; at: string };

const hm = (iso: string) => new Date(iso).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" });
const dayKey = (iso: string) => new Date(iso).toDateString();
function dayLabel(iso: string) {
  const d = new Date(iso), t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "النهارده";
  if (d.toDateString() === y.toDateString()) return "إمبارح";
  return d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === t.getFullYear() ? undefined : "numeric" });
}
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
const kb = (n: number | null) => (n ? (n > 1048576 ? `${(n / 1048576).toFixed(1)} م.ب` : `${Math.max(1, Math.round(n / 1024))} ك.ب`) : "");

export default function Room({ projectId, me, title, sub }: { projectId: string; me: string; title: string; sub: string }) {
  const [msgs, setMsgs] = useState<M[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reply, setReply] = useState<M | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [rec, setRec] = useState<{ on: boolean; secs: number }>({ on: false, secs: 0 });
  const box = useRef<HTMLDivElement>(null), fileRef = useRef<HTMLInputElement>(null), ta = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<MediaRecorder | null>(null), timer = useRef<ReturnType<typeof setInterval> | null>(null), cancelRec = useRef(false);
  const stick = useRef(true), firstLoad = useRef(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/chat/${projectId}`, { cache: "no-store" });
      if (!r.ok) return;
      const j: { messages: M[]; members: Member[] } = await r.json();
      setMsgs(j.messages); setMembers(j.members);
    } catch {}
  }, [projectId]);

  useEffect(() => { load(); const t = setInterval(load, 3500); return () => clearInterval(t); }, [load]);
  // Keep the view pinned to the bottom unless the person scrolled up to read.
  useEffect(() => {
    const el = box.current; if (!el) return;
    if (firstLoad.current || stick.current) { el.scrollTop = el.scrollHeight; if (msgs.length) firstLoad.current = false; }
  }, [msgs]);

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const others = members.filter((m) => m.id !== me);
  const seenBy = (m: M) => others.filter((o) => o.lastReadAt && o.lastReadAt >= m.at);

  async function post(fd: FormData) {
    setBusy(true); setErr("");
    if (reply) fd.append("replyTo", reply.id);
    try {
      const r = await fetch(`/api/chat/${projectId}`, { method: "POST", body: fd });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "الرسالة ما اتبعتتش");
      setText(""); setFile(null); setReply(null); if (fileRef.current) fileRef.current.value = "";
      stick.current = true; await load();
    } catch (x) { setErr(x instanceof Error ? x.message : "الرسالة ما اتبعتتش"); }
    finally { setBusy(false); ta.current?.focus(); }
  }
  function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy || (!text.trim() && !file)) return;
    const fd = new FormData(); fd.append("text", text); if (file) fd.append("file", file);
    post(fd);
  }
  async function toggleRec() {
    if (rec.on) { recRef.current?.stop(); return; }
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream); const chunks: Blob[] = []; cancelRec.current = false;
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop()); if (timer.current) clearInterval(timer.current); setRec({ on: false, secs: 0 });
        if (cancelRec.current || !chunks.length) return;
        const type = (r.mimeType || "audio/webm").split(";")[0];
        const fd = new FormData(); fd.append("voice", "1"); fd.append("file", new File(chunks, `voice.${type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm"}`, { type }));
        post(fd);
      };
      r.start(); recRef.current = r; setRec({ on: true, secs: 0 });
      timer.current = setInterval(() => setRec((x) => ({ ...x, secs: x.secs + 1 })), 1000);
      setTimeout(() => r.state === "recording" && r.stop(), 5 * 60 * 1000);
    } catch { setErr("المتصفح رفض الوصول للمايك. اسمح بيه من إعدادات المتصفح."); }
  }
  async function del(m: M) {
    if (!window.confirm("تمسح الرسالة دي عند الكل؟")) return;
    await fetch(`/api/chat/${projectId}?id=${m.id}`, { method: "DELETE" }); load();
  }

  const nameColor = (uid: string) => `var(--wa-${byId.get(uid)?.color ?? 0})`;
  return (<div className="wa">
    <header className="wa-head">
      <button type="button" className="wa-title" onClick={() => setShowInfo((v) => !v)} aria-expanded={showInfo}>
        <span className="wa-av">{initials(title)}</span>
        <span className="wa-tt"><b>{title}</b><small>{members.length ? members.map((m) => (m.id === me ? "إنت" : m.name.split(" ")[0])).join("، ") : sub}</small></span>
      </button>
    </header>
    {showInfo && <div className="wa-info">
      <b>أعضاء الجروب ({members.length})</b>
      <ul>{members.map((m) => <li key={m.id}><span className="wa-av sm" style={{ background: nameColor(m.id) }}>{initials(m.name)}</span>
        <span><b>{m.name}{m.id === me && " (إنت)"}</b><small>{m.isAdmin ? "المدير" : m.roles.join("، ")}</small></span></li>)}</ul>
    </div>}

    <div className="wa-body" ref={box} aria-live="polite" onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
      <div className="wa-sys">الجروب ده للمشروع: كل اللي في المشروع بيشوفوا نفس الرسائل.</div>
      {!msgs.length && <div className="wa-sys">مفيش رسائل لسه. ابدأ إنت.</div>}
      {msgs.map((m, i) => {
        const prev = msgs[i - 1];
        const newDay = !prev || dayKey(prev.at) !== dayKey(m.at);
        const cont = !newDay && prev && prev.userId === m.userId && +new Date(m.at) - +new Date(prev.at) < 5 * 60000;
        const mine = m.userId === me;
        const mem = byId.get(m.userId);
        const seen = mine ? seenBy(m) : [];
        const img = m.file && m.file.mime.startsWith("image/");
        const audio = m.file && (m.file.voice || m.file.mime.startsWith("audio/"));
        const video = m.file && m.file.mime.startsWith("video/");
        const src = m.file ? `/api/chat-files/${m.file.id}` : "";
        return (<div key={m.id}>
          {newDay && <div className="wa-day"><span>{dayLabel(m.at)}</span></div>}
          <div className={"wa-row " + (mine ? "out" : "in") + (cont ? " cont" : "")}>
            {!mine && <span className="wa-av sm" style={{ background: nameColor(m.userId), visibility: cont ? "hidden" : undefined }} title={m.name}>{initials(m.name)}</span>}
            <div className={"wa-msg" + (img ? " media" : "")} tabIndex={0}>
              {!mine && !cont && <div className="wa-from" style={{ color: nameColor(m.userId) }}>{m.name}{mem && <small>{mem.isAdmin ? " · المدير" : mem.roles.length ? " · " + mem.roles.join("، ") : ""}</small>}</div>}
              {m.reply && <div className="wa-quote" style={{ borderColor: nameColor(m.reply.userId) }}><b style={{ color: nameColor(m.reply.userId) }}>{m.reply.userId === me ? "إنت" : m.reply.name}</b><span>{m.reply.text}</span></div>}
              {m.deleted ? <i className="wa-del">🚫 الرسالة دي اتمسحت</i> : <>
                {img && <a href={src} target="_blank" rel="noopener"><img src={src} alt={m.file!.name || ""} loading="lazy" /></a>}
                {audio && <div className="wa-voice"><span aria-hidden="true">🎤</span><audio controls preload="metadata" src={src} /></div>}
                {video && <video controls preload="metadata" src={src} />}
                {m.file && !img && !audio && !video && <a className="wa-doc" href={src} target="_blank" rel="noopener"><span className="ext">{(m.file.name?.split(".").pop() || "ملف").slice(0, 4).toUpperCase()}</span><span className="nm">{m.file.name}<small>{kb(m.file.size)}</small></span></a>}
                {m.text && <div className="wa-text">{m.text}</div>}
              </>}
              <div className="wa-meta">
                <span>{hm(m.at)}</span>
                {mine && !m.deleted && <span className={"wa-ticks" + (others.length && seen.length === others.length ? " read" : "")} title={seen.length ? "شافها: " + seen.map((s) => s.name).join("، ") : "اتبعتت"}>✓✓</span>}
              </div>
              {!m.deleted && <div className="wa-acts">
                <button type="button" onClick={() => { setReply(m); ta.current?.focus(); }}>رد</button>
                {(mine || byId.get(me)?.isAdmin) && <button type="button" onClick={() => del(m)}>مسح</button>}
              </div>}
            </div>
          </div>
          {mine && seen.length > 0 && i === msgs.length - 1 && <div className="wa-seen">شافها: {seen.map((s) => s.name.split(" ")[0]).join("، ")}</div>}
        </div>);
      })}
    </div>

    {err && <div className="msg bad" role="alert" style={{ margin: "8px 12px 0" }}>{err}</div>}
    {reply && <div className="wa-replybar"><div className="wa-quote" style={{ borderColor: nameColor(reply.userId) }}><b style={{ color: nameColor(reply.userId) }}>رد على {reply.userId === me ? "نفسك" : reply.name}</b><span>{reply.text || (reply.file?.voice ? "🎤 فويس نوت" : reply.file ? "📎 " + reply.file.name : "")}</span></div><button type="button" className="sm ghost" onClick={() => setReply(null)} aria-label="إلغاء الرد">✕</button></div>}
    {file && <div className="wa-replybar"><span>📎 {file.name} <small className="sub">{kb(file.size)}</small></span><button type="button" className="sm ghost" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} aria-label="إزالة الملف">✕</button></div>}
    <form className="wa-compose" onSubmit={send}>
      <label className="wa-ic" title="ارفق صورة أو ملف" aria-label="ارفق صورة أو ملف">📎<input ref={fileRef} type="file" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      {rec.on ? <div className="wa-recording"><span className="dot" />بيسجّل… {Math.floor(rec.secs / 60)}:{String(rec.secs % 60).padStart(2, "0")}
        <button type="button" className="sm ghost" onClick={() => { cancelRec.current = true; recRef.current?.stop(); }}>إلغاء</button></div>
        : <textarea ref={ta} id="room-text" aria-label="رسالتك" rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب رسالة"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />}
      {text.trim() || file ? <button className="wa-send" disabled={busy} aria-label="إرسال">➤</button>
        : <button type="button" className={"wa-send" + (rec.on ? " rec" : "")} onClick={toggleRec} disabled={busy} aria-label={rec.on ? "ابعت الفويس" : "سجّل فويس"}>{rec.on ? "➤" : "🎤"}</button>}
    </form>
  </div>);
}
