import { asc, eq, inArray } from "drizzle-orm";
import { db, projectFiles, credentials, users } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { deleteFile, deleteCredential } from "./files-actions";
import { Secret, CredentialForm, FinalUpload } from "./files-ui";

const size = (b: number) => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.ceil(b / 1024) + " KB");
const fmt = (d: Date) => d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" });

type F = typeof projectFiles.$inferSelect & { by: string };
export async function loadFiles(projectId: string): Promise<F[]> {
  const rows = await db.select({ f: projectFiles, by: users.name }).from(projectFiles).innerJoin(users, eq(projectFiles.uploadedBy, users.id)).where(eq(projectFiles.projectId, projectId)).orderBy(asc(projectFiles.createdAt));
  return rows.map((r) => ({ ...r.f, by: r.by }));
}

export function FileList({ files, me }: { files: F[]; me: SessionUser }) {
  if (!files.length) return <p className="sub">مفيش ملفات لسه.</p>;
  return (<div>{files.map((f) => (
    <div key={f.id} className="actions" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBlock: 6 }}>
      <span><a href={`/api/files/${f.id}`} target="_blank" rel="noopener"><b>{f.originalName}</b></a> <span className="sub">· {size(f.size)} · {f.by} · {fmt(f.createdAt)}{f.note ? ` · ${f.note}` : ""}</span></span>
      {(me.role === "ADMIN" || f.uploadedBy === me.id) && <form action={deleteFile}><input type="hidden" name="id" value={f.id} /><button className="sm ghost">حذف</button></form>}
    </div>))}</div>);
}

// Only rendered for people already checked with canAccessProject.
export async function Credentials({ projectId, me }: { projectId: string; me: SessionUser }) {
  const rows = await db.select().from(credentials).where(eq(credentials.projectId, projectId)).orderBy(asc(credentials.createdAt));
  if (rows.length) await audit(me.id, "credentials_view", projectId);
  const admin = me.role === "ADMIN";
  return (<section className="card" style={{ borderTopColor: "var(--cyan)" }}>
    <h2>بيانات الدخول للمشروع</h2>
    <p className="sub" style={{ marginTop: -6 }}>بتظهر لأعضاء المشروع بس. كل فتح للصفحة دي بيتسجل.</p>
    {rows.length ? <div className="table-wrap"><table>
      <thead><tr><th>الاسم</th><th>الرابط / IP</th><th>المستخدم</th><th>كلمة المرور</th><th>ملاحظات</th>{admin && <th></th>}</tr></thead>
      <tbody>{rows.map((c) => { let secret = ""; try { secret = c.secretEnc ? decrypt(c.secretEnc) : ""; } catch { secret = "(تعذر فك التشفير)"; } return (
        <tr key={c.id}><td><b>{c.label}</b></td>
          <td className="num">{c.url ? (/^https?:\/\//.test(c.url) ? <a href={c.url} target="_blank" rel="noopener noreferrer">{c.url}</a> : c.url) : "—"}</td>
          <td className="num">{c.username || "—"}</td><td>{secret ? <Secret value={secret} /> : "—"}</td>
          <td style={{ maxWidth: 260, whiteSpace: "pre-wrap" }}>{c.notes || "—"}</td>
          {admin && <td><form action={deleteCredential}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="projectId" value={projectId} /><button className="sm ghost">حذف</button></form></td>}</tr>); })}</tbody></table></div>
      : <p className="sub">مفيش بيانات دخول متسجلة.</p>}
    {admin && <details style={{ marginTop: 12 }}><summary>إضافة بيانات دخول</summary><div style={{ marginTop: 12 }}><CredentialForm projectId={projectId} /></div></details>}
  </section>);
}

export function FinalFiles({ files, me, projectId }: { files: F[]; me: SessionUser; projectId: string }) {
  const finals = files.filter((f) => f.kind === "FINAL");
  return (<section className="card"><h2>الملفات النهائية للمشروع</h2>
    <FileList files={finals} me={me} />
    {me.role === "ADMIN" && <div style={{ marginTop: 12 }}><FinalUpload projectId={projectId} /></div>}
  </section>);
}
