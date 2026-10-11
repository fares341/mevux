import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadProjects, loadTeamView, calc, rules, STATUS, SIZE } from "@/lib/projects";
import { egp } from "@/lib/finance";
import { NewProject } from "./forms";

const pill = (s: string) => ({ CLOSED: "ok", CANCELLED: "bad", DELIVERED: "info", IN_PROGRESS: "warn", APPROVED: "warn" } as Record<string, string>)[s] || "info";
const fmt = (d: Date | null) => (d ? d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) : "—");

const GROUPS = {
  pipeline: { label: "جديد", hint: "ميتنج وبريف", st: ["MEETING", "BRIEF"] },
  active: { label: "شغال", hint: "موافقة، تنفيذ، اتسلّم ومستني الدفع", st: ["APPROVED", "IN_PROGRESS", "DELIVERED"] },
  done: { label: "خلصناه", hint: "مقفول ومدفوع", st: ["CLOSED"] },
  cancelled: { label: "ملغي", hint: "", st: ["CANCELLED"] },
} as const;
type G = keyof typeof GROUPS;

function Tabs({ tab, counts, admin }: { tab: string; counts: Record<string, number>; admin: boolean }) {
  const keys = (admin ? ["active", "pipeline", "done", "cancelled"] : ["active", "done"]) as G[];
  return (<div className="actions" style={{ marginBottom: 18 }} role="tablist">
    {keys.map((k) => <Link key={k} href={`/projects?tab=${k}`} role="tab" aria-selected={tab === k} className={tab === k ? "btn" : "btn ghost-link"}>{admin || k === "active" ? GROUPS[k].label : "اللي خلصته"} <span className="num">({counts[k] ?? 0})</span></Link>)}
    {admin && <Link href="/projects?tab=new" className={tab === "new" ? "btn" : "btn ghost-link"}>+ مشروع جديد</Link>}
  </div>);
}

export default async function Projects({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireUser();
  const tab = (await searchParams).tab || "active";
  if (me.role !== "ADMIN") {
    const all = await loadTeamView(false);
    const mineDone = all.filter((p) => p.status === "CLOSED" && p.roles.some((r) => r.members.some((m) => m.userId === me.id)));
    const activeList = all.filter((p) => (GROUPS.active.st as readonly string[]).includes(p.status));
    const ps = tab === "done" ? mineDone : activeList;
    return (<>
      <div className="head"><div><span className="tag">العمل</span><h1>المشاريع</h1><p className="sub">مين ماسك أنهي دور في كل مشروع، وكل واحد وصل لفين.</p></div></div>
      <Tabs tab={tab} admin={false} counts={{ active: activeList.length, done: mineDone.length }} />
      {!ps.length && <div className="note">مفيش مشاريع هنا.</div>}
      {ps.map((p) => (<Link key={p.id} href={`/projects/${p.id}`} className="card" style={{ display: "block", color: "inherit" }}>
        <div className="actions" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>{p.name}</h2><span className={"pill " + pill(p.status)}>{STATUS[p.status]}</span></div>
        <p className="sub">{p.client} · التسليم {fmt(p.dueDate)}</p>
        <div className="table-wrap"><table><thead><tr><th>الدور</th><th>مين</th><th>التقدم</th><th>الموعد</th></tr></thead><tbody>
          {p.roles.map((r) => <tr key={r.id}><td>{r.title}</td><td>{r.members.map((m) => m.name + (m.userId === me.id ? " (إنت)" : "")).join("، ")}</td><td><span className="num">{r.progress}%</span></td><td>{r.deliveredAt ? <span className="pill ok">اتسلّم</span> : fmt(r.dueDate)}</td></tr>)}
        </tbody></table></div>
      </Link>))}
    </>);
  }
  const [all, r] = await Promise.all([loadProjects(), rules()]);
  const counts = Object.fromEntries(Object.entries(GROUPS).map(([k, g]) => [k, all.filter((p) => (g.st as readonly string[]).includes(p.status)).length]));
  const g = GROUPS[(tab in GROUPS ? tab : "active") as G];
  const ps = tab === "new" ? [] : all.filter((p) => (g.st as readonly string[]).includes(p.status));
  return (<>
    <div className="head"><div><span className="tag">العمل</span><h1>المشاريع</h1><p className="sub">الأرقام بالجنيه.</p></div></div>
    <Tabs tab={tab} admin counts={counts} />
    {tab === "new" && <div className="card"><h2>مشروع جديد</h2><NewProject /></div>}
    {tab !== "new" && !ps.length && <div className="note">مفيش مشاريع في "{g.label}". {g.hint && `(${g.hint})`}</div>}
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
