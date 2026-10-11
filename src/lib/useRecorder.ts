"use client";
import { useRef, useState } from "react";
import { toWav } from "./wav";

/** Mic → WAV → /api/transcribe → text. */
export function useVoiceToText(onText: (t: string) => void) {
  const [state, setState] = useState<"idle" | "rec" | "busy">("idle");
  const [error, setError] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  async function toggle() {
    if (state === "rec") { rec.current?.stop(); return; }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream); const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); setState("busy");
        try {
          const fd = new FormData(); fd.append("audio", await toWav(new Blob(chunks, { type: r.mimeType })), "voice.wav");
          const res = await fetch("/api/transcribe", { method: "POST", body: fd }); const j = await res.json();
          if (!res.ok) throw new Error(j.error || "مقدرتش أحوّل الفويس لكلام.");
          onText(j.text);
        } catch (e) { setError(e instanceof Error ? e.message : "حصل خطأ"); }
        finally { setState("idle"); }
      };
      r.start(); rec.current = r; setState("rec");
      setTimeout(() => r.state === "recording" && r.stop(), 300000);
    } catch { setError("المتصفح رفض الوصول للمايك. اسمح بيه من إعدادات المتصفح."); }
  }
  return { state, error, toggle };
}
