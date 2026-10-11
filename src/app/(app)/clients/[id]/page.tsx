import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db, clients, clientEvents, projects, users, clientFiles, installments } from "@/lib/db";
import { asc } from "drizzle-orm";
import { STAGES, STAGE_ORDER, stageLabel } from "@/lib/labels";
import { STATUS } from "@/lib/projects";
import { egp } from "@/lib/finance";
import { StageLog, EditClient, ClientFileForm, InstallmentForm } from "../forms";
import { deleteClient, deleteClientFile, deleteInstallment, togglePaid } from "../actions";

const CUR: Record<string, string> = { EGP: "ج", SAR: "ريال", USD: "$" };
const KIND: Record<string, string> = { BRIEF: "بريف", CONTRACT: "عقد", OTHER: "ملف" };
const fmt = (x: Date | null) => (x ? x.toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const c = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!c) notFound();
  const [events, ps, files, plan] = await Promise.all([
    db.select().from(clientEvents).where(eq(clientEvents.clientId, id)).orderBy(desc(clientEvents.createdAt)),
    db.select().from(projects).where(eq(projects.clientId, id)).orderBy(desc(projects.createdAt)),
    db.select().from(clientFiles).where(eq(clientFiles.clientId, id)).orderBy(desc(clientFiles.createdAt)),
    db.select().from(installments).where(eq(installments.clientId, id)).orderBy(asc(installments.sort), asc(installments.createdAt)),
  ]);
  const byCur = (rows: typeof plan) => Object.entries(rows.reduce((m, r) => ({ ...m, [r.currency]: (m[r.currency] || 0) + r.amount }), {} as Record<string, number>)).map(([k, v]) => `${egp(v)} ${CUR[k]}`).join(" + ") || "0";
  const paidPct = plan.length ? Math.round(plan.filter((x) => x.paidAt).length / plan.length * 100) : 0;
  const byIds = [...new Set(events.map((e) => e.by).filter(Boolean))] as string[];
  const names = byIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, byIds)) : [];
  const idx = STAGE_ORDER.indexOf(c.stage as (typeof STAGE_ORDER)[number]);
  return (<>
    <div className="head"><div><span className="tag">العملاء</span><h1>{c.name}</h1><p className="sub">{[c.company, c.country].filter(Boolean).join(" · ")}{c.phone && <> · <bdi dir="ltr">{c.phone}</bdi></>}{c.email && <> · <bdi dir="ltr">{c.email}</bdi></>}</p></div>
      <Link className="btn" href={`/projects?tab=new&client=${c.id}`}>+ مشروع للعميل ده</Link></div>

    <div className="pipeline">
      {STAGE_ORDER.map((s, i) => <div key={s} className={"step" + (i < idx ? " past" : i === idx ? " on" : "")}><span className="n num">{i + 1}</span><b>{STAGES[s]}</b></div>)}
    </div>
    {(c.stage === "ON_HOLD" || c.stage === "LOST") && <div className="msg bad">الحالة: {STAGES[c.stage]}</div>}
    {c.customStage && <div className="note"><b>الحالة دلوقتي: </b>{c.customStage}</div>}
    <div className="grid">
      <div className="stat"><b style={{ fontSize: 18 }}>{stageLabel(c)}</b><span>المرحلة الحالية</span></div>
      <div className="stat"><b className="num" style={{ fontSize: 18 }}>{byCur(plan.filter((x) => x.paidAt))}</b><span>اتدفع من {byCur(plan)} · {paidPct}% من الدفعات</span></div>
      <div className="stat"><b style={{ fontSize: 18 }}>{c.nextStep || "—"}</b><span>الخطوة الجاية · {fmt(c.nextDate)}</span></div>
    </div>
    {c.need && <div className="note" style={{ whiteSpace: "pre-wrap" }}><b>محتاج: </b>{c.need}</div>}

    <section className="card"><h2>تسجيل تحديث</h2><StageLog c={c} /></section>

    <section className="card"><h2>اتفاق الدفعات</h2>
      {plan.length > 0 && <div className="table-wrap" style={{ marginBottom: 14 }}><table>
        <thead><tr><th>اتدفعت؟</th><th>الدفعة</th><th>المبلغ</th><th>إمتى</th><th>المشروع</th><th></th></tr></thead>
        <tbody>{plan.map((x) => <tr key={x.id}>
          <td><form action={togglePaid}><input type="hidden" name="id" value={x.id} /><button className={x.paidAt ? "sm" : "sm ghost"} aria-pressed={!!x.paidAt} style={x.paidAt ? { background: "var(--ok)" } : undefined}>{x.paidAt ? "✓ اتدفعت " + fmt(x.paidAt) : "علّم إنها اتدفعت"}</button></form></td>
          <td><b>{x.label}</b></td><td><span className="num">{egp(x.amount)}</span> {CUR[x.currency]}</td><td>{x.dueNote || "—"}</td>
          <td>{ps.find((p) => p.id === x.projectId)?.name || "—"}</td>
          <td><form action={deleteInstallment}><input type="hidden" name="id" value={x.id} /><button className="sm ghost">حذف</button></form></td></tr>)}</tbody></table></div>}
      <details open={!plan.length}><summary>إضافة دفعة للاتفاق</summary><div style={{ marginTop: 12 }}><InstallmentForm clientId={c.id} projects={ps.map((p) => ({ id: p.id, name: p.name, currency: p.currency }))} /></div></details>
    </section>

    <section className="card"><h2>ملف العميل</h2>
      {files.length ? files.map((f) => <div key={f.id} className="actions" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBlock: 6 }}>
        <span><span className="pill info">{KIND[f.kind] || "ملف"}</span> <a href={`/api/client-files/${f.id}`} target="_blank" rel="noopener"><b>{f.originalName}</b></a> <span className="sub">· {fmt(f.createdAt)}{f.note ? ` · ${f.note}` : ""}</span></span>
        <form action={deleteClientFile}><input type="hidden" name="id" value={f.id} /><button className="sm ghost">حذف</button></form></div>) : <p className="sub">مفيش ملفات. ارفع البريف هنا.</p>}
      <div style={{ marginTop: 12 }}><ClientFileForm clientId={c.id} /></div>
    </section>

    <section className="card"><h2>السجل</h2>
      {events.map((e) => <div key={e.id} style={{ borderRight: "3px solid var(--cyan)", paddingInline: 12, marginBottom: 12 }}>
        <div className="sub" style={{ margin: 0 }}>{fmt(e.createdAt)} · {names.find((n) => n.id === e.by)?.name || ""}</div>
        {e.stage && <span className="pill info">← {STAGES[e.stage]}</span>} {e.customStage && <span className="pill warn">{e.customStage}</span>}
        {e.note && <p style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>{e.note}</p>}
      </div>)}
    </section>

    <section className="card"><h2>المشاريع</h2>
      {ps.length ? ps.map((p) => <div key={p.id}><Link href={`/projects/${p.id}`}><b>{p.name}</b></Link> · {STATUS[p.status]} · <span className="num">{egp(p.price)}</span> {CUR[p.currency]}</div>) : <p className="sub">مفيش مشاريع لسه.</p>}
    </section>

    <section className="card"><details><summary>بيانات العميل</summary><div style={{ marginTop: 12 }}><EditClient c={c} /></div></details></section>
    <form action={deleteClient} className="actions"><input type="hidden" name="id" value={c.id} /><input id="del-client" name="confirm" placeholder='اكتب "حذف" لحذف العميل' style={{ maxWidth: 220 }} /><button className="sm danger">حذف العميل</button></form>
  </>);
}
