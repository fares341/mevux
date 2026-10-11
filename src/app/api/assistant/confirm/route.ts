import { getUser } from "@/lib/auth";
import { confirmPending, cancelPending, logConfirmation } from "@/lib/assistant-guard";
import { runTool } from "@/lib/assistant-tools";

// The admin's click on "confirm" (a real human action in the UI) is what runs a sensitive action.
export async function POST(req: Request) {
  const u = await getUser();
  if (!u) return Response.json({ error: "سجّل دخول الأول." }, { status: 401 });
  if (u.role !== "ADMIN") return Response.json({ error: "غير مسموح." }, { status: 403 });
  const { id, cancel } = await req.json().catch(() => ({}));
  if (typeof id !== "string") return Response.json({ error: "طلب غير صحيح." }, { status: 400 });
  if (cancel) { await cancelPending(u, id); await logConfirmation(u, "اتلغى."); return Response.json({ reply: "تمام، اتلغى ومش هيتنفذ." }); }
  try {
    const r = await confirmPending(u, id, (name, args) => runTool(name, args, { u, files: [] }));
    const res = r.result as Record<string, unknown> | undefined;
    const err = res && typeof res === "object" && "error" in res ? String(res.error) : null;
    const reply = err ? `ما اتنفذش: ${err}` : `✓ اتنفذ: ${r.summary}${res && typeof res === "object" && "newPassword" in res ? `\nالباسورد الجديد: ${res.newPassword} (بيظهر مرة واحدة)` : ""}${res && typeof res === "object" && "password" in res ? `\nالباسورد: ${res.password} (بيظهر مرة واحدة)` : ""}`;
    await logConfirmation(u, reply);
    return Response.json({ reply });
  } catch (e) {
    return Response.json({ error: e instanceof Error && /^[؀-ۿ]/.test(e.message) ? e.message : "ما اتنفذش. جرّب تاني." }, { status: 400 });
  }
}
