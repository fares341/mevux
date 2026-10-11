import { eq } from "drizzle-orm";
import { db, complaintFiles } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { readStored } from "@/lib/storage";
import { audit } from "@/lib/audit";

const INLINE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp4", "audio/x-m4a", "video/mp4", "video/webm", "video/quicktime"]);

// Complaint evidence: the admin, or the person who uploaded it. Nobody else (not the accused).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const f = await db.query.complaintFiles.findFirst({ where: eq(complaintFiles.id, id) });
  if (!f || (u.role !== "ADMIN" && f.uploadedBy !== u.id)) return new Response("Not found", { status: 404 });
  const body = await readStored(f.storedName);
  await audit(u.id, "complaint_file_view", f.id);
  const mime = f.mime.split(";")[0];
  const inline = INLINE.has(mime);
  return new Response(new Uint8Array(body), { headers: {
    "Content-Type": inline ? mime : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.originalName)}`,
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "private, no-store",
  } });
}
