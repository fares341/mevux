import { and, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/access";
import { messages, groupInfo } from "@/lib/chat";
import { db, projectMessages } from "@/lib/db";
import { checkFile, saveFile, removeStored } from "@/lib/storage";
import { rateLimit } from "@/lib/ratelimit";

type P = { params: Promise<{ projectId: string }> };

export async function GET(_: Request, { params }: P) {
  const u = await getUser();
  if (!u) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { projectId } = await params;
  try {
    const msgs = await messages(u, projectId);
    return Response.json({ messages: msgs, members: await groupInfo(projectId) });
  } catch { return Response.json({ error: "not found" }, { status: 404 }); }
}

export async function POST(req: Request, { params }: P) {
  const u = await getUser();
  if (!u) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { projectId } = await params;
  if (!(await canAccessProject(u, projectId))) return Response.json({ error: "not found" }, { status: 404 });
  if (!rateLimit("chat:" + u.id, 40, 60_000)) return Response.json({ error: "رسائل كتير. استنى شوية." }, { status: 429 });
  const fd = await req.formData();
  const text = String(fd.get("text") || "").trim().slice(0, 4000);
  const file = fd.get("file");
  const voice = fd.get("voice") === "1";
  let replyToId = String(fd.get("replyTo") || "") || null;
  if (replyToId) { // a reply must point at a message in the same group
    const r = await db.query.projectMessages.findFirst({ where: and(eq(projectMessages.id, replyToId), eq(projectMessages.projectId, projectId)) });
    if (!r) replyToId = null;
  }
  let f: Awaited<ReturnType<typeof saveFile>> | null = null;
  if (file instanceof File && file.size) {
    const err = checkFile(file);
    if (err) return Response.json({ error: err }, { status: 400 });
    f = await saveFile(file);
  }
  if (!text && !f) return Response.json({ error: "اكتب رسالة." }, { status: 400 });
  const [m] = await db.insert(projectMessages).values({ projectId, userId: u.id, text, fileName: f?.name, storedName: f?.stored, fileSize: f?.size, mime: f?.mime, isVoice: !!f && voice, replyToId }).returning({ id: projectMessages.id });
  return Response.json({ ok: true, id: m.id });
}

// Delete for everyone: your own message, or any message if you are the admin. Leaves "رسالة اتمسحت".
export async function DELETE(req: Request, { params }: P) {
  const u = await getUser();
  if (!u) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { projectId } = await params;
  const id = new URL(req.url).searchParams.get("id") || "";
  const m = await db.query.projectMessages.findFirst({ where: and(eq(projectMessages.id, id), eq(projectMessages.projectId, projectId)) });
  if (!m || !(await canAccessProject(u, projectId)) || (m.userId !== u.id && u.role !== "ADMIN")) return Response.json({ error: "not found" }, { status: 404 });
  await db.update(projectMessages).set({ deletedAt: new Date(), text: "", storedName: null, fileName: null, mime: null }).where(eq(projectMessages.id, id));
  if (m.storedName) await removeStored(m.storedName);
  return Response.json({ ok: true });
}
