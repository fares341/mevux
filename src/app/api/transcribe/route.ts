import { getUser } from "@/lib/auth";
import { transcribe } from "@/lib/ai";
import { rateLimit } from "@/lib/ratelimit";

export const maxDuration = 120;
export async function POST(req: Request) {
  const u = await getUser();
  if (!u) return Response.json({ error: "سجّل دخول الأول." }, { status: 401 });
  if (!rateLimit("tr:" + u.id, 15, 60_000)) return Response.json({ error: "استنى دقيقة." }, { status: 429 });
  const audio = (await req.formData()).get("audio");
  if (!(audio instanceof File) || !audio.size) return Response.json({ error: "مفيش صوت." }, { status: 400 });
  if (audio.size > 12 * 1024 * 1024) return Response.json({ error: "الفويس طويل. خليه أقل من 5 دقايق." }, { status: 400 });
  try { return Response.json({ text: await transcribe(Buffer.from(await audio.arrayBuffer()).toString("base64")) }); }
  catch (e) { await (await import("@/lib/audit")).audit(u.id, "transcribe_error", e instanceof Error ? e.message : String(e)); return Response.json({ error: e instanceof Error && /^[\u0600-\u06FF]/.test(e.message) ? e.message : "مقدرتش أحوّل الفويس لكلام. جرّب تاني." }, { status: 500 }); }
}
