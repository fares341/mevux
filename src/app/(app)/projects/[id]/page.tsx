import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, users, suppliers, bans, clients } from "@/lib/db";
import { loadProject, loadTeamView, calc, rules, STATUS, SIZE, DED, ACTIVE } from "@/lib/projects";
import { egp } from "@/lib/finance";
import { BILLING } from "@/lib/labels";
import { removeRow, setDelivered, updateProgress, decideDeduction } from "../actions";
import { EditProject, PaymentForm, CostForm, RoleForm, DeductionForm, DeleteProject } from "../forms";
import { RoleUpload } from "../files-ui";
import { ProjectAssets } from "../assets";
import { KINDS } from "@/lib/labels";
import { PageHead, Tabs, Empty } from "@/components/ui";
import { BriefForm } from "../brief-ui";
import { deleteBrief } from "../brief-actions";
import { projectBriefs } from "@/lib/db";
import { desc } from "drizzle-orm";
import { loadFiles, FileList, Credentials, FinalFiles } from "../extras";

const fmt = (d: Date | null) => (d ? d.toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" }) : "—");
const CUR = { EGP: "ج", SAR: "ريال", USD: "$" } as Record<string, string>;

function Progress({ roleId, value, canEdit }: { roleId: string; value: number; canEdit: boolean }) {
  if (!canEdit) return <span className="num">{value}%</span>;
  return (<form action={updateProgress} className="actions"><input type="hidden" name="roleId" value={roleId} />
    <input aria-label="التقدم" id={"pg-" + roleId} name="progress" type="number" min="0" max="100" dir="ltr" defaultValue={value} style={{ maxWidth: 80 }} />%<button className="sm ghost">تحديث</button></form>);
}

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const tab = (await searchParams).tab || "overview";
  const me = await requireUser();

  // ---------- Team member / team lead view: no money at all ----------
  if (me.role !== "ADMIN") {
    const p = (await loadTeamView(false)).find((x) => x.id === id);
    const mine = p?.roles.some((r) => r.members.some((m) => m.userId === me.id));
    if (!p || (!(ACTIVE as readonly string[]).includes(p.status) && !mine)) notFound();
    const files = mine ? await loadFiles(p.id) : [];
    return (<>
      <PageHead title={p.name} crumbs={[{ href: "/projects", label: "المشاريع" }]} badge={<span className="pill info">{STATUS[p.status]}</span>}
        help={<>{p.client} · التسليم {fmt(p.dueDate)}. حدّث تقدمك وارفع ملفك من كارت دورك.</>} actions={mine ? [{ href: `/chats/${p.id}`, label: "شات المشروع", icon: "chat" }] : undefined} />
      {p.description && <div className="note" style={{ whiteSpace: "pre-wrap" }}>{p.description}</div>}
      {p.roles.map((r) => { const own = r.members.some((m) => m.userId === me.id); return (
        <section className="card" key={r.id} style={own ? { borderTopColor: "var(--cyan)" } : undefined}>
          <div className="actions" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>{r.title} {own && <span className="pill info">دورك</span>}</h2>{r.deliveredAt ? <span className="pill ok">اتسلّم {fmt(r.deliveredAt)}</span> : <span className="sub">الموعد {fmt(r.dueDate)}</span>}</div>
          <p className="sub">{r.members.map((m) => m.name + (m.isLead && r.members.length > 1 ? " (المسؤول الأول)" : "")).join("، ")}</p>
          {r.scope && <p style={{ whiteSpace: "pre-wrap" }}><b>المطلوب: </b>{r.scope}</p>}
          {r.deliverables && <p style={{ whiteSpace: "pre-wrap" }}><b>المخرجات: </b>{r.deliverables}</p>}
          <div className="actions"><b>التقدم:</b> <Progress roleId={r.id} value={r.progress} canEdit={own} /></div>
          {mine && <div style={{ marginTop: 12 }}><b style={{ color: "var(--navy)" }}>ملفات الدور</b><FileList files={files.filter((f) => f.roleId === r.id)} me={me} /></div>}
          {own && <details style={{ marginTop: 10 }} open={!r.deliveredAt}><summary>ارفع ملف شغلك</summary><div style={{ marginTop: 10 }}><RoleUpload roleId={r.id} delivered={!!r.deliveredAt} /></div></details>}
        </section>); })}
      {mine && <ProjectAssets projectId={p.id} admin={false} />}
      {mine && <Credentials projectId={p.id} me={me} />}
      {mine && <FinalFiles files={files} me={me} projectId={p.id} />}
    </>);
  }

  // ---------- Admin view ----------
  const [p, r, team, sups, openBans] = await Promise.all([
    loadProject(id), rules(),
    db.select({ id: users.id, name: users.name, active: users.active }).from(users).orderBy(asc(users.name)),
    db.select().from(suppliers).orderBy(asc(suppliers.provider)),
    db.select().from(bans).where(eq(bans.consumedByProject, id)),
  ]);
  if (!p) notFound();
  const files = await loadFiles(p.id);
  const allClients = await db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name));
  const briefs = await db.select().from(projectBriefs).where(eq(projectBriefs.projectId, p.id)).orderBy(desc(projectBriefs.createdAt));
  const c = calc(p, r);
  const name = (uid: string) => team.find((u) => u.id === uid)?.name || "—";
  const userOpts = team.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, banned: openBans.some((b) => b.userId === u.id) }));
  const allDeds = p.roles.flatMap((ro) => ro.deductions.map((dd) => ({ ...dd, role: ro.title })));

  return (<>
    <PageHead title={p.name} crumbs={[{ href: "/projects", label: "المشاريع" }, ...(p.clientId ? [{ href: `/clients/${p.clientId}`, label: p.client }] : [])]}
      badge={<span className={"pill " + (p.status === "CLOSED" ? "ok" : p.status === "CANCELLED" ? "bad" : "info")}>{STATUS[p.status]}</span>}
      help={<>{p.client} · <span className="num">{egp(p.price)}</span> {CUR[p.currency]}{p.billing === "SUBSCRIPTION" && <> · اشتراك <span className="num">{egp(p.monthlyFee ?? 0)}</span> {CUR[p.currency]} / شهر</>}{p.kinds && <> · {p.kinds.split(",").map((k) => KINDS[k as keyof typeof KINDS]).join("، ")}</>}</>}
      actions={[{ href: `/chats/${p.id}`, label: "شات المشروع", icon: "chat", kind: "secondary" }, { href: `/briefs?project=${p.id}`, label: "عمل بريف", icon: "doc", kind: "accent" }, { href: `/projects/${p.id}?tab=details#delete`, label: "حذف", kind: "secondary" }]} />
    <Tabs base={`/projects/${p.id}`} current={tab} tabs={[
      { key: "overview", label: "نظرة عامة" },
      { key: "team", label: "الفريق والأدوار", count: p.roles.length, alert: allDeds.some((d) => d.status === "PENDING") },
      { key: "money", label: "الفلوس", alert: c.overCap, count: c.overCap ? 1 : undefined },
      { key: "files", label: "الملفات والأنظمة" },
      { key: "brief", label: "البريف", count: briefs.length },
      { key: "details", label: "بيانات المشروع" },
    ]} />
    {tab === "overview" && <>
    <div className="grid">
      <div className="stat"><b className="num">{egp(c.revenue)}</b><span>قيمة المشروع (ج)</span></div>
      <div className="stat"><b className="num">{egp(c.received)}</b><span>المدفوع · الباقي <span className="num">{egp(c.remaining)}</span></span></div>
      <div className="stat" style={c.overCap ? { borderBottomColor: "var(--bad)" } : undefined}><b className="num">{egp(c.teamGross)}</b><span>أجور الفريق · <span className="num">{Number.isFinite(c.teamPctOfNet) ? c.teamPctOfNet.toFixed(0) : "∞"}%</span> من السقف {p.teamCapPct}%</span></div>
      <div className="stat"><b className="num" style={{ color: c.net < 0 ? "var(--bad)" : undefined }}>{egp(c.net)}</b><span>الصافي · ليك <span className="num">{egp(c.owner)}</span> · للشركة <span className="num">{egp(c.company)}</span></span></div>
    </div>
    {c.overCap && <div className="msg bad">أجور الفريق ({egp(c.teamGross)} ج) أعلى من السقف المسموح ({egp(c.capLimit)} ج). قلّل الأجور أو عدد الأشخاص، أو ارفع السعر.</div>}

    
      {p.description && <div className="note" style={{ whiteSpace: "pre-wrap" }}>{p.description}</div>}
      <section className="card"><h2>الأدوار</h2>
        {p.roles.length ? <ul className="attn">{p.roles.map((ro) => <li key={ro.id}><span className={"k " + (ro.deliveredAt ? "info" : ro.dueDate && ro.dueDate < new Date() ? "bad" : "warn")} />
          <span className="t"><b>{ro.title}</b><small>{ro.members.map((m) => name(m.userId)).join("، ")} · {ro.deliveredAt ? "اتسلّم" : `${ro.progress}%`}{ro.dueDate && !ro.deliveredAt ? ` · ${fmt(ro.dueDate)}` : ""}</small></span></li>)}</ul>
          : <Empty title="لسه مفيش أدوار" text="وزّع الشغل على الفريق: الدور، الأجر، والموعد." action={{ href: `/projects/${p.id}?tab=team`, label: "إضافة دور", icon: "plus" }} />}
      </section>
    </>}
    {tab === "team" && <>
    <section className="card"><h2>الأدوار وملفاتها</h2>
      {p.roles.map((ro) => { const lines = c.lines.filter((l) => l.roleId === ro.id); return (
        <div key={ro.id} style={{ borderBottom: "1px solid var(--line)", paddingBlock: 14 }}>
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <b style={{ fontSize: 16, color: "var(--navy)" }}>{ro.title} · <span className="num">{egp(ro.fee)}</span> ج</b>
            <span>{ro.deliveredAt ? <span className="pill ok">اتسلّم {fmt(ro.deliveredAt)}</span> : <span className="sub">الموعد {fmt(ro.dueDate)} · التقدم <span className="num">{ro.progress}%</span></span>}</span>
          </div>
          <div className="table-wrap" style={{ marginTop: 10 }}><table>
            <thead><tr><th>الشخص</th><th>النسبة</th><th>الأجر</th><th>تأخير</th><th>خصومات أخرى</th><th>الصافي</th></tr></thead>
            <tbody>{lines.map((l) => <tr key={l.userId}><td>{name(l.userId)}{ro.members.find((m) => m.userId === l.userId)?.isLead && ro.members.length > 1 ? " · المسؤول الأول" : ""}</td>
              <td className="num">{l.sharePct}%</td><td className="num">{egp(l.base)}</td>
              <td>{l.days > 0 ? <span className="pill warn">{l.days} يوم · {l.latePct}%</span> : "—"}</td>
              <td>{l.otherPct > 0 ? <span className="pill bad">{l.otherPct}%</span> : "—"}</td>
              <td><b className="num">{egp(l.net)}</b></td></tr>)}</tbody></table></div>
          <div className="actions" style={{ marginTop: 10 }}>
            <form action={setDelivered} className="actions"><input type="hidden" name="roleId" value={ro.id} /><input type="hidden" name="projectId" value={p.id} />
              <input aria-label="تاريخ التسليم" id={"dl-" + ro.id} name="deliveredAt" type="date" defaultValue={ro.deliveredAt ? ro.deliveredAt.toISOString().slice(0, 10) : ""} style={{ maxWidth: 160 }} /><button className="sm ghost">{ro.deliveredAt ? "تعديل تاريخ التسليم" : "تسجيل التسليم"}</button></form>
            <Progress roleId={ro.id} value={ro.progress} canEdit />
          </div>
          <div style={{ marginTop: 10 }}><b style={{ color: "var(--navy)" }}>ملفات الدور</b><FileList files={files.filter((f) => f.roleId === ro.id)} me={me} /></div>
          <details style={{ marginTop: 10 }}><summary>تعديل ملف الدور</summary><div style={{ marginTop: 12 }}>
            <RoleForm projectId={p.id} users={userOpts} label="حفظ الدور" role={{ id: ro.id, title: ro.title, fee: ro.fee, scope: ro.scope, deliverables: ro.deliverables, dueDate: ro.dueDate, members: ro.members }} />
            <form action={removeRow} style={{ marginTop: 10 }}><input type="hidden" name="kind" value="role" /><input type="hidden" name="id" value={ro.id} /><input type="hidden" name="projectId" value={p.id} /><button className="sm danger">حذف الدور</button></form>
          </div></details>
        </div>); })}
      <details open={!p.roles.length} style={{ marginTop: 14 }}><summary>إضافة دور</summary><div style={{ marginTop: 12 }}><RoleForm projectId={p.id} users={userOpts} label="إضافة الدور" /></div></details>
      {openBans.length > 0 && <p className="sub">محرومين من المشروع ده: {openBans.map((b) => name(b.userId)).join("، ")}</p>}
    </section>

    <section className="card"><h2>الخصومات</h2>
      {allDeds.length > 0 && <div className="table-wrap" style={{ marginBottom: 14 }}><table>
        <thead><tr><th>الشخص</th><th>الدور</th><th>النوع</th><th>النسبة</th><th>السبب والدليل</th><th>رده</th><th>الحالة</th></tr></thead>
        <tbody>{allDeds.map((dd) => <tr key={dd.id}><td>{name(dd.userId)}</td><td>{dd.role}</td><td>{DED[dd.type]}{dd.banNext && <><br /><span className="pill bad">+ حرمان</span></>}</td><td className="num">{dd.pct}%</td>
          <td style={{ maxWidth: 260, whiteSpace: "pre-wrap" }}>{dd.reason}{dd.evidence && <><br /><span className="sub">{dd.evidence}</span></>}</td>
          <td style={{ maxWidth: 220, whiteSpace: "pre-wrap" }}>{dd.response || <span className="sub">لم يرد</span>}</td>
          <td>{dd.status === "PENDING" ? <div className="actions">
            <form action={decideDeduction}><input type="hidden" name="id" value={dd.id} /><input type="hidden" name="status" value="APPROVED" /><button className="sm danger">اعتماد</button></form>
            <form action={decideDeduction}><input type="hidden" name="id" value={dd.id} /><input type="hidden" name="status" value="REJECTED" /><button className="sm ghost">رفض</button></form></div>
            : dd.status === "APPROVED" ? <span className="pill bad">معتمد</span> : <span className="pill ok">مرفوض</span>}</td></tr>)}</tbody></table></div>}
      {p.roles.length ? <details><summary>تسجيل خصم</summary><div style={{ marginTop: 12 }}><DeductionForm projectId={p.id} rates={r} roles={p.roles.map((ro) => ({ id: ro.id, title: ro.title, members: ro.members.map((m) => ({ userId: m.userId, name: name(m.userId) })) }))} /></div></details> : <p className="sub">أضف الأدوار الأول.</p>}
    </section>

    </>}
    {tab === "money" && <>
    <div className="grid">
      <div className="stat"><b className="num">{egp(c.revenue)}</b><span>قيمة المشروع (ج)</span></div>
      <div className="stat"><b className="num">{egp(c.received)}</b><span>المدفوع · الباقي <span className="num">{egp(c.remaining)}</span></span></div>
      <div className="stat" style={c.overCap ? { borderBottomColor: "var(--bad)" } : undefined}><b className="num">{egp(c.teamGross)}</b><span>أجور الفريق · <span className="num">{Number.isFinite(c.teamPctOfNet) ? c.teamPctOfNet.toFixed(0) : "∞"}%</span> من السقف {p.teamCapPct}%</span></div>
      <div className="stat"><b className="num" style={{ color: c.net < 0 ? "var(--bad)" : undefined }}>{egp(c.net)}</b><span>الصافي · ليك <span className="num">{egp(c.owner)}</span> · للشركة <span className="num">{egp(c.company)}</span></span></div>
    </div>
    {c.overCap && <div className="msg bad">أجور الفريق ({egp(c.teamGross)} ج) أعلى من السقف المسموح ({egp(c.capLimit)} ج). قلّل الأجور أو عدد الأشخاص، أو ارفع السعر.</div>}

    

<div className="card plain"><h2>الحسبة</h2><div className="table-wrap"><table><tbody>
      <tr><td>قيمة المشروع</td><td><span className="num">{egp(c.revenue)}</span> ج</td></tr>
      <tr><td>− التكاليف المباشرة</td><td><span className="num">{egp(c.costs)}</span> ج</td></tr>
      <tr><td>− صندوق الاشتراكات {p.fundPct}%</td><td><span className="num">{egp(c.fund)}</span> ج</td></tr>
      <tr><td>− أجور الفريق بعد الخصومات {c.deductedTotal > 0 && <span className="sub">(اتخصم <span className="num">{egp(c.deductedTotal)}</span>)</span>}</td><td><span className="num">{egp(c.teamNet)}</span> ج</td></tr>
      <tr><td><b>= الصافي</b> ← ليك {p.ownerPct}% · للشركة {100 - p.ownerPct}%</td><td><b className="num">{egp(c.net)}</b> ج</td></tr>
    </tbody></table></div></div>

    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
      <section className="card"><h2>دفعات العميل</h2>
        {p.payments.map((x) => <div key={x.id} className="actions" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBlock: 6 }}>
          <span><b className="num">{egp(x.amount)}</b> {CUR[p.currency]} · {fmt(x.paidAt)} {x.note && <span className="sub">· {x.note}</span>}</span>
          <form action={removeRow}><input type="hidden" name="kind" value="payment" /><input type="hidden" name="id" value={x.id} /><input type="hidden" name="projectId" value={p.id} /><button className="sm ghost">حذف</button></form></div>)}
        <div style={{ marginTop: 12 }}><PaymentForm projectId={p.id} currency={CUR[p.currency]} /></div>
      </section>
      <section className="card"><h2>التكاليف المباشرة</h2>
        {p.costs.map((x) => <div key={x.id} className="actions" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBlock: 6 }}>
          <span>{x.name} · <b className="num">{egp(x.amountEgp)}</b> ج</span>
          <form action={removeRow}><input type="hidden" name="kind" value="cost" /><input type="hidden" name="id" value={x.id} /><input type="hidden" name="projectId" value={p.id} /><button className="sm ghost">حذف</button></form></div>)}
        <div style={{ marginTop: 12 }}><CostForm projectId={p.id} suppliers={sups.map((s) => ({ id: s.id, label: `${s.provider} · ${s.item} (${s.price} ${CUR[s.currency]} ${BILLING[s.billing]})` }))} /></div>
      </section>
    </div>

    </>}
    {tab === "files" && <>
    <ProjectAssets projectId={p.id} admin />
    <Credentials projectId={p.id} me={me} />
    <FinalFiles files={files} me={me} projectId={p.id} />

    </>}
    {tab === "brief" && <>
    <section className="card" style={{ borderTopColor: "var(--pink)" }}><h2>البريف</h2>
      {briefs.map((b) => <div key={b.id} className="actions" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBlock: 6 }}>
        <span><a href={`/api/briefs/${b.id}`} target="_blank" rel="noopener"><b>بريف {b.lang === "ar" ? "عربي" : "English"}</b></a> <span className="sub">· {b.createdAt.toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span></span>
        <form action={deleteBrief}><input type="hidden" name="id" value={b.id} /><button className="sm ghost">حذف</button></form></div>)}
      <div style={{ marginTop: 14 }}><b style={{ color: "var(--navy)" }}>توليد بريف جديد</b><div style={{ marginTop: 10 }}>
        <BriefForm projectId={p.id} currency={CUR[p.currency]} hint={p.description || "مثال: الفرعين بيستخدموا كاشيرين، 90% من العملاء بيجوا من الخرايط…"} suppliers={sups.map((s) => ({ id: s.id, label: `${s.provider} · ${s.item} (${s.price} ${CUR[s.currency]} ${BILLING[s.billing]})` }))} />
      </div></div>
    </section>

    </>}
    {tab === "details" && <>
    <section className="card"><details open><summary>بيانات المشروع ومرحلته</summary><div style={{ marginTop: 12 }}><EditProject p={p} clients={allClients} /></div></details></section>
    <section className="card danger-zone" id="delete"><h2>حذف المشروع</h2><DeleteProject id={p.id} name={p.name} /></section>
    </>}
  </>);
}
