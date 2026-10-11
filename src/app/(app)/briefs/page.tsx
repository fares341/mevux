import Link from "next/link";
import { asc, desc, eq, ne } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db, projects, projectBriefs, suppliers } from "@/lib/db";
import { BILLING } from "@/lib/labels";
import { STATUS } from "@/lib/projects";
import { BriefForm, ReviseForm } from "../projects/brief-ui";
import { deleteBrief } from "../projects/brief-actions";

const CUR: Record<string, string> = { EGP: "ج", SAR: "ريال", USD: "$" };
const when = (d: Date) => d.toLocaleString("ar-EG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export default async function Briefs({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [ps, all, sups] = await Promise.all([
    db.select().from(projects).where(ne(projects.status, "CANCELLED")).orderBy(desc(projects.createdAt)),
    db.select({ b: projectBriefs, project: projects.name, client: projects.client }).from(projectBriefs).innerJoin(projects, eq(projectBriefs.projectId, projects.id)).orderBy(desc(projectBriefs.createdAt)),
    db.select().from(suppliers).orderBy(asc(suppliers.provider)),
  ]);
  const chosen = ps.find((p) => p.id === sp.project);
  // Group versions of the same brief, newest version first.
  const byRoot = new Map<string, typeof all>();
  for (const x of all) { const k = x.b.parentId ?? x.b.id; byRoot.set(k, [...(byRoot.get(k) ?? []), x]); }
  const groups = [...byRoot.values()].map((g) => g.sort((a, b) => b.b.version - a.b.version)).sort((a, b) => +b[0].b.createdAt - +a[0].b.createdAt);
  return (<>
    <div className="head"><div><span className="tag">العمل</span><h1>البريفات</h1><p className="sub">اعمل بريف PDF لأي مشروع بالعربي أو الإنجليزي، وكل البريفات اللي اتعملت قبل كده هنا.</p></div></div>

    <section className="card" style={{ borderTopColor: "var(--pink)" }}><h2>بريف جديد</h2>
      <form className="row" method="get" action="/briefs" style={{ alignItems: "end" }}>
        <label>المشروع<select id="br-project" name="project" defaultValue={chosen?.id || ""} required>
          <option value="">— اختر المشروع —</option>
          {ps.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.client} · {STATUS[p.status]}</option>)}
        </select></label>
        <div className="actions"><button className="ghost">اختيار</button><Link href="/projects?tab=new" className="btn ghost-link">+ مشروع جديد</Link></div>
      </form>
      {!ps.length && <p className="sub">البريف بيتعمل من مشروع عشان ياخد السعر والدفعات والمدة. اعمل مشروع للعميل الأول.</p>}
      {chosen && <div style={{ marginTop: 14 }}>
        <div className="note">بيانات من السيستم هتدخل البريف تلقائياً: السعر <b className="num">{chosen.price.toLocaleString("en-US")}</b> {CUR[chosen.currency]}، ودفعات الاتفاق من صفحة العميل، والمدة من تاريخ البداية والتسليم، والأدوار ومخرجاتها. <Link href={`/projects/${chosen.id}`}>راجع المشروع</Link></div>
        <BriefForm projectId={chosen.id} currency={CUR[chosen.currency]} hint={chosen.description || "مثال: الفرعين بيستخدموا كاشيرين، أكتر من 200 عملية بتكلفة صفرية، 90% من العملاء بيجوا من خرايط Google…"}
          suppliers={sups.map((s) => ({ id: s.id, label: `${s.provider} · ${s.item} (${s.price} ${CUR[s.currency]} ${BILLING[s.billing]})` }))} />
      </div>}
    </section>

    <section className="card plain"><h2>كل البريفات</h2>
      {groups.length ? groups.map((g) => { const latest = g[0]; return (
        <div key={latest.b.parentId ?? latest.b.id} style={{ borderBottom: "1px solid var(--line)", paddingBlock: 12 }}>
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <span><Link href={`/projects/${latest.b.projectId}`}><b>{latest.project}</b></Link> · {latest.client} · {latest.b.lang === "ar" ? "عربي" : "English"} · <span className="pill info">نسخة {latest.b.version}</span></span>
            <span className="actions"><a className="btn" href={`/api/briefs/${latest.b.id}`} target="_blank" rel="noopener">فتح آخر نسخة</a><form action={deleteBrief}><input type="hidden" name="id" value={latest.b.id} /><button className="sm ghost">حذف النسخة</button></form></span>
          </div>
          <details style={{ marginTop: 8 }}><summary>عدّل البريف بالكلام أو بالفويس</summary><ReviseForm id={latest.b.id} /></details>
          {g.length > 1 && <details style={{ marginTop: 6 }}><summary>النسخ القديمة ({g.length - 1})</summary>
            {g.slice(1).map(({ b }) => <div key={b.id} className="sub" style={{ marginTop: 6 }}><a href={`/api/briefs/${b.id}`} target="_blank" rel="noopener">نسخة {b.version}</a> · {when(b.createdAt)}{b.instruction ? ` · "${b.instruction.slice(0, 90)}"` : ""}</div>)}
          </details>}
        </div>); }) : <p className="sub">لسه مفيش بريفات.</p>}
    </section>
  </>);
}
