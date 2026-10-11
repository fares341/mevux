import { eq } from "drizzle-orm";
import { db, roleNotes } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { isRoleMember } from "@/lib/access";
import { readStored } from "@/lib/storage";

const INLINE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp4", "video/mp4", "video/webm", "video/quicktime"]);

// Role instructions: only the admin and the people in that role.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const n = await db.query.roleNotes.findFirst({ where: eq(roleNotes.id, (await params).id) });
  if (!n?.storedName || !(await isRoleMember(u, n.roleId))) return new Response("Not found", { status: 404 });
  const mime = (n.mime || "").split(";")[0];
  const inline = INLINE.has(mime);
  return new Response(new Uint8Array(await readStored(n.storedName)), { headers: {
    "Content-Type": inline ? mime : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(n.fileName || "file")}`,
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "private, no-store",
  } });
}
