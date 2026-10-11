import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import LoginForm from "./form";
export default async function LoginPage() {
  if (await getUser()) redirect("/");
  return (
    <div className="login"><div className="box">
      <img src="/logo.png" alt="MEVIX" />
      <h1>تسجيل الدخول</h1>
      <p className="sub" style={{ marginBottom: 18 }}>نظام إدارة المشاريع والفريق</p>
      <LoginForm />
    </div></div>
  );
}
