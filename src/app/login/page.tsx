import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import LoginForm from "./form";

export default async function LoginPage() {
  if (await getUser()) redirect("/");
  return (
    <div className="lg">
      <section className="lg-brand" aria-hidden="true">
        <svg className="lg-rings" viewBox="0 0 600 600"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#20C6EA" /><stop offset=".55" stopColor="#6A4DF5" /><stop offset="1" stopColor="#E6197F" /></linearGradient></defs>
          <circle cx="300" cy="300" r="250" fill="none" stroke="url(#lg)" strokeWidth="2" opacity=".55" /><circle cx="300" cy="300" r="185" fill="none" stroke="url(#lg)" strokeWidth="1.3" opacity=".35" /><circle cx="300" cy="300" r="120" fill="none" stroke="url(#lg)" strokeWidth="1" opacity=".22" /><circle cx="300" cy="50" r="7" fill="#20C6EA" /><circle cx="515" cy="425" r="5" fill="#E6197F" /></svg>
        <img src="/logo-dark.png" alt="" className="lg-logo" />
        <div className="lg-copy">
          <h2>مكان واحد للشغل كله</h2>
          <ul>
            <li>العملاء ومراحل الاتفاق</li>
            <li>المشاريع، الأدوار، والمتابعة اليومية</li>
            <li>البريفات والمالية والمساعد</li>
          </ul>
        </div>
      </section>
      <section className="lg-form">
        <div className="lg-box">
          <img src="/logo.png" alt="MEVIX" className="lg-mobile-logo" />
          <h1>أهلاً بيك</h1>
          <p className="sub">ادخل باليوزر والباسورد اللي استلمتهم من الإدارة.</p>
          <LoginForm />
          <p className="lg-foot">نسيت الباسورد؟ كلّم المدير يغيّرهولك من صفحة الموظفين.</p>
        </div>
      </section>
    </div>
  );
}
