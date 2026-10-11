import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { chatProjects } from "@/lib/chat";
import { STATUS } from "@/lib/projects";

const when = (d: Date | null) => (d ? d.toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");

export default async function Chats() {
  const u = await requireUser();
  const list = await chatProjects(u);
  return (<>
    <div className="head"><div><span className="tag">العمل</span><h1>محادثات المشاريع</h1><p className="sub">كل مشروع له جروب فيه فريقه والمدير. الجروب بيتعمل لوحده أول ما حد يتحط في دور في المشروع.</p></div></div>
    {list.length ? <div className="chatlist">{list.map((p) => (
      <Link key={p.id} href={`/chats/${p.id}`} className="chatrow">
        <div className="avatar">{p.name.slice(0, 1)}</div>
        <div className="body"><div className="top"><b>{p.name}</b><span className="sub">{when(p.lastAt)}</span></div>
          <div className="top"><span className="sub one">{p.last ? `${p.last.name}: ${p.last.text || "📎 " + p.last.fileName}` : `${p.client} · ${STATUS[p.status]}`}</span>{p.unread > 0 && <span className="badge num">{p.unread}</span>}</div></div>
      </Link>))}</div> : <div className="note">مفيش محادثات لسه. أول ما تتحط في دور في مشروع، الجروب بتاعه هيظهر هنا.</div>}
  </>);
}
