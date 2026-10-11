import { eq } from "drizzle-orm";
import { db, projectMessages } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/access";
import { readStored } from "@/lib/storage";

const INLINE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp4", "video/mp4", "video/webm", "video/quicktime"]);
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const m = await db.query.projectMessages.findFirst({ where: eq(projectMessages.id, (await params).id) });
  if (!m?.storedName || !(await canAccessProject(u, m.projectId))) return new Response("Not found", { status: 404 });
  const mime = (m.mime || "").split(";")[0];
  const inline = INLINE.has(mime);
  return new Response(new Uint8Array(await readStored(m.storedName)), { headers: {
    "Content-Type": inline ? mime : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(m.fileName || "file")}`,
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "private, no-store",
  } });
}
