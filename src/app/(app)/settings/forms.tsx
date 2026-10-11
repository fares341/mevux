"use client";
import { useActionState } from "react";
import { saveFinance, addFixedCost, saveAi, testAi } from "./actions";
type R = { ok?: string; error?: string };
const Msg = ({ s }: { s: R }) => s?.error ? <div className="msg bad" role="alert">{s.error}</div> : s?.ok ? <div className="msg ok">{s.ok}</div> : null;

function P({ name, label, hint, v }: { name: string; label: string; hint?: string; v: string }) {
  return <label>{label}{hint && <small>{hint}</small>}<input id={name} name={name} type="number" step="0.01" min="0" max="100" dir="ltr" defaultValue={v} required /></label>;
}

export function FinanceForm({ s }: { s: Record<string, string> }) {
  const [st, a, p] = useActionState(saveFinance, {});
  return (<form action={a}><Msg s={st} />
    <h2>توزيع المشروع</h2>
    <div className="row">
      <P name="teamCapPct" label="سقف أجور الفريق %" hint="من صافي المشروع" v={s.teamCapPct} />
      <P name="fundPct" label="صندوق الاشتراكات %" hint="من سعر كل مشروع" v={s.fundPct} />
      <P name="ownerPct" label="نصيبك من الصافي %" hint="والباقي لخزنة الشركة" v={s.ownerPct} />
    </div>
    <h2>قواعد الخصم</h2>
    <div className="row">
      <P name="latePctPerDay" label="التأخير % لكل يوم" v={s.latePctPerDay} />
      <P name="lateMaxPct" label="أقصى خصم للتأخير %" v={s.lateMaxPct} />
      <P name="reworkPct" label="رجوع شغل فيه أخطاء %" hint="لكل مرة" v={s.reworkPct} />
      <P name="noReplyPct" label="عدم الرد على البوت %" hint="بعد التحذير" v={s.noReplyPct} />
      <P name="clientLossPct" label="خسارة عميل %" hint="+ حرمان من المشروع التالي" v={s.clientLossPct} />
      <P name="clientRefusePct" label="رفض العميل الإعادة %" hint="+ حرمان من المشروع التالي" v={s.clientRefusePct} />
    </div>
    <h2>أسعار الصرف إلى الجنيه</h2>
    <div className="row">
      <label>الريال السعودي<input id="rateSAR" name="rateSAR" type="number" step="0.0001" dir="ltr" defaultValue={s.rateSAR} required /></label>
      <label>الدولار الأمريكي<input id="rateUSD" name="rateUSD" type="number" step="0.0001" dir="ltr" defaultValue={s.rateUSD} required /></label>
    </div>
    <button disabled={p}>حفظ الإعدادات المالية</button>
  </form>);
}

export function FixedCostForm() {
  const [st, a, p] = useActionState(addFixedCost, {});
  return (<form action={a}><Msg s={st} />
    <div className="row"><label>البند<input id="fc-name" name="name" required placeholder="مثلاً: السيرفرات" /></label><label>المبلغ الشهري (جنيه)<input id="fc-amount" name="amount" type="number" min="0" step="0.01" dir="ltr" required /></label></div>
    <button className="sm" disabled={p}>إضافة بند</button>
  </form>);
}

export function AiForm({ s, hint }: { s: Record<string, string>; hint: string | null }) {
  const [st, a, p] = useActionState(saveAi, {});
  const [tt, ta, tp] = useActionState(testAi, {});
  return (<>
    <form action={a}><Msg s={st} />
      <div className="row">
        <label>مفتاح OpenRouter<small>{hint ? `المفتاح الحالي ينتهي بـ ••••${hint} · اتركه فارغاً لعدم التغيير` : "لم يتم إدخال مفتاح بعد"}</small><input id="apiKey" name="apiKey" type="password" dir="ltr" autoComplete="off" placeholder="sk-or-…" /></label>
      </div>
      <div className="row">
        <label>موديل البريف<small>جودة الكتابة أهم هنا</small><input id="aiModel" name="aiModel" dir="ltr" defaultValue={s.aiModel} required /></label>
        <label>موديل المساعد والبحث<small>رخيص وسريع · مثلاً google/gemini-3.5-flash-lite أرخص</small><input id="aiChatModel" name="aiChatModel" dir="ltr" defaultValue={s.aiChatModel} required /></label>
        <label>موديل تحويل الفويس لنص<small>لازم يدعم الصوت</small><input id="aiAudioModel" name="aiAudioModel" dir="ltr" defaultValue={s.aiAudioModel} required /></label>
      </div>
      <button disabled={p}>حفظ</button>
    </form>
    <form action={ta} style={{ marginTop: 12 }}><Msg s={tt} /><button className="ghost" disabled={tp}>{tp ? "جارٍ الاختبار…" : "اختبار الاتصال والرصيد"}</button></form>
  </>);
}
