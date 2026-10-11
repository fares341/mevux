import { woState, WO_LABEL, WO_PILL, cutoff } from "@/lib/work-order";
import { deductionSchedule, type Rules } from "@/lib/finance";
import { fmtCairo, dateToCairoInput } from "@/lib/tz";
import { toggleChecklist, decideExtension } from "./work-order-actions";
import { Countdown, AcceptBox, WorkActions, IssueForm, ReviewForm } from "./work-order-forms";

export type WORole = {
  id: string; title: string; scope: string | null; deliverables?: string | null; doneDefinition: string | null; checklist: string | null; checklistDone: string | null;
  deadlineAt: Date | null; dueDate: Date | null; graceHours: number | null; issuedAt: Date | null; acceptedAt: Date | null; deliveredAt: Date | null;
  extUntil: Date | null; extReason: string | null; extStatus: string | null; reviewStatus: string | null; reviewNote: string | null; reworkDueAt: Date | null;
};
const parse = <T,>(s: string | null, d: T): T => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const egp = (n: number) => Math.round(n).toLocaleString("en-US");

function Schedule({ base, role, rules, days }: { base: number; role: WORole; rules: Rules; days: number }) {
  const rows = deductionSchedule(base, role, rules);
  const c = cutoff(role);
  if (!c) return null;
  return (<div className="wo-sched">
    <b>لو اتأخرت، الخصم من أجرك ({egp(base)} ج):</b>
    <table><tbody>
      <tr className={days === 0 ? "on" : ""}><td>لحد {fmtCairo(c)}</td><td>ولا حاجة ✅</td></tr>
      {rows.map((r) => <tr key={r.day} className={days === r.day || (r.last && days > r.day) ? "on" : ""}><td>{r.last ? `من ${fmtCairo(r.from, false)} وبعده` : fmtCairo(r.from, false)}</td><td>{r.pct}% = <b className="num">{egp(r.amount)}</b> ج{r.last ? " (الحد الأقصى)" : ""}</td></tr>)}
    </tbody></table>
    {(role.graceHours ?? 0) > 0 && <small className="sub">المعاد {fmtCairo(role.deadlineAt)}، ومعاك سماح {role.graceHours} ساعة.</small>}
  </div>);
}

function Checklist({ role, canTick }: { role: WORole; canTick: boolean }) {
  const items = parse<string[]>(role.checklist, []), done = parse<number[]>(role.checklistDone, []);
  if (!items.length) return null;
  return (<div className="wo-check"><b>قائمة التسليمات ({done.filter((i) => i < items.length).length}/{items.length})</b>
    <ul>{items.map((t, i) => <li key={i} className={done.includes(i) ? "done" : ""}>
      {canTick ? <form action={toggleChecklist}><input type="hidden" name="roleId" value={role.id} /><input type="hidden" name="i" value={i} /><button className="tick" aria-pressed={done.includes(i)} aria-label={t}>{done.includes(i) ? "☑" : "☐"}</button></form> : <span className="tick">{done.includes(i) ? "☑" : "☐"}</span>}
      <span>{t}</span></li>)}</ul></div>);
}

/** What the person holding the role sees. `base` = their own fee share (only their own money). */
export function WorkOrderMember({ role, base, rules, days }: { role: WORole; base: number; rules: Rules; days: number }) {
  const st = woState(role);
  if (st === "DRAFT") return <div className="wo wo-empty"><b>أمر الشغل</b><p className="sub">المدير لسه بيجهّز تفاصيل دورك. هيوصلك تنبيه أول ما يتبعت.</p></div>;
  const c = cutoff(role);
  const open = !["SUBMITTED", "DONE"].includes(st);
  return (<div className={"wo st-" + st.toLowerCase()}>
    <div className="wo-top">
      <div><b className="wo-h">📋 أمر الشغل</b> <span className={"pill " + WO_PILL[st]}>{WO_LABEL[st]}</span></div>
      {open && c && <Countdown to={(st === "REWORK" && role.reworkDueAt ? role.reworkDueAt : c).toISOString()} late={st === "LATE"} />}
    </div>
    <div className="wo-due">التسليم: <b>{fmtCairo(role.deadlineAt)}</b>{role.extStatus === "APPROVED" && <span className="pill ok">اتمدّ</span>}</div>
    {st === "REWORK" && <div className="msg bad"><b>محتاج تعديل لحد {fmtCairo(role.reworkDueAt)}:</b> {role.reviewNote}</div>}
    {role.scope && <div className="wo-block"><b>المطلوب</b><p>{role.scope}</p></div>}
    <Checklist role={role} canTick={open && !!role.acceptedAt} />
    {role.doneDefinition && <div className="wo-block"><b>يعتبر خلص لما</b><p>{role.doneDefinition}</p></div>}
    {days > 0 && <div className="msg bad">إنت متأخر {days} يوم. الخصم دلوقتي {Math.min(days * rules.latePctPerDay, rules.lateMaxPct)}% = {egp(base * Math.min(days * rules.latePctPerDay, rules.lateMaxPct) / 100)} ج.</div>}
    <Schedule base={base} role={role} rules={rules} days={days} />
    {st === "SENT" && <AcceptBox roleId={role.id} />}
    {role.acceptedAt && <p className="sub" style={{ margin: "6px 0" }}>استلمت {fmtCairo(role.acceptedAt)}{role.deliveredAt ? ` · سلّمت ${fmtCairo(role.deliveredAt)}` : ""}</p>}
    {["WORKING", "LATE", "REWORK"].includes(st) && <WorkActions roleId={role.id} canExtend={st === "WORKING"} extPending={role.extStatus === "PENDING"} minExt={dateToCairoInput(role.deadlineAt)} rework={st === "REWORK"} />}
    {st === "SUBMITTED" && <div className="msg ok">سلّمت والعداد وقف. المدير بيراجع.</div>}
    {st === "DONE" && <div className="msg ok">👏 شغلك اتقبل.</div>}
  </div>);
}

/** Admin: write/send the order, follow status, decide extensions, review. */
export function WorkOrderAdmin({ role, rules, reworkPct, defaultGrace, people }: { role: WORole; rules: Rules; reworkPct: number; defaultGrace: number; people: string }) {
  const st = woState(role);
  const c = cutoff(role);
  const items = parse<string[]>(role.checklist, []);
  const init = { scope: role.scope ?? "", checklist: items.length ? items.join("\n") : (role.deliverables ?? ""), done: role.doneDefinition ?? "", deadline: dateToCairoInput(role.deadlineAt ?? role.dueDate), grace: role.graceHours ?? 0, sent: !!role.issuedAt };
  return (<div className={"wo st-" + st.toLowerCase()}>
    <div className="wo-top">
      <div><b className="wo-h">📋 أمر الشغل</b> <span className={"pill " + WO_PILL[st]}>{WO_LABEL[st]}</span></div>
      {c && !["SUBMITTED", "DONE", "DRAFT"].includes(st) && <Countdown to={c.toISOString()} late={st === "LATE"} />}
    </div>
    {st !== "DRAFT" && <div className="wo-trail">
      <span className="ok">✓ اتبعت {fmtCairo(role.issuedAt)}</span>
      <span className={role.acceptedAt ? "ok" : "wait"}>{role.acceptedAt ? `استلم ${fmtCairo(role.acceptedAt)}` : `${people} لسه ما استلمش`}</span>
      {role.deliveredAt && <span className="ok">سلّم {fmtCairo(role.deliveredAt)}</span>}
    </div>}
    {role.extStatus === "PENDING" && role.extUntil && <div className="msg warn wo-ext">
      <b>طلب تمديد لحد {fmtCairo(role.extUntil)}</b><span>السبب: {role.extReason}</span>
      <form action={decideExtension} className="actions"><input type="hidden" name="roleId" value={role.id} />
        <button name="decision" value="APPROVED" className="sm">موافق</button><button name="decision" value="REJECTED" className="sm ghost">رفض</button></form>
    </div>}
    {st === "SUBMITTED" && <div className="wo-block"><b>سلّم ومستني مراجعتك</b><Checklist role={role} canTick={false} /><ReviewForm roleId={role.id} reworkPct={reworkPct} /></div>}
    {st === "REWORK" && <div className="msg warn">اتبعت للتعديل لحد {fmtCairo(role.reworkDueAt)}: {role.reviewNote}</div>}
    {st === "DRAFT"
      ? <div className="wo-edit"><b style={{ color: "var(--navy)" }}>اكتب أمر الشغل وابعته</b><div style={{ marginTop: 10 }}><IssueForm roleId={role.id} defaultGrace={defaultGrace} init={init} /></div></div>
      : <details className="wo-edit"><summary>تعديل أمر الشغل</summary><div style={{ marginTop: 10 }}><IssueForm roleId={role.id} defaultGrace={defaultGrace} init={init} /></div></details>}
  </div>);
}
