import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listTasks, visibleProjects, activeUsers, TASK_ST, type TaskSt } from "@/lib/work";
import { taskStatusAction } from "../work-actions";
import { TaskForm } from "../work-forms";

const fmt = (d: Date | null) => (d ? d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) : "—");
const PILL: Record<string, string> = { TODO: "info", DOING: "warn", REVIEW: "info", DONE: "ok", BLOCKED: "bad" };

export default async function Tasks({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const u = await requireUser();
  const view = (await searchParams).view || "mine";
  const lead = u.role !== "MEMBER";
  const [list, projects, people] = await Promise.all([listTasks(u, { mine: view === "mine", open: view !== "done" }), visibleProjects(u), activeUsers()]);
  const rows = view === "done" ? list.filter((t) => t.status === "DONE") : list;
  const now = new Date();
  return (<>
    <div className="head"><div><span className="tag">العمل</span><h1>المهام</h1><p className="sub">كل واحد يحدّث حالة مهامه، والمدير والتيم ليد بيوزّعوها.</p></div></div>
    <div className="actions" style={{ marginBottom: 16 }}>
      {[["mine", "مهامي"], ["all", "كل المهام المفتوحة"], ["done", "اللي خلصت"]].map(([k, l]) => <Link key={k} href={`/tasks?view=${k}`} className={view === k ? "btn" : "btn ghost-link"}>{l}</Link>)}
    </div>
    {lead && <div className="card"><details><summary>مهمة جديدة</summary><div style={{ marginTop: 12 }}><TaskForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} people={people} /></div></details></div>}
    {rows.length ? <div className="card plain table-wrap"><table>
      <thead><tr><th>المهمة</th><th>المشروع</th><th>مسؤول</th><th>الموعد</th><th>الحالة</th></tr></thead>
      <tbody>{rows.map((t) => { const canEdit = lead || t.assigneeId === u.id; const late = t.dueDate && t.dueDate < now && t.status !== "DONE"; return (<tr key={t.id}>
        <td><b>{t.title}</b>{t.details && <div className="sub" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{t.details}</div>}</td>
        <td><Link href={`/projects/${t.projectId}`}>{t.project}</Link></td><td>{t.assignee || "—"}</td>
        <td>{late ? <span className="pill bad">{fmt(t.dueDate)}</span> : fmt(t.dueDate)}</td>
        <td>{canEdit ? <form action={taskStatusAction} className="actions"><input type="hidden" name="id" value={t.id} />
          {(Object.keys(TASK_ST) as TaskSt[]).map((k) => <button key={k} name="status" value={k} className={t.status === k ? "sm" : "sm ghost"} aria-pressed={t.status === k}>{TASK_ST[k]}</button>)}</form>
          : <span className={"pill " + PILL[t.status]}>{TASK_ST[t.status]}</span>}</td></tr>); })}</tbody></table></div>
      : <div className="note">مفيش مهام هنا.</div>}
  </>);
}
