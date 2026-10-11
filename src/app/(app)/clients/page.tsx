import Link from "next/link";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db, clients, projects } from "@/lib/db";
import { STAGES, STAGE_ORDER, type Stage } from "@/lib/labels";
import { NewClient } from "./forms";

const fmt = (x: Date | null) => (x ? x.toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) : "");
const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };

export default async function Clients({ searchParams }: { searchParams: Promise<{ stage?: string; new?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [all, ps] = await Promise.all([db.select().from(clients).orderBy(desc(clients.updatedAt)), db.select({ clientId: projects.clientId, status: projects.status }).from(projects)]);
  const count = (s: Stage) => all.filter((c) => c.stage === s).length;
  const list = sp.stage ? all.filter((c) => c.stage === sp.stage) : all.filter((c) => !["LOST", "DONE"].includes(c.stage));
  const overdue = all.filter((c) => c.nextDate && c.nextDate < today() && !["LOST", "DONE"].includes(c.stage));
  const activeProjects = (id: string) => ps.filter((p) => p.clientId === id && !["CLOSED", "CANCELLED"].includes(p.status)).length;
  return (<>
    <div className="head"><div><span className="tag">العمل</span><h1>العملاء</h1><p className="sub">كل عميل في أنهي مرحلة، والخطوة الجاية معاه إمتى.</p></div>
      <Link href="/clients?new=1" className="btn">+ عميل جديد</Link></div>
    {sp.new && <div className="card"><h2>عميل جديد</h2><NewClient /></div>}

    <div className="pipeline" role="list">
      {STAGE_ORDER.map((s, i) => <Link key={s} role="listitem" href={`/clients?stage=${s}`} className={"step" + (sp.stage === s ? " on" : "")}>
        <span className="n num">{i + 1}</span><b>{STAGES[s]}</b><span className="num c">{count(s)}</span></Link>)}
    </div>
    <div className="actions" style={{ marginBottom: 16 }}>
      <Link href="/clients" className={!sp.stage ? "btn" : "btn ghost-link"}>المفتوحين</Link>
      {(["ON_HOLD", "LOST"] as Stage[]).map((s) => <Link key={s} href={`/clients?stage=${s}`} className={sp.stage === s ? "btn" : "btn ghost-link"}>{STAGES[s]} <span className="num">({count(s)})</span></Link>)}
    </div>
    {overdue.length > 0 && !sp.stage && <div className="msg bad">{overdue.length} عميل فات موعد الخطوة الجاية معاهم: {overdue.map((c) => c.name).join("، ")}</div>}

    {list.length ? <div className="card plain table-wrap"><table>
      <thead><tr><th>العميل</th><th>المرحلة</th><th>الخطوة الجاية</th><th>الموعد</th><th>مشاريع شغالة</th><th>آخر تحديث</th></tr></thead>
      <tbody>{list.map((c) => { const late = c.nextDate && c.nextDate < today(); return (<tr key={c.id}>
        <td><Link href={`/clients/${c.id}`}><b>{c.name}</b></Link>{c.company && <div className="sub" style={{ margin: 0 }}>{c.company}</div>}</td>
        <td><span className={"pill " + (c.stage === "LOST" ? "bad" : ["AGREED", "ACTIVE", "DONE"].includes(c.stage) ? "ok" : c.stage === "ON_HOLD" ? "warn" : "info")}>{STAGES[c.stage]}</span></td>
        <td>{c.nextStep || <span className="sub">—</span>}</td>
        <td>{c.nextDate ? <span className={late ? "pill bad" : ""}>{fmt(c.nextDate)}</span> : "—"}</td>
        <td className="num">{activeProjects(c.id) || "—"}</td>
        <td className="sub">{fmt(c.updatedAt)}</td></tr>); })}</tbody></table></div>
      : <div className="note">مفيش عملاء هنا. {!all.length && "ابدأ بإضافة أول عميل."}</div>}
  </>);
}
