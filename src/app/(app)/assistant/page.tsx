import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, assistantMessages } from "@/lib/db";
import Chat from "./chat";

export default async function Assistant() {
  const u = await requireUser();
  const history = await db.select({ role: assistantMessages.role, content: assistantMessages.content }).from(assistantMessages).where(eq(assistantMessages.userId, u.id)).orderBy(asc(assistantMessages.createdAt)).limit(200);
  const hints = u.role === "ADMIN"
    ? ["مين متأخر النهارده؟", "زياد شغال على إيه؟", "إيه الشكاوى المفتوحة؟", "ملخص المالية"]
    : ["أنا ورايا إيه؟", "خلصت ربط الدرايف في مشروع وليد", "المشاريع واصلة لفين؟", "فلوسي"];
  return (<>
    <div className="head"><div><span className="tag">العمل</span><h1>المساعد</h1><p className="sub">اكتب أو سجّل فويس: سجّل اللي وصلتله، ارفع ملفات، اسأل عن المشاريع، أو قدّم شكوى.</p></div></div>
    <Chat initial={history as { role: "user" | "assistant"; content: string }[]} hints={hints} />
  </>);
}
