import { asc, eq, inArray } from "drizzle-orm";
import { db, projectAssets, projects } from "@/lib/db";
import { ASSET_KINDS, PAID_BY } from "@/lib/labels";
import { deleteAsset } from "./asset-actions";
import { AssetForm } from "./asset-ui";

const CUR: Record<string, string> = { EGP: "ج", SAR: "ريال", USD: "$" };
const PER: Record<string, string> = { MONTHLY: "/ شهر", YEARLY: "/ سنة", ONE_TIME: "مرة واحدة" };
type Asset = typeof projectAssets.$inferSelect & { projectName?: string };

function Row({ a, admin, projectId }: { a: Asset; admin: boolean; projectId?: string }) {
  return (<div style={{ borderBottom: "1px solid var(--line)", paddingBlock: 10 }}>
    <div className="actions" style={{ justifyContent: "space-between" }}>
      <span><span className="pill info">{ASSET_KINDS[a.kind as keyof typeof ASSET_KINDS] || a.kind}</span> <b>{a.name}</b>{a.projectName && <span className="sub"> · {a.projectName}</span>}
        {a.url && <> · {/^https?:\/\//.test(a.url) ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="num">{a.url}</a> : <span className="num">{a.url}</span>}</>}</span>
      <span className="sub">{a.provider}{admin && a.cost ? <> · <span className="num">{a.cost.toLocaleString("en-US")}</span> {CUR[a.currency]} {PER[a.billing]}</> : ""}{admin && <> · {PAID_BY[a.paidBy as keyof typeof PAID_BY]}</>}{a.renewsAt && <> · تجديد {a.renewsAt.toLocaleDateString("ar-EG")}</>}{admin && !a.inBrief && " · مش في البريف"}</span>
    </div>
    {a.details && <p className="sub" style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>{a.details}</p>}
    {admin && projectId && <details style={{ marginTop: 6 }}><summary>تعديل</summary><div style={{ marginTop: 10 }}>
      <AssetForm projectId={projectId} a={a} label="حفظ" />
      <form action={deleteAsset} style={{ marginTop: 8 }}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="projectId" value={projectId} /><button className="sm danger">حذف</button></form>
    </div></details>}
  </div>);
}

export async function ProjectAssets({ projectId, admin }: { projectId: string; admin: boolean }) {
  const rows = await db.select().from(projectAssets).where(eq(projectAssets.projectId, projectId)).orderBy(asc(projectAssets.createdAt));
  if (!admin && !rows.length) return null;
  return (<section className="card"><h2>المواقع والتطبيقات والسيرفرات</h2>
    {rows.length ? rows.map((a) => <Row key={a.id} a={a} admin={admin} projectId={projectId} />) : <p className="sub">ضيف هنا أي موقع أو تطبيق أو SaaS أو سيرفر أو دومين داخل في المشروع، بتفاصيله وتكلفته. بيظهر في البريف وملف العميل.</p>}
    {admin && <details style={{ marginTop: 12 }} open={!rows.length}><summary>إضافة</summary><div style={{ marginTop: 10 }}><AssetForm projectId={projectId} label="إضافة" /></div></details>}
  </section>);
}

export async function ClientAssets({ clientId }: { clientId: string }) {
  const ps = await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.clientId, clientId));
  if (!ps.length) return null;
  const rows = await db.select().from(projectAssets).where(inArray(projectAssets.projectId, ps.map((p) => p.id))).orderBy(asc(projectAssets.createdAt));
  if (!rows.length) return null;
  return (<section className="card"><h2>مواقع وتطبيقات وسيرفرات العميل</h2>
    {rows.map((a) => <Row key={a.id} a={{ ...a, projectName: ps.find((p) => p.id === a.projectId)?.name }} admin />)}
  </section>);
}
