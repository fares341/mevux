import "server-only";
import { getRaw, getSettings } from "./settings";
import { decrypt } from "./crypto";

export type Msg = { role: "system" | "user" | "assistant" | "tool"; content: unknown; tool_calls?: ToolCall[]; tool_call_id?: string };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ToolDef = { type: "function"; function: { name: string; description: string; parameters: object } };

export async function aiConfig() {
  const enc = await getRaw("openrouterKey");
  if (!enc) throw new Error("مفتاح OpenRouter مش متسجل. المدير يضيفه من الإعدادات.");
  const s = await getSettings();
  return { key: decrypt(enc), model: s.aiModel, audioModel: s.aiAudioModel };
}

async function call(body: object, key: string) {
  const r = await fetch((process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1") + "/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "MEVIX System" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (r.status === 402) throw new Error("رصيد OpenRouter خلص. المدير يغيّر المفتاح من الإعدادات.");
  if (r.status === 401) throw new Error("مفتاح OpenRouter مرفوض. المدير يراجعه من الإعدادات.");
  if (!r.ok) throw new Error(`خدمة الذكاء الاصطناعي ردت بخطأ (${r.status}).`);
  const j = await r.json();
  return j.choices?.[0]?.message as { content?: string | null; tool_calls?: ToolCall[] };
}

export async function chat(messages: Msg[], tools?: ToolDef[], opts: { json?: boolean; maxTokens?: number } = {}) {
  const c = await aiConfig();
  return call({ model: c.model, messages, tools, temperature: 0.2, max_tokens: opts.maxTokens ?? 1500, ...(opts.json ? { response_format: { type: "json_object" } } : {}) }, c.key);
}

/** Voice note → text. Audio arrives as 16 kHz mono WAV (base64). */
export async function transcribe(wavBase64: string) {
  const c = await aiConfig();
  const m = await call({
    model: c.audioModel, temperature: 0, max_tokens: 1000,
    messages: [{ role: "user", content: [
      { type: "text", text: "Transcribe this voice note exactly as spoken (usually Egyptian Arabic, may mix English technical words). Output only the transcript, nothing else." },
      { type: "input_audio", input_audio: { data: wavBase64, format: "wav" } },
    ] }],
  }, c.key);
  return (m?.content || "").trim();
}
