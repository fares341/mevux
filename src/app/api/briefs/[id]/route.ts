import { eq } from "drizzle-orm";
import { db, projectBriefs, projects } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { readStored } from "@/lib/storage";

// Briefs contain prices: admin only.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  if (u.role !== "ADMIN") return new Response("Not found", { status: 404 });
  const { id } = await params;
  const b = await db.query.projectBriefs.findFirst({ where: eq(projectBriefs.id, id) });
  if (!b) return new Response("Not found", { status: 404 });
  const p = await db.query.projects.findFirst({ where: eq(projects.id, b.projectId) });
  const name = `MEVIX_${p?.name ?? "Brief"}_${b.lang.toUpperCase()}.pdf`;
  return new Response(new Uint8Array(await readStored(b.storedName)), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
  } });
}
