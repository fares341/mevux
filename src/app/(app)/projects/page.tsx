import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadProjects, loadTeamView, calc, rules, STATUS, SIZE } from "@/lib/projects";
import { egp } from "@/lib/finance";
import { NewProject } from "./forms";

const pill = (s: string) => ({ CLOSED: "ok", CANCELLED: "bad", DELIVERED: "info", IN_PROGRESS: "warn", APPROVED: "warn" } as Record<string, string>)[s] || "info";
const fmt = (d: Date | null) => (d ? d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) : "—");

export default async function Projects() {
  const me = await requireUser();
  if (me.role !== "ADMIN") {
    const ps = await loadTeamView(true);
    return (<>
      <div className="head"><div><span className="tag">العمل</span><h1>المشاريع الشغالة</h1><p className="sub">مين ماسك أنهي دور في كل مشروع، وكل واحد وصل لفين.</p></div></div>
      {!ps.length && <div className="note">مفيش مشاريع شغالة دلوقتي.</div>}
      {ps.map((p) => (<Link key={p.id} href={`/projects/${p.id}`} className="card" style={{ display: "block", color: "inherit" }}>
        <div className="actions" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>{p.name}</h2><span className={"pill " + pill(p.status)}>{STATUS[p.status]}</span></div>
        <p className="sub">{p.client} · التسليم {fmt(p.dueDate)}</p>
        <div className="table-wrap"><table><thead><tr><th>الدور</th><th>مين</th><th>التقدم</th><th>الموعد</th></tr></thead><tbody>
          {p.roles.map((r) => <tr key={r.id}><td>{r.title}</td><td>{r.members.map((m) => m.name + (m.userId === me.id ? " (إنت)" : "")).join("، ")}</td><td><span className="num">{r.progress}%</span></td><td>{r.deliveredAt ? <span className="pill ok">اتسلّم</span> : fmt(r.dueDate)}</td></tr>)}
        </tbody></table></div>
      </Link>))}
    </>);
  }
  const [ps, r] = await Promise.all([loadProjects(), rules()]);
  return (<>
    <div className="head"><div><span className="tag">العمل</span><h1>المشاريع</h1><p className="sub">كل المشاريع بأرقامها. الأرقام بالجنيه.</p></div></div>
    <div className="card"><details open={!ps.length}><summary>مشروع جديد</summary><div style={{ marginTop: 14 }}><NewProject /></div></details></div>
    {ps.length > 0 && <div className="card plain table-wrap"><table>
      <thead><tr><th>المشروع</th><th>العميل</th><th>المرحلة</th><th>الحجم</th><th>السعر</th><th>المدفوع</th><th>أجور الفريق</th><th>الصافي</th><th>نصيبك</th></tr></thead>
      <tbody>{ps.map((p) => { const c = calc(p, r); return (<tr key={p.id}>
        <td><Link href={`/projects/${p.id}`}><b>{p.name}</b></Link></td><td>{p.client}</td>
        <td><span className={"pill " + pill(p.status)}>{STATUS[p.status]}</span></td><td>{SIZE[p.size]}</td>
        <td><span className="num">{egp(c.revenue)}</span></td>
        <td><span className="num">{egp(c.received)}</span></td>
        <td><span className="num">{egp(c.teamGross)}</span> {c.overCap && <span className="pill bad">فوق السقف</span>}</td>
        <td><span className="num" style={{ color: c.net < 0 ? "var(--bad)" : undefined }}>{egp(c.net)}</span></td>
        <td><span className="num">{egp(c.owner)}</span></td>
      </tr>); })}</tbody></table></div>}
  </>);
}
