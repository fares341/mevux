import { requireUser } from "@/lib/auth";
import { eq, count, sum } from "drizzle-orm";
import { db, users, suppliers, fixedCosts, clients } from "@/lib/db";
import { and, asc, isNotNull, notInArray } from "drizzle-orm";
import Link from "next/link";
import { STAGES } from "@/lib/labels";
export default async function Home() {
  const u = await requireUser();
  const admin = u.role === "ADMIN";
  const [members, supplierCount, fixed] = admin ? await Promise.all([
    db.select({ n: count() }).from(users).where(eq(users.active, true)).then((r) => r[0].n),
    db.select({ n: count() }).from(suppliers).then((r) => r[0].n),
    db.select({ s: sum(fixedCosts.amountEgp) }).from(fixedCosts).where(eq(fixedCosts.active, true)).then((r) => Number(r[0].s ?? 0)),
  ]) : [0, 0, 0];
  return (<>
    <div className="head"><div><span className="tag">الرئيسية</span><h1>أهلاً {u.name}</h1><p className="sub">لوحة متابعة MEVIX.</p></div></div>
    {admin && <div className="grid">
      <div className="stat"><b>{members}</b><span>موظف نشط</span></div>
      <div className="stat"><b>{supplierCount}</b><span>خدمة مسجلة عند الموردين</span></div>
      <div className="stat"><b className="num">{fixed.toLocaleString("en-US")} ج</b><span>المصاريف الثابتة شهرياً</span></div>
    </div>}
    {admin && <SubscriptionAlerts />}
    {admin && <GettingStarted />}
    {admin && <FollowUps />}
  </>);
}

async function FollowUps() {
  const rows = await db.select().from(clients).where(and(isNotNull(clients.nextDate), notInArray(clients.stage, ["LOST", "DONE"]))).orderBy(asc(clients.nextDate)).limit(12);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return (<section className="card"><h2>متابعات العملاء الجاية</h2>
    {rows.length ? rows.map((c) => <div key={c.id} className="actions" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBlock: 8 }}>
      <span><Link href={`/clients/${c.id}`}><b>{c.name}</b></Link> · {c.nextStep || STAGES[c.stage]}</span>
      <span className={c.nextDate! < t ? "pill bad" : "pill info"}>{c.nextDate!.toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" })}</span></div>)
      : <p className="sub">مفيش متابعات متحددة. سجّل الخطوة الجاية وموعدها من صفحة العميل.</p>}
  </section>);
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

async function SubscriptionAlerts() {
  const { dueSubscriptions } = await import("@/lib/subscriptions");
  const due = await dueSubscriptions();
  if (!due.length) return null;
  const CUR: Record<string, string> = { EGP: "ج", SAR: "ريال", USD: "$" };
  return (<section className="card" style={{ borderTopColor: due.some((x) => x.overdue) ? "var(--bad)" : "var(--warn)" }}>
    <h2>مواعيد دفع الاشتراكات</h2>
    {due.map((x) => <div key={x.id} className="actions" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBlock: 8 }}>
      <span><Link href={`/projects/${x.id}`}><b>{x.name}</b></Link> · {x.client} · <span className="num">{x.fee.toLocaleString("en-US")}</span> {CUR[x.currency]}</span>
      <span className={"pill " + (x.overdue ? "bad" : "warn")}>{x.overdue ? `متأخر ${-x.days} يوم` : x.days === 0 ? "النهارده" : `بعد ${x.days} يوم`} · {x.due.toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}</span>
    </div>)}
    <p className="sub">لما الدفعة توصل سجّلها في المشروع، والميعاد بيتنقل للشهر الجاي لوحده.</p>
  </section>);
}
