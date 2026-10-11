import { eq } from "drizzle-orm";
import { db, projectFiles } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/access";
import { readStored } from "@/lib/storage";
import { audit } from "@/lib/audit";

const INLINE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const f = await db.query.projectFiles.findFirst({ where: eq(projectFiles.id, id) });
  if (!f || !(await canAccessProject(u, f.projectId))) return new Response("Not found", { status: 404 });
  const body = await readStored(f.storedName);
  await audit(u.id, "file_download", f.id);
  const inline = INLINE.has(f.mime);
  return new Response(new Uint8Array(body), { headers: {
    "Content-Type": inline ? f.mime : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.originalName)}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "private, no-store",
  } });
}
