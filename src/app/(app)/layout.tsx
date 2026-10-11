import Link from "next/link";
import { requireUser, ROLE_LABEL } from "@/lib/auth";
import { logout } from "../login/actions";
import Nav from "./nav";
import { chatProjects } from "@/lib/chat";
import { Icon } from "@/components/ui";
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const admin = u.role === "ADMIN";
  const unread = (await chatProjects(u)).reduce((a, p) => a + p.unread, 0);
  const dueSubs = admin ? (await (await import("@/lib/subscriptions")).dueSubscriptions()).length : 0;
  // Grouped by what people do: daily work, the team, money/admin, own account.
  const groups = [
    { title: "", items: [
      { href: "/", label: "النهارده", icon: "home" },
      { href: "/assistant", label: "المساعد", icon: "spark" },
    ] },
    { title: admin ? "العملاء والمشاريع" : "الشغل", items: [
      ...(admin ? [{ href: "/clients", label: "العملاء", icon: "users" }] : []),
      { href: "/projects", label: "المشاريع", icon: "folder" },
      ...(admin ? [{ href: "/briefs", label: "البريفات", icon: "doc" }] : []),
      { href: "/chats", label: "محادثات المشاريع", icon: "chat", badge: unread || undefined },
    ] },
    { title: "الفريق", items: [
      { href: "/tasks", label: "المهام", icon: "check" },
      { href: "/follow", label: "المتابعة اليومية", icon: "pulse" },
      { href: "/complaints", label: "الشكاوى", icon: "flag" },
    ] },
    ...(admin ? [{ title: "الإدارة", items: [
      { href: "/ideas", label: "أفكار للشركة", icon: "bulb" },
      { href: "/finance", label: "المالية", icon: "wallet", badge: dueSubs || undefined, warn: true },
      { href: "/team", label: "الموظفون", icon: "team" },
      { href: "/suppliers", label: "الموردون", icon: "box" },
      { href: "/settings", label: "الإعدادات", icon: "gear" },
    ] }] : []),
    { title: "حسابي", items: [
      { href: "/my", label: "فلوسي وخصوماتي", icon: "coins" },
      { href: "/account", label: "كلمة المرور", icon: "key" },
    ] },
  ];
  return (
    <div className="shell">
      <input type="checkbox" id="navtoggle" hidden />
      <header className="topbar"><img src="/logo-dark.png" alt="MEVIX" /><label htmlFor="navtoggle" aria-label="القائمة"><Icon name="menu" size={22} /></label></header>
      <label htmlFor="navtoggle" className="scrim" aria-hidden="true" />
      <aside className="side">
        <div className="logo"><img src="/logo-dark.png" alt="MEVIX" /></div>
        <Nav groups={groups} />
        <div className="me">
          <span className="av"><Icon name="user" size={17} /></span>
          <span className="who"><b>{u.name}</b><small>{ROLE_LABEL[u.role]}</small></span>
          <form action={logout}><button className="sm"><Icon name="out" size={15} />تسجيل الخروج</button></form>
        </div>
      </aside>
      <main className="main">{children}</main>
      <Link href="/assistant" className="fab" aria-label="اسأل المساعد"><Icon name="spark" />اسأل المساعد</Link>
    </div>
  );
}
