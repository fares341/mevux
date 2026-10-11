import { getUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/access";
import { messages } from "@/lib/chat";
import { db, projectMessages } from "@/lib/db";
import { checkFile, saveFile } from "@/lib/storage";
import { rateLimit } from "@/lib/ratelimit";

type P = { params: Promise<{ projectId: string }> };

export async function GET(req: Request, { params }: P) {
  const u = await getUser();
  if (!u) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { projectId } = await params;
  const after = new URL(req.url).searchParams.get("after");
  try { return Response.json({ messages: await messages(u, projectId, after ? new Date(after) : undefined) }); }
  catch { return Response.json({ error: "not found" }, { status: 404 }); }
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
  let f: Awaited<ReturnType<typeof saveFile>> | null = null;
  if (file instanceof File && file.size) {
    const err = checkFile(file);
    if (err) return Response.json({ error: err }, { status: 400 });
    f = await saveFile(file);
  }
  if (!text && !f) return Response.json({ error: "اكتب رسالة." }, { status: 400 });
  await db.insert(projectMessages).values({ projectId, userId: u.id, text, fileName: f?.name, storedName: f?.stored, fileSize: f?.size, mime: f?.mime });
  return Response.json({ ok: true });
}
