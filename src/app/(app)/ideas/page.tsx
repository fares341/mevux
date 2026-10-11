import { desc } from "drizzle-orm";
import { db, ideas } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { PageHead, Tabs, Empty } from "@/components/ui";
import { IDEA_AREA, IDEA_STATUS, IDEA_PRIORITY } from "@/lib/labels";
import { updateIdea, deleteIdea } from "./actions";
import IdeaForm from "./form";
export const dynamic = "force-dynamic";

const OPEN = ["NEW", "PLANNED", "DOING"];
const PR_ORDER: Record<string, number> = { HIGH: 0, MID: 1, LOW: 2 };
const fmt = (d: Date) => d.toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" });

export default async function Ideas({ searchParams }: { searchParams: Promise<{ tab?: string; area?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = ["open", "done", "dropped"].includes(sp.tab || "") ? sp.tab! : "open";
  const all = await db.select().from(ideas).orderBy(desc(ideas.createdAt));
  const inTab = (i: typeof all[number]) => tab === "open" ? OPEN.includes(i.status) : tab === "done" ? i.status === "DONE" : i.status === "DROPPED";
  const area = sp.area && sp.area in IDEA_AREA ? sp.area : "";
  const rows = all.filter(inTab).filter((i) => !area || i.area === area)
    .sort((a, b) => (PR_ORDER[a.priority] - PR_ORDER[b.priority]) || (+b.createdAt - +a.createdAt));
  const base = area ? `/ideas?area=${area}` : "/ideas";
  return (<>
    <PageHead title="أفكار للشركة" help="اكتب أي فكرة تيجي في بالك، للسيستم أو للشركة، وارجعلها وقت ما تحب. ظاهرة ليك بس. وتقدر تقول للمساعد: «سجّل فكرة …»." />
    <section className="card"><h2>فكرة جديدة</h2><IdeaForm /></section>
    <Tabs base={base} current={tab} tabs={[
      { key: "open", label: "مفتوحة", count: all.filter((i) => OPEN.includes(i.status)).length },
      { key: "done", label: "اتنفذت", count: all.filter((i) => i.status === "DONE").length },
      { key: "dropped", label: "اتلغت", count: all.filter((i) => i.status === "DROPPED").length },
    ]} />
    <nav className="chips" aria-label="تصفية حسب النوع">
      <a href={`/ideas?tab=${tab}`} className={"chip" + (!area ? " on" : "")}>الكل</a>
      {Object.entries(IDEA_AREA).map(([k, l]) => <a key={k} href={`/ideas?tab=${tab}&area=${k}`} className={"chip" + (area === k ? " on" : "")}>{l}</a>)}
    </nav>
    {!rows.length ? <Empty title={tab === "open" ? "مفيش أفكار مفتوحة" : "مفيش حاجة هنا لسه"} text={tab === "open" ? "اكتب أول فكرة من الفورم اللي فوق." : undefined} /> :
      <div className="ideas">{rows.map((i) => (
        <article key={i.id} className={"idea pr-" + i.priority.toLowerCase()}>
          <header>
            <b>{i.title}</b>
            <span className={"pill " + (i.priority === "HIGH" ? "bad" : i.priority === "LOW" ? "" : "info")}>{IDEA_PRIORITY[i.priority as keyof typeof IDEA_PRIORITY]}</span>
          </header>
          {i.details && <p>{i.details}</p>}
          <footer>
            <small>{IDEA_AREA[i.area as keyof typeof IDEA_AREA]} · {fmt(i.createdAt)}</small>
            <form action={updateIdea} className="idea-st">
              <input type="hidden" name="id" value={i.id} />
              {Object.entries(IDEA_STATUS).map(([k, l]) => <button key={k} name="status" value={k} className={"sm" + (i.status === k ? " on" : " ghost")} aria-pressed={i.status === k}>{l}</button>)}
            </form>
            <details><summary>تعديل</summary>
              <form action={updateIdea} style={{ marginTop: 10, minWidth: 280 }}>
                <input type="hidden" name="id" value={i.id} />
                <label>الفكرة<input name="title" defaultValue={i.title} /></label>
                <label style={{ marginTop: 8 }}>تفاصيل<textarea name="details" rows={3} defaultValue={i.details || ""} /></label>
                <div className="row" style={{ marginTop: 8 }}>
                  <label>تخص<select name="area" defaultValue={i.area}>{Object.entries(IDEA_AREA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                  <label>الأهمية<select name="priority" defaultValue={i.priority}>{Object.entries(IDEA_PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                </div>
                <button className="sm" style={{ marginTop: 8 }}>حفظ</button>
              </form>
              <form action={deleteIdea} style={{ marginTop: 8 }}><input type="hidden" name="id" value={i.id} /><button className="sm danger">حذف</button></form>
            </details>
          </footer>
        </article>))}</div>}
  </>);
}
