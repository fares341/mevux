import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listTasks, visibleProjects, TASK_ST, type TaskSt } from "@/lib/work";
import { db, users, roleMembers, projectRoles } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import { taskStatusAction } from "../work-actions";
import { TaskForm } from "../work-forms";
import { myTodos } from "@/lib/todos";
import { toggleTodoAction, deleteTodoAction, editTodoAction } from "./todo-actions";
import TodoForm from "./todo-form";
import { fmtCairo, dateToCairoInput, cairoEndOfDay } from "@/lib/tz";

function dueChip(d: Date | null, done: boolean) {
  if (!d) return null;
  const now = new Date(), end = cairoEndOfDay();
  const cls = done ? "" : d < now ? "bad" : d <= end ? "warn" : "info";
  const label = !done && d < now ? "فات: " : !done && d <= end ? "النهارده: " : "";
  return <span className={"pill " + cls}>{label}{d.toLocaleString("ar-EG", { timeZone: "Africa/Cairo", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>;
}

async function MyList({ sub }: { sub: "open" | "ideas" | "done" }) {
  const u = await requireUser();
  const [items, open, ideas] = await Promise.all([myTodos(u, sub), myTodos(u, "open"), myTodos(u, "ideas")]);
  return (<>
    <section className="card"><h2>قايمتي</h2>
      <p className="sub" style={{ marginTop: -6 }}>مهامك وأفكارك عشان ما تنساش. محدش بيشوفها غيرك، حتى المدير. وتقدر تقول للمساعد: «فكّرني أكلّم فلان بكرة الساعة 11».</p>
      <TodoForm defaultKind={sub === "ideas" ? "IDEA" : "TASK"} />
    </section>
    <div className="actions" style={{ marginBottom: 12 }}>
      {([["open", `مهام مفتوحة (${open.length})`], ["ideas", `أفكار (${ideas.length})`], ["done", "اللي خلصت"]] as const).map(([k, l]) => <Link key={k} href={`/tasks?view=me&sub=${k}`} className={sub === k ? "btn sm" : "btn ghost-link sm"}>{l}</Link>)}
    </div>
    {items.length ? <ul className="todo-list">{items.map((t) => (<li key={t.id} className={t.doneAt ? "done" : ""}>
      <form action={toggleTodoAction}><input type="hidden" name="id" value={t.id} /><button className="todo-check" aria-pressed={!!t.doneAt} aria-label={t.doneAt ? "رجّعها مفتوحة" : "خلصت"}>{t.doneAt ? "✓" : ""}</button></form>
      <div className="todo-body">
        <div className="todo-title">{t.kind === "IDEA" && <span aria-hidden="true">💡 </span>}{t.title}</div>
        {t.details && <div className="todo-details">{t.details}</div>}
        <div className="todo-meta">{dueChip(t.dueAt, !!t.doneAt)}{t.doneAt && <small>خلصت {fmtCairo(t.doneAt)}</small>}</div>
      </div>
      <details className="todo-edit"><summary aria-label="تعديل">تعديل</summary>
        <form action={editTodoAction}><input type="hidden" name="id" value={t.id} />
          <label>العنوان<input name="title" defaultValue={t.title} /></label>
          <label>التفاصيل<textarea name="details" rows={2} defaultValue={t.details ?? ""} /></label>
          <div className="row"><label>إمتى<input type="datetime-local" name="due" defaultValue={dateToCairoInput(t.dueAt)} /></label>
            <label>النوع<select name="kind" defaultValue={t.kind}><option value="TASK">مهمة</option><option value="IDEA">فكرة</option></select></label></div>
          <div className="actions"><button className="sm">حفظ</button></div>
        </form>
        <form action={deleteTodoAction} style={{ marginTop: 8 }}><input type="hidden" name="id" value={t.id} /><button className="sm ghost">مسح</button></form>
      </details>
    </li>))}</ul> : <div className="note">{sub === "open" ? "مفيش مهام مفتوحة. اكتب أول مهمة فوق." : sub === "ideas" ? "مفيش أفكار متسجلة لسه." : "لسه ما خلصتش حاجة من القايمة."}</div>}
  </>);
}

const fmt = (d: Date | null) => (d ? d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) : "—");
const PILL: Record<string, string> = { TODO: "info", DOING: "warn", REVIEW: "info", DONE: "ok", BLOCKED: "bad" };

export default async function Tasks({ searchParams }: { searchParams: Promise<{ view?: string; sub?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const view = sp.view || "me";
  const tabs = <div className="actions" style={{ marginBottom: 16 }}>
    {[["me", "قايمتي"], ["mine", "مهام المشاريع"], ["all", "كل مهام المشاريع"], ["done", "مهام مشاريع خلصت"]].map(([k, l]) => <Link key={k} href={`/tasks?view=${k}`} className={view === k ? "btn" : "btn ghost-link"}>{l}</Link>)}
  </div>;
  if (view === "me") return (<>
    <div className="head"><div><span className="tag">العمل</span><h1>المهام</h1><p className="sub">قايمتك الشخصية، ومهام المشاريع اللي اتوزعت عليك.</p></div></div>
    {tabs}
    <MyList sub={sp.sub === "ideas" || sp.sub === "done" ? sp.sub : "open"} />
  </>);
  const lead = u.role !== "MEMBER";
  const [list, projects] = await Promise.all([listTasks(u, { mine: view === "mine", open: view !== "done" }), visibleProjects(u)]);
  // Team of each project, so a task can be given to one or several of them.
  const pids = projects.map((p) => p.id);
  const mem = lead && pids.length ? await db.selectDistinct({ projectId: projectRoles.projectId, id: users.id, name: users.name }).from(roleMembers).innerJoin(projectRoles, eq(roleMembers.roleId, projectRoles.id)).innerJoin(users, eq(roleMembers.userId, users.id)).where(inArray(projectRoles.projectId, pids)) : [];
  const rows = view === "done" ? list.filter((t) => t.status === "DONE") : list;
  const now = new Date();
  return (<>
    <div className="head"><div><span className="tag">العمل</span><h1>المهام</h1><p className="sub">كل واحد يحدّث حالة مهامه، والمدير والتيم ليد بيوزّعوها.</p></div></div>
    {tabs}
    {lead && <div className="card"><details><summary>مهمة جديدة</summary><div style={{ marginTop: 12 }}><TaskForm projects={projects.map((p) => ({ id: p.id, name: p.name, members: mem.filter((m) => m.projectId === p.id).map((m) => ({ id: m.id, name: m.name })) }))} /></div></details></div>}
    {rows.length ? <div className="card plain table-wrap"><table>
      <thead><tr><th>المهمة</th><th>المشروع</th><th>مسؤول</th><th>الموعد</th><th>الحالة</th></tr></thead>
      <tbody>{rows.map((t) => { const canEdit = lead || t.mineToo; const late = t.dueDate && t.dueDate < now && t.status !== "DONE"; return (<tr key={t.id}>
        <td><b>{t.title}</b>{t.details && <div className="sub" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{t.details}</div>}</td>
        <td><Link href={`/projects/${t.projectId}`}>{t.project}</Link></td><td>{t.assignees.length ? <>{t.assignees.map((a) => a.name).join("، ")}{t.assignees.length > 1 && <div><span className="pill info">مشتركة</span></div>}</> : "—"}</td>
        <td>{late ? <span className="pill bad">{fmt(t.dueDate)}</span> : fmt(t.dueDate)}</td>
        <td>{canEdit ? <form action={taskStatusAction} className="actions"><input type="hidden" name="id" value={t.id} />
          {(Object.keys(TASK_ST) as TaskSt[]).map((k) => <button key={k} name="status" value={k} className={t.status === k ? "sm" : "sm ghost"} aria-pressed={t.status === k}>{TASK_ST[k]}</button>)}</form>
          : <span className={"pill " + PILL[t.status]}>{TASK_ST[t.status]}</span>}</td></tr>); })}</tbody></table></div>
      : <div className="note">مفيش مهام هنا.</div>}
  </>);
}
