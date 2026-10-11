import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, assistantMessages } from "@/lib/db";
import Chat from "./chat";

export default async function Assistant() {
  const u = await requireUser();
  const history = await db.select({ role: assistantMessages.role, content: assistantMessages.content }).from(assistantMessages).where(eq(assistantMessages.userId, u.id)).orderBy(asc(assistantMessages.createdAt)).limit(200);
  const hints = u.role === "ADMIN"
    ? ["أبدأ منين؟ السيستم بيشتغل إزاي؟", "ضيف عميل اسمه شركة النور، استوديو تصوير في الرياض، محتاج وكيل واتساب للحجوزات", "اعمل مشروع وكيل حجوزات لشركة النور بـ 6000 ريال، 4 أسابيع", "ضيف دور أوتوميشن لأميرة بـ 5000 جنيه في مشروع وكيل حجوزات", "مين متأخر النهارده؟", "ملخص المالية"]
    : ["أنا ورايا إيه؟", "خلصت ربط الدرايف في مشروع وليد", "المشاريع واصلة لفين؟", "فلوسي"];
  return (<>
    <div className="head"><div><span className="tag">العمل</span><h1>المساعد</h1><p className="sub">{u.role === "ADMIN" ? "قوله يعمل أي حاجة جوه السيستم بالكتابة أو بالفويس: يضيف عميل أو مشروع أو أدوار أو دفعات، يغيّر مرحلة، يعمل بريف، أو اسأله عن أي حاجة." : "اكتب أو سجّل فويس: سجّل اللي وصلتله، ارفع ملفات، اسأل عن المشاريع، أو قدّم شكوى."}</p></div></div>
    <Chat initial={history as { role: "user" | "assistant"; content: string }[]} hints={hints} />
  </>);
}
