import { desc, asc } from "drizzle-orm";
import { db, users as U } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { setActive, deleteMember } from "./actions";
import { NewMember, ResetPw } from "./forms";

export default async function TeamPage() {
  const me = await requireAdmin();
  const users = await db.select().from(U).orderBy(desc(U.active), asc(U.createdAt));
  const fmt = (d: Date | null) => d ? d.toLocaleDateString("ar-EG") : "—";
  return (<>
    <div className="head"><div><span className="tag">الإدارة</span><h1>الموظفون</h1><p className="sub">إنشاء حسابات الفريق، تغيير كلمات المرور، وإيقاف أو حذف الحسابات.</p></div></div>
    <div className="card"><h2>إضافة موظف</h2><NewMember /></div>
    <div className="note"><b>إيقاف الحساب</b> يمنع الدخول فوراً ويحتفظ بتاريخ الموظف وحساباته، ويمكن إعادة تفعيله. <b>الحذف النهائي</b> للحسابات المضافة بالخطأ فقط، ولا يمكن التراجع عنه.</div>
    <div className="card plain table-wrap">
      <table>
        <thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>التخصص</th><th>الصلاحية</th><th>الحالة</th><th>آخر دخول</th><th>إجراءات</th></tr></thead>
        <tbody>{users.map((u) => (
          <tr key={u.id}>
            <td><b>{u.name}</b></td>
            <td className="num">{u.username}</td>
            <td>{u.jobTitle || "—"}</td>
            <td>{u.role === "ADMIN" ? <span className="pill info">مدير</span> : u.role === "TEAM_LEAD" ? <span className="pill warn">تيم ليد</span> : "عضو فريق"}</td>
            <td>{u.active ? <span className="pill ok">نشط</span> : <span className="pill bad">موقوف</span>}</td>
            <td>{fmt(u.lastLoginAt)}</td>
            <td>{u.id === me.id ? <span className="sub">حسابك</span> : (
              <details><summary>إدارة</summary>
                <ResetPw id={u.id} />
                <div className="actions" style={{ marginTop: 10 }}>
                  <form action={setActive}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="active" value={u.active ? "0" : "1"} /><button className={u.active ? "sm ghost" : "sm"}>{u.active ? "إيقاف الحساب" : "إعادة التفعيل"}</button></form>
                </div>
                <form action={deleteMember} className="actions" style={{ marginTop: 10 }}>
                  <input type="hidden" name="id" value={u.id} />
                  <input id={"del-" + u.id} name="confirm" placeholder='اكتب "حذف" للتأكيد' style={{ maxWidth: 170 }} />
                  <button className="sm danger">حذف نهائي</button>
                </form>
              </details>)}
            </td>
          </tr>))}
        </tbody>
      </table>
    </div>
  </>);
}
