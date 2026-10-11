import { requireUser, ROLE_LABEL } from "@/lib/auth";
import PwForm from "./form";
export default async function Account() {
  const u = await requireUser();
  return (<>
    <div className="head"><div><span className="tag">حسابي</span><h1>{u.name}</h1><p className="sub">{ROLE_LABEL[u.role]} · <span className="num">{u.username}</span></p></div></div>
    <div className="card"><h2>تغيير كلمة المرور</h2><PwForm /></div>
  </>);
}
