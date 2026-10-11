import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/access";
import { db, projects } from "@/lib/db";
import { groupMembers } from "@/lib/chat";
import Room from "./room";

export default async function ChatRoom({ params }: { params: Promise<{ projectId: string }> }) {
  const u = await requireUser();
  const { projectId } = await params;
  if (!(await canAccessProject(u, projectId))) notFound();
  const p = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!p) notFound();
  const members = await groupMembers(projectId);
  return (<>
    <div className="head"><div><span className="tag"><Link href="/chats" style={{ color: "#fff" }}>محادثات المشاريع</Link></span><h1>{p.name}</h1>
      <p className="sub">{[...members.map((m) => m.name), "المدير"].filter((v, i, a) => a.indexOf(v) === i).join("، ")}</p></div>
      <Link className="btn ghost-link" href={`/projects/${p.id}`}>صفحة المشروع</Link></div>
    <Room projectId={p.id} me={u.id} />
  </>);
}
