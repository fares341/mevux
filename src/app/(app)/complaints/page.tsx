import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listComplaints, visibleProjects, myProjectIds, COMPLAINT_ST } from "@/lib/work";
import { db, users, roleMembers, projectRoles } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import { decideComplaintAction } from "../work-actions";
import { ComplaintForm, RespondComplaint } from "../work-forms";

const fmt = (d: Date) => d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
const PILL: Record<string, string> = { OPEN: "warn", ANSWERED: "info", RESOLVED: "ok", DISMISSED: "ok", DEDUCTED: "bad" };

export default async function Complaints() {
  const u = await requireUser();
  const admin = u.role === "ADMIN";
  const [list, vis, mine] = await Promise.all([listComplaints(u), visibleProjects(u), myProjectIds(u.id)]);
  const canFileOn = admin ? vis : vis.filter((p) => mine.includes(p.id));
  const ids = canFileOn.map((p) => p.id);
  const mem = ids.length ? await db.selectDistinct({ projectId: projectRoles.projectId, id: users.id, name: users.name }).from(roleMembers).innerJoin(projectRoles, eq(roleMembers.roleId, projectRoles.id)).innerJoin(users, eq(roleMembers.userId, users.id)).where(inArray(projectRoles.projectId, ids)) : [];
  const forms = canFileOn.map((p) => ({ id: p.id, name: p.name, members: mem.filter((m) => m.projectId === p.id && m.id !== u.id).map((m) => ({ id: m.id, name: m.name })) })).filter((p) => p.members.length);
  return (<>
    <div className="head"><div><span className="tag">العمل</span><h1>الشكاوى</h1><p className="sub">مشكلة في شغل حد في مشروع؟ سجّلها بالدليل. اسم اللي اشتكى بيظهر للمدير بس.</p></div></div>
    {forms.length > 0 && <div className="card"><details><summary>شكوى جديدة</summary><div style={{ marginTop: 12 }}><ComplaintForm projects={forms} /></div></details></div>}
    {list.length ? list.map((c) => (
      <section key={c.id} className="card" style={{ borderTopColor: c.status === "OPEN" ? "var(--warn)" : undefined }}>
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <b>على {c.against} · <Link href={`/projects/${c.projectId}`}>{c.project}</Link></b>
          <span><span className={"pill " + PILL[c.status]}>{COMPLAINT_ST[c.status]}</span> <span className="sub">{fmt(c.createdAt)}</span></span>
        </div>
        {admin && <p className="sub">من: {c.reporter}</p>}{!admin && c.mine && <p className="sub">إنت اللي قدّمتها</p>}
        <p style={{ whiteSpace: "pre-wrap" }}>{c.text}</p>
        {c.evidence && <p className="sub" style={{ whiteSpace: "pre-wrap" }}>الدليل: {c.evidence}</p>}
        {c.response ? <div className="note"><b>رد {c.against}: </b>{c.response}</div> : c.againstId === u.id && ["OPEN", "ANSWERED"].includes(c.status) ? <RespondComplaint id={c.id} /> : <p className="sub">لسه مافيش رد.</p>}
        {c.decisionNote && <p className="sub">قرار المدير: {c.decisionNote}</p>}
        {admin && ["OPEN", "ANSWERED"].includes(c.status) && <form action={decideComplaintAction} style={{ marginTop: 10 }}><input type="hidden" name="id" value={c.id} />
          <div className="row"><label>ملاحظة القرار<input id={"dn-" + c.id} name="note" /></label>
            <label>نوع الخصم لو هتخصم<select id={"dt-" + c.id} name="dedType" defaultValue="REWORK"><option value="REWORK">رجوع شغل فيه أخطاء</option><option value="NO_REPLY">عدم الرد</option><option value="CLIENT_LOSS">خسارة عميل + حرمان</option><option value="CLIENT_REFUSE">رفض العميل الإعادة + حرمان</option></select></label></div>
          <div className="actions"><button name="decision" value="RESOLVED" className="sm">اتحلت</button><button name="decision" value="DISMISSED" className="sm ghost">رفض الشكوى</button><button name="decision" value="DEDUCT" className="sm danger">تحويل لخصم (للمراجعة)</button></div></form>}
      </section>)) : <div className="note">مفيش شكاوى.</div>}
  </>);
}
