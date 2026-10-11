import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, payouts, deductions, projectRoles, projects, bans } from "@/lib/db";
import { earnings, STATUS, DED } from "@/lib/projects";
import { egp } from "@/lib/finance";
import { RespondForm } from "../projects/forms";

// Shows ONLY the signed-in person's own money. Nothing about others is rendered.
export default async function My() {
  const me = await requireUser();
  const [{ map }, pays, deds, myBans] = await Promise.all([
    earnings(),
    db.select().from(payouts).where(eq(payouts.userId, me.id)).orderBy(desc(payouts.paidAt)),
    db.select({ d: deductions, role: projectRoles.title, project: projects.name }).from(deductions)
      .innerJoin(projectRoles, eq(deductions.roleId, projectRoles.id)).innerJoin(projects, eq(projectRoles.projectId, projects.id))
      .where(eq(deductions.userId, me.id)).orderBy(desc(deductions.createdAt)),
    db.select().from(bans).where(and(eq(bans.userId, me.id))),
  ]);
  const e = map.get(me.id) ?? { expected: 0, entitled: 0, deducted: 0, items: [] };
  const paid = pays.reduce((a, p) => a + p.amountEgp, 0);
  return (<>
    <div className="head"><div><span className="tag">حسابي</span><h1>فلوسي</h1><p className="sub">أجرك في كل مشروع، والخصومات، واللي اتصرف لك. محدش غيرك والمدير يشوف الصفحة دي.</p></div></div>
    <div className="grid">
      <div className="stat"><b className="num">{egp(e.expected)}</b><span>متوقع من مشاريع شغالة</span></div>
      <div className="stat"><b className="num">{egp(e.entitled)}</b><span>مستحق (المشاريع المقفولة)</span></div>
      <div className="stat"><b className="num">{egp(paid)}</b><span>اتصرف لك</span></div>
      <div className="stat"><b className="num">{egp(e.entitled - paid)}</b><span>الباقي لك</span></div>
    </div>
    {myBans.some((b) => !b.consumedByProject) && <div className="msg bad">عليك حرمان من المشروع الجاي بسبب خصم معتمد.</div>}
    <section className="card"><h2>مشاريعي</h2>{e.items.length ? <div className="table-wrap"><table>
      <thead><tr><th>المشروع</th><th>الدور</th><th>المرحلة</th><th>الأجر</th><th>الخصم</th><th>الصافي</th></tr></thead>
      <tbody>{e.items.map((i, k) => <tr key={k}><td><Link href={`/projects/${i.projectId}`}>{i.project}</Link></td><td>{i.title}</td><td>{STATUS[i.status as keyof typeof STATUS]}</td><td className="num">{egp(i.base)}</td>
        <td>{i.deducted ? <span className="pill bad"><span className="num">{egp(i.deducted)}</span>{i.days ? ` · تأخير ${i.days} يوم` : ""}</span> : "—"}</td><td><b className="num">{egp(i.net)}</b></td></tr>)}</tbody></table></div> : <p className="sub">مفيش أدوار متسجلة لك.</p>}
    </section>
    <section className="card"><h2>الخصومات</h2>{deds.length ? deds.map(({ d, role, project }) => (
      <div key={d.id} style={{ borderBottom: "1px solid var(--line)", paddingBlock: 10 }}>
        <div className="actions" style={{ justifyContent: "space-between" }}><b>{DED[d.type]} · <span className="num">{d.pct}%</span> · {project} / {role}</b>
          {d.status === "PENDING" ? <span className="pill warn">قيد المراجعة</span> : d.status === "APPROVED" ? <span className="pill bad">معتمد</span> : <span className="pill ok">اترفض</span>}</div>
        <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{d.reason}</p>
        {d.response ? <p className="sub">ردك: {d.response}</p> : d.status === "PENDING" && <RespondForm id={d.id} />}
      </div>)) : <p className="sub">مفيش خصومات.</p>}
    </section>
    {pays.length > 0 && <section className="card plain"><h2>اللي اتصرف لك</h2>{pays.map((p) => <div key={p.id} className="sub">{p.paidAt.toLocaleDateString("ar-EG")} · <span className="num">{egp(p.amountEgp)}</span> ج {p.note && `· ${p.note}`}</div>)}</section>}
  </>);
}
