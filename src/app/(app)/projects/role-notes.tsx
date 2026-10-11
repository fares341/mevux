import { asc, inArray } from "drizzle-orm";
import { db, roleNotes } from "@/lib/db";
import { deleteRoleNote } from "./role-notes-actions";
import RoleNoteForm from "./role-note-form";

type Note = typeof roleNotes.$inferSelect;
const when = (d: Date) => d.toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Load notes for several roles at once. Caller must only pass roles the viewer may see notes for. */
export async function loadRoleNotes(roleIds: string[]) {
  if (!roleIds.length) return [] as Note[];
  return db.select().from(roleNotes).where(inArray(roleNotes.roleId, roleIds)).orderBy(asc(roleNotes.createdAt));
}

export function RoleNotes({ notes, roleId, admin }: { notes: Note[]; roleId: string; admin: boolean }) {
  const mine = notes.filter((n) => n.roleId === roleId);
  return (<div className="rnotes">
    <b className="rnotes-h">تفاصيل الدور {mine.length > 0 && <span className="pill info">{mine.length}</span>}</b>
    {!mine.length && <p className="sub" style={{ margin: "4px 0" }}>{admin ? "لسه مفيش تفاصيل. اكتب تيكت أو ارفع ملفات أو سجّل فويس للي ماسك الدور ده." : "لسه مفيش تفاصيل من المدير للدور ده."}</p>}
    {mine.length > 0 && <ul className="rnotes-list">{mine.map((n) => {
      const src = `/api/role-notes/${n.id}`, mime = (n.mime || "").split(";")[0];
      return (<li key={n.id}>
        {n.text && <div className="rn-text">{n.text}</div>}
        {n.storedName && (mime.startsWith("image/") ? <a href={src} target="_blank" rel="noopener"><img src={src} alt={n.fileName || ""} loading="lazy" className="rn-img" /></a>
          : n.isVoice || mime.startsWith("audio/") ? <div className="rn-voice"><span aria-hidden="true">🎤</span><audio controls preload="none" src={src} /></div>
          : mime.startsWith("video/") ? <video controls preload="none" src={src} className="rn-video" />
          : <a href={src} target="_blank" rel="noopener" className="ev-file">📎 {n.fileName}<small>{Math.max(1, Math.round((n.size || 0) / 1024))} ك.ب</small></a>)}
        <div className="rn-meta"><small>{when(n.createdAt)}</small>
          {admin && <form action={deleteRoleNote}><input type="hidden" name="id" value={n.id} /><button className="sm ghost">مسح</button></form>}</div>
      </li>);
    })}</ul>}
    {admin && <details className="rn-add"><summary>+ ضيف تفاصيل للدور ده</summary><div style={{ marginTop: 10 }}><RoleNoteForm roleId={roleId} /></div></details>}
  </div>);
}
