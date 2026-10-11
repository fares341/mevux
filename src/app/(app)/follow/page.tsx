import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { feed, followUp, visibleProjects, myProjectIds } from "@/lib/work";
import { UpdateForm } from "../work-forms";

const when = (d: Date) => d.toLocaleString("ar-EG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function Follow() {
  const u = await requireUser();
  const lead = u.role !== "MEMBER";
  const [items, vis, mine, f] = await Promise.all([feed(u, { limit: 60 }), visibleProjects(u), myProjectIds(u.id), lead ? followUp(u) : Promise.resolve(null)]);
  const myProjects = u.role === "ADMIN" ? vis : vis.filter((p) => mine.includes(p.id));
  return (<>
    <div className="head"><div><span className="tag">العمل</span><h1>المتابعة اليومية</h1><p className="sub">كل واحد يكتب وصل لإيه، والكل يشوف التقدم.</p></div></div>
    {f && <>
      <div className="grid">
        <div className="stat" style={f.lateRoles.length ? { borderBottomColor: "var(--bad)" } : undefined}><b className="num">{f.lateRoles.length}</b><span>دور متأخر عن موعده</span></div>
        <div className="stat" style={f.overdueTasks.length ? { borderBottomColor: "var(--bad)" } : undefined}><b className="num">{f.overdueTasks.length}</b><span>مهمة فات موعدها</span></div>
        <div className="stat" style={f.silent.length ? { borderBottomColor: "var(--warn)" } : undefined}><b className="num">{f.silent.length} / {f.workingCount}</b><span>ماكتبوش تحديث النهارده</span></div>
      </div>
      {f.lateRoles.length > 0 && <section className="card" style={{ borderTopColor: "var(--bad)" }}><h2>متأخرين</h2>
        {f.lateRoles.map((x, i) => <div key={i} className="actions" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBlock: 6 }}><span><b>{x.person}</b> · {x.role} · {x.project}</span><span><span className="pill bad">{x.days} يوم</span> <span className="num">{x.progress}%</span></span></div>)}</section>}
      {f.silent.length > 0 && <div className="msg bad">ماكتبوش تحديث النهارده: {f.silent.join("، ")}</div>}
    </>}
    <section className="card"><h2>سجّل تحديثك</h2><UpdateForm projects={myProjects.map((p) => ({ id: p.id, name: p.name }))} /></section>
    <section className="card"><h2>آخر التحديثات</h2>
      {items.length ? items.map((x) => <div key={x.id} style={{ borderRight: "3px solid var(--cyan)", paddingInline: 12, marginBottom: 12 }}>
        <div className="sub" style={{ margin: 0 }}><b style={{ color: "var(--navy)" }}>{x.name}</b> · {x.project ? <Link href={`/projects/${x.projectId}`}>{x.project}</Link> : "عام"} · {when(x.createdAt)}{x.source === "BOT" && " · من المساعد"}</div>
        <p style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>{x.text}</p></div>) : <p className="sub">مفيش تحديثات لسه.</p>}
    </section>
  </>);
}
