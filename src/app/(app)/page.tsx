import Link from "next/link";
import { lateDaysFor, cutoff } from "@/lib/finance";
import { fmtCairo } from "@/lib/tz";
import { todosDueToday } from "@/lib/todos";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, notInArray } from "drizzle-orm";
import { requireUser, type SessionUser } from "@/lib/auth";
import { db, users, suppliers, clients, complaints, deductions, tasks, projectRoles, roleMembers, projects } from "@/lib/db";
import { stageLabel } from "@/lib/labels";
import { Icon, PageHead } from "@/components/ui";
import { egp } from "@/lib/finance";
import { chatProjects } from "@/lib/chat";
import { UpdateForm } from "./work-forms";

const day = (d: Date) => d.toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" });
const startToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
type Item = { level: "bad" | "warn" | "info"; title: React.ReactNode; sub?: string; href: string; cta: string };

export default async function Home() {
  const u = await requireUser();
  const greet = new Date().getHours() < 12 ? "صباح الخير" : "مساء الخير";
  const first = u.name.split(" ")[0];
  return u.role === "ADMIN" ? <AdminToday u={u} greet={`${greet} يا ${first}`} /> : <TeamToday u={u} greet={`${greet} يا ${first}`} />;
}

function Attention({ items, emptyText }: { items: Item[]; emptyText: string }) {
  return (<section className="card"><h2>محتاج انتباهك</h2>
    {items.length ? <ul className="attn">{items.map((x, i) => <li key={i}><span className={"k " + x.level} /><span className="t"><b>{x.title}</b>{x.sub && <small>{x.sub}</small>}</span><Link className="btn secondary sm" href={x.href}>{x.cta}</Link></li>)}</ul>
      : <p className="sub">{emptyText}</p>}
  </section>);
}

async function AdminToday({ u, greet }: { u: SessionUser; greet: string }) {
  const { dueSubscriptions } = await import("@/lib/subscriptions");
  const { followUp } = await import("@/lib/work");
  const { cashflow } = await import("@/lib/cashflow");
  const today = startToday(), in2 = new Date(+today + 2 * 864e5);
  const [subs, f, cf, follow, openC, pendD, chats] = await Promise.all([
    dueSubscriptions(), followUp(u), cashflow(1),
    db.select().from(clients).where(and(isNotNull(clients.nextDate), lte(clients.nextDate, in2), notInArray(clients.stage, ["LOST", "DONE"]))).orderBy(asc(clients.nextDate)),
    db.select({ id: complaints.id }).from(complaints).where(inArray(complaints.status, ["OPEN", "ANSWERED"])),
    db.select({ id: deductions.id }).from(deductions).where(eq(deductions.status, "PENDING")),
    chatProjects(u),
  ]);
  // Work orders that need the owner: not received in 24h, extension requests, hand-ins to review.
  const wo = await db.select({ r: projectRoles, project: projects.name, projectId: projects.id }).from(projectRoles).innerJoin(projects, eq(projectRoles.projectId, projects.id))
    .where(and(isNotNull(projectRoles.issuedAt), inArray(projects.status, ["APPROVED", "IN_PROGRESS", "DELIVERED"])));
  const dayAgo = new Date(Date.now() - 864e5);
  const woItems: Item[] = [
    ...wo.filter((x) => x.r.reviewStatus === "PENDING").map((x) => ({ level: "warn", title: <>سلّم «{x.r.title}» ومستني مراجعتك</>, sub: x.project, href: `/projects/${x.projectId}?tab=team`, cta: "راجع" }) as Item),
    ...wo.filter((x) => x.r.extStatus === "PENDING").map((x) => ({ level: "warn", title: <>طلب تمديد على «{x.r.title}»</>, sub: `${x.project} · ${x.r.extReason ?? ""}`, href: `/projects/${x.projectId}?tab=team`, cta: "رد" }) as Item),
    ...wo.filter((x) => !x.r.acceptedAt && x.r.issuedAt! < dayAgo).map((x) => ({ level: "bad", title: <>«{x.r.title}» ما اتستلمش من أكتر من يوم</>, sub: x.project, href: `/projects/${x.projectId}?tab=team`, cta: "افتح" }) as Item),
  ];
  const myDue = await todosDueToday(u);
  const items: Item[] = [
    ...myDue.map((t) => ({ level: t.dueAt! < new Date() ? "bad" : "warn", title: <>📝 {t.title}</>, sub: `من قايمتك · ${fmtCairo(t.dueAt)}`, href: "/tasks?view=me", cta: "قايمتي" }) as Item),
    ...woItems,
    ...subs.map((x) => ({ level: x.overdue ? "bad" : "warn", title: <>اشتراك {x.name} · <span className="num">{x.fee.toLocaleString("en-US")}</span> {x.currency === "EGP" ? "ج" : x.currency === "SAR" ? "ريال" : "$"}</>, sub: `${x.client} · ${x.overdue ? `متأخر ${-x.days} يوم` : x.days === 0 ? "مستحق النهارده" : `مستحق بعد ${x.days} يوم`}`, href: `/projects/${x.id}?tab=money`, cta: "سجّل الدفعة" }) as Item),
    ...follow.map((c) => ({ level: c.nextDate! < today ? "bad" : "info", title: <>متابعة {c.name}: {c.nextStep || stageLabel(c)}</>, sub: `${day(c.nextDate!)} · ${stageLabel(c)}`, href: `/clients/${c.id}`, cta: "افتح العميل" }) as Item),
    ...f.lateRoles.map((x) => ({ level: "bad", title: <>{x.person} متأخر في {x.role}</>, sub: `${x.project} · ${x.days} يوم · ${x.progress}%`, href: "/follow", cta: "المتابعة" }) as Item),
    ...(f.overdueTasks.length ? [{ level: "warn", title: <>{f.overdueTasks.length} مهمة فات موعدها</>, href: "/tasks?view=all", cta: "المهام" } as Item] : []),
    ...(openC.length ? [{ level: "warn", title: <>{openC.length} شكوى مستنية قرارك</>, href: "/complaints", cta: "الشكاوى" } as Item] : []),
    ...(pendD.length ? [{ level: "warn", title: <>{pendD.length} خصم قيد المراجعة</>, href: "/projects", cta: "المشاريع" } as Item] : []),
    ...(f.silent.length ? [{ level: "info", title: <>ماكتبوش تحديث النهارده: {f.silent.join("، ")}</>, href: "/follow", cta: "المتابعة" } as Item] : []),
    ...chats.filter((c) => c.unread).slice(0, 3).map((c) => ({ level: "info", title: <>{c.unread} رسالة جديدة في {c.name}</>, sub: c.last ? `${c.last.name}: ${c.last.text || c.last.fileName}` : undefined, href: `/chats/${c.id}`, cta: "افتح الشات" }) as Item),
  ];
  const m = cf.months[cf.months.length - 1];
  return (<>
    <PageHead title={greet} help="ده اللي محتاج تعمله النهارده، وتحت أرقام الشهر. أي حاجة تقدر تقولها للمساعد وهو ينفّذ." />
    <div className="quick">
      <Link href="/clients?new=1"><Icon name="users" />عميل جديد</Link>
      <Link href="/projects?tab=new"><Icon name="folder" />مشروع جديد</Link>
      <Link href="/briefs"><Icon name="doc" />اعمل بريف</Link>
      <Link href="/finance?tab=expenses"><Icon name="wallet" />سجّل مصروف</Link>
      <Link href="/assistant"><Icon name="spark" />قول للمساعد</Link>
    </div>
    <div className="cols">
      <div><Attention items={items} emptyText="مفيش حاجة متأخرة أو مستنياك. يوم هادي 👌" /><GettingStarted /></div>
      <div>
        <section className="card"><h2>الشهر ده</h2>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
            <div className="stat"><b className="num">{egp(m.income)}</b><span>دخل</span></div>
            <div className="stat"><b className="num">{egp(m.out)}</b><span>مصروف</span></div>
            <div className="stat" style={{ borderBottomColor: m.net < 0 ? "var(--bad)" : "var(--ok)" }}><b className="num">{egp(m.net)}</b><span>صافي</span></div>
            <div className="stat"><b className="num">{egp(cf.mrr)}</b><span>اشتراكات شهرية</span></div>
          </div>
          <p className="sub" style={{ marginBottom: 0 }}><Link href="/finance">التفاصيل في المالية</Link></p>
        </section>
      </div>
    </div>
  </>);
}

async function TeamToday({ u, greet }: { u: SessionUser; greet: string }) {
  const { listTasks, visibleProjects, myProjectIds } = await import("@/lib/work");
  const { feed } = await import("@/lib/work");
  const [roles, myTasks, vis, mine, chats, today] = await Promise.all([
    db.select({ id: projectRoles.id, title: projectRoles.title, progress: projectRoles.progress, dueDate: projectRoles.dueDate, deliveredAt: projectRoles.deliveredAt, projectId: projects.id, project: projects.name,
      deadlineAt: projectRoles.deadlineAt, graceHours: projectRoles.graceHours, issuedAt: projectRoles.issuedAt, acceptedAt: projectRoles.acceptedAt, reviewStatus: projectRoles.reviewStatus, reworkDueAt: projectRoles.reworkDueAt, extStatus: projectRoles.extStatus })
      .from(roleMembers).innerJoin(projectRoles, eq(roleMembers.roleId, projectRoles.id)).innerJoin(projects, eq(projectRoles.projectId, projects.id))
      .where(and(eq(roleMembers.userId, u.id), inArray(projects.status, ["APPROVED", "IN_PROGRESS", "DELIVERED"]))),
    listTasks(u, { mine: true, open: true }), visibleProjects(u), myProjectIds(u.id), chatProjects(u),
    feed(u, { userId: u.id, since: startToday(), limit: 1 }),
  ]);
  const now = new Date();
  const myDue = await todosDueToday(u);
  const items: Item[] = [
    ...myDue.map((t) => ({ level: t.dueAt! < now ? "bad" : "warn", title: <>📝 {t.title}</>, sub: `من قايمتك · ${fmtCairo(t.dueAt)}`, href: "/tasks?view=me", cta: "قايمتي" }) as Item),
    ...roles.filter((r) => r.issuedAt && !r.acceptedAt).map((r) => ({ level: "bad", title: <>📋 أمر شغل جديد: {r.title}</>, sub: `${r.project} · اقرا التفاصيل ودوس «استلمت وفهمت»`, href: `/projects/${r.projectId}`, cta: "افتح" }) as Item),
    ...roles.filter((r) => r.reviewStatus === "REWORK").map((r) => ({ level: "bad", title: <>🔁 {r.title} محتاج تعديل</>, sub: `${r.project} · لحد ${fmtCairo(r.reworkDueAt)}`, href: `/projects/${r.projectId}`, cta: "افتح" }) as Item),
    ...roles.filter((r) => !r.deliveredAt && lateDaysFor(r) > 0).map((r) => ({ level: "bad", title: <>{r.title} في {r.project} متأخر {lateDaysFor(r)} يوم</>, sub: `الخصم بيزيد كل يوم. سلّم أو كلّم المدير.`, href: `/projects/${r.projectId}`, cta: "افتح" }) as Item),
    ...roles.filter((r) => { const c = cutoff(r); return !r.deliveredAt && c && c > now && +c - +now < 2 * 864e5; }).map((r) => ({ level: "warn", title: <>⏰ {r.title} معاد تسليمه قرّب</>, sub: `${r.project} · ${fmtCairo(r.deadlineAt ?? r.dueDate)}`, href: `/projects/${r.projectId}`, cta: "افتح" }) as Item),
    ...myTasks.filter((t) => t.dueDate && t.dueDate < now).map((t) => ({ level: "warn", title: <>مهمة متأخرة: {t.title}</>, sub: t.project, href: "/tasks", cta: "المهام" }) as Item),
    ...chats.filter((c) => c.unread).map((c) => ({ level: "info", title: <>{c.unread} رسالة جديدة في {c.name}</>, href: `/chats/${c.id}`, cta: "افتح الشات" }) as Item),
  ];
  const myProjects = vis.filter((p) => mine.includes(p.id));
  return (<>
    <PageHead title={greet} help="أدوارك ومهامك النهارده. اكتب وصلت لإيه آخر اليوم، أو قوله للمساعد بالفويس." />
    <div className="cols">
      <div>
        <Attention items={items} emptyText="مفيش حاجة متأخرة. كمّل 💪" />
        <section className="card"><h2>أدواري</h2>
          {roles.length ? <ul className="attn">{roles.map((r) => <li key={r.id}><span className={"k " + (r.deliveredAt ? "info" : r.dueDate && r.dueDate < now ? "bad" : "warn")} />
            <span className="t"><b>{r.title} · {r.project}</b><small>{r.deliveredAt ? "اتسلّم" : r.dueDate ? `الموعد ${day(r.dueDate)}` : "مفيش موعد"} · {r.progress}%</small></span>
            <Link className="btn secondary sm" href={`/projects/${r.projectId}`}>افتح</Link></li>)}</ul> : <p className="sub">مفيش أدوار شغالة دلوقتي.</p>}
        </section>
        <section className="card"><h2>مهامي المفتوحة</h2>
          {myTasks.length ? <ul className="attn">{myTasks.map((t) => <li key={t.id}><span className="k info" /><span className="t"><b>{t.title}</b><small>{t.project}{t.dueDate ? ` · ${day(t.dueDate)}` : ""}</small></span><Link className="btn secondary sm" href="/tasks">حدّث</Link></li>)}</ul> : <p className="sub">مفيش مهام مفتوحة.</p>}
        </section>
      </div>
      <div>
        <section className="card"><h2>{today.length ? "سجّلت تحديث النهارده ✓" : "وصلت لإيه النهارده؟"}</h2><UpdateForm projects={myProjects.map((p) => ({ id: p.id, name: p.name }))} /></section>
      </div>
    </div>
  </>);
}

async function GettingStarted() {
  const { count: c } = await import("drizzle-orm");
  const { settings, projects, projectRoles, projectBriefs, assistantMessages } = await import("@/lib/db");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = async (t: any) => (await db.select({ n: c() }).from(t))[0].n as number;
  const key = (await db.select().from(settings)).some((x) => x.key === "openrouterKey");
  const [u, sp, cl, pr, ro, br, am] = await Promise.all([n(users), n(suppliers), n(clients), n(projects), n(projectRoles), n(projectBriefs), n(assistantMessages)]);
  const steps = [
    { done: key, title: "حط مفتاح OpenRouter", why: "عشان المساعد والفويس والبريف يشتغلوا.", href: "/settings", cta: "الإعدادات" },
    { done: u > 1, title: "راجع حسابات الفريق", why: "اتأكد من الأسماء وابعت لكل واحد اليوزر والباسورد بتاعه.", href: "/team", cta: "الموظفون" },
    { done: sp > 4, title: "سجّل أسعار الموردين", why: "السيرفرات والـ API ومزود واتساب. بتظهر في البريف وتكاليف المشاريع.", href: "/suppliers", cta: "الموردون" },
    { done: cl > 0, title: "ضيف أول عميل", why: "وحدّد هو في أنهي مرحلة: ميتنج، بريف، تفاوض…", href: "/clients?new=1", cta: "عميل جديد" },
    { done: pr > 0, title: "اعمل مشروع للعميل", why: "السعر، العملة، نوع التعاقد (تنفيذ أو اشتراك شهري)، والمدة.", href: "/projects?tab=new", cta: "مشروع جديد" },
    { done: ro > 0, title: "وزّع الأدوار والأجور", why: "من صفحة المشروع: مين ماسك إيه وبكام. السيستم بينبّهك لو الأجور عدّت السقف.", href: "/projects", cta: "المشاريع" },
    { done: br > 0, title: "اعمل أول بريف", why: "اكتب أو قول بالفويس اللي اتقال في الميتنج، والبريف يطلع PDF.", href: "/briefs", cta: "البريفات" },
    { done: am > 0, title: "جرّب المساعد", why: "قوله \"ضيف عميل…\" أو \"اعمل مشروع…\" وهو ينفّذ.", href: "/assistant", cta: "المساعد" },
  ];
  const left = steps.filter((x) => !x.done).length;
  if (!left) return null;
  return (<section className="card" style={{ borderTopColor: "var(--pink)" }}>
    <div className="actions" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>ابدأ من هنا</h2><span className="pill info">فاضل {left} من {steps.length}</span></div>
    <p className="sub">خطوات سريعة عشان السيستم يبقى جاهز. وتقدر تعمل أغلبها بالكلام مع <Link href="/assistant">المساعد</Link>.</p>
    <ol className="steps">{steps.map((x, i) => <li key={i} className={x.done ? "ok" : ""}>
      <span className="dot">{x.done ? "✓" : i + 1}</span>
      <div><b>{x.title}</b><span className="sub" style={{ display: "block", margin: 0 }}>{x.why}</span></div>
      {!x.done && <Link className="btn ghost-link" href={x.href}>{x.cta}</Link>}
    </li>)}</ol>
  </section>);
}

