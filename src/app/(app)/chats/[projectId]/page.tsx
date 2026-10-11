import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/access";
import { db, projects } from "@/lib/db";
import Room from "./room";

export default async function ChatRoom({ params }: { params: Promise<{ projectId: string }> }) {
  const u = await requireUser();
  const { projectId } = await params;
  if (!(await canAccessProject(u, projectId))) notFound();
  const p = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!p) notFound();
  return (<>
    <nav className="crumbs" aria-label="مسار الصفحة" style={{ marginBottom: 10 }}><Link href="/chats">محادثات المشاريع</Link> · <Link href={`/projects/${p.id}`}>صفحة المشروع</Link></nav>
    <Room projectId={p.id} me={u.id} title={p.name} sub={p.client} />
  </>);
}
