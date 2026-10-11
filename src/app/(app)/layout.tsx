import { requireUser, ROLE_LABEL } from "@/lib/auth";
import { logout } from "../login/actions";
import Nav from "./nav";
import { chatProjects } from "@/lib/chat";
export const dynamic = "force-dynamic";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const admin = u.role === "ADMIN";
  const unread = (await chatProjects(u)).reduce((a, p) => a + p.unread, 0);
  const groups = [
    { title: "العمل", items: [{ href: "/", label: "الرئيسية" }, { href: "/assistant", label: "المساعد" }, ...(admin ? [{ href: "/clients", label: "العملاء" }] : []), { href: "/projects", label: "المشاريع" }, ...(admin ? [{ href: "/briefs", label: "البريفات" }] : []), { href: "/chats", label: unread ? `محادثات المشاريع (${unread})` : "محادثات المشاريع" }, { href: "/tasks", label: "المهام" }, { href: "/follow", label: "المتابعة اليومية" }, { href: "/complaints", label: "الشكاوى" }] },
    ...(admin ? [{ title: "الإدارة", items: [
      { href: "/finance", label: "المالية" },
      { href: "/team", label: "الموظفون" },
      { href: "/suppliers", label: "الموردون والخدمات" },
      { href: "/settings", label: "الإعدادات" },
    ] }] : []),
    { title: "حسابي", items: [{ href: "/my", label: "فلوسي وخصوماتي" }, { href: "/account", label: "الحساب وكلمة المرور" }] },
  ];
  return (
    <div className="shell">
      <aside className="side">
        <div className="logo"><img src="/logo.png" alt="MEVIX" /></div>
        <Nav groups={groups} />
        <div className="me">
          <b>{u.name}</b>
          <small>{ROLE_LABEL[u.role]}</small>
          <form action={logout}><button className="sm">تسجيل الخروج</button></form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
