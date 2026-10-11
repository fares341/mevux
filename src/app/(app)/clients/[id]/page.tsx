import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db, clients, clientEvents, projects, users } from "@/lib/db";
import { STAGES, STAGE_ORDER } from "@/lib/labels";
import { STATUS } from "@/lib/projects";
import { egp } from "@/lib/finance";
import { StageLog, EditClient } from "../forms";
import { deleteClient } from "../actions";

const fmt = (x: Date | null) => (x ? x.toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const c = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!c) notFound();
  const [events, ps] = await Promise.all([
    db.select().from(clientEvents).where(eq(clientEvents.clientId, id)).orderBy(desc(clientEvents.createdAt)),
    db.select().from(projects).where(eq(projects.clientId, id)).orderBy(desc(projects.createdAt)),
  ]);
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
    <div className="grid">
      <div className="stat"><b style={{ fontSize: 18 }}>{STAGES[c.stage]}</b><span>المرحلة الحالية</span></div>
      <div className="stat"><b style={{ fontSize: 18 }}>{c.nextStep || "—"}</b><span>الخطوة الجاية · {fmt(c.nextDate)}</span></div>
    </div>
    {c.need && <div className="note" style={{ whiteSpace: "pre-wrap" }}><b>محتاج: </b>{c.need}</div>}

    <section className="card"><h2>تسجيل تحديث</h2><StageLog c={c} /></section>

    <section className="card"><h2>السجل</h2>
      {events.map((e) => <div key={e.id} style={{ borderRight: "3px solid var(--cyan)", paddingInline: 12, marginBottom: 12 }}>
        <div className="sub" style={{ margin: 0 }}>{fmt(e.createdAt)} · {names.find((n) => n.id === e.by)?.name || ""}</div>
        {e.stage && <span className="pill info">← {STAGES[e.stage]}</span>}
        {e.note && <p style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>{e.note}</p>}
      </div>)}
    </section>

    <section className="card"><h2>المشاريع</h2>
      {ps.length ? ps.map((p) => <div key={p.id}><Link href={`/projects/${p.id}`}><b>{p.name}</b></Link> · {STATUS[p.status]} · <span className="num">{egp(p.price)}</span> {p.currency}</div>) : <p className="sub">مفيش مشاريع لسه.</p>}
    </section>

    <section className="card"><details><summary>بيانات العميل</summary><div style={{ marginTop: 12 }}><EditClient c={c} /></div></details></section>
    <form action={deleteClient} className="actions"><input type="hidden" name="id" value={c.id} /><input id="del-client" name="confirm" placeholder='اكتب "حذف" لحذف العميل' style={{ maxWidth: 220 }} /><button className="sm danger">حذف العميل</button></form>
  </>);
}
