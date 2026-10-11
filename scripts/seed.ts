import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { eq, count } from "drizzle-orm";
import { db, users, fixedCosts, suppliers } from "../src/lib/db";

const pw = () => randomBytes(9).toString("base64url");
async function main() {
  const adminUser = (process.env.ADMIN_USERNAME || "admin").toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass || adminPass.length < 10) throw new Error("Set ADMIN_PASSWORD (10+ chars) in .env");
  const out: [string, string][] = [];
  const exists = async (u: string) => !!(await db.query.users.findFirst({ where: eq(users.username, u) }));
  if (!(await exists(adminUser))) {
    await db.insert(users).values({ name: process.env.ADMIN_NAME || "المدير", username: adminUser, role: "ADMIN", passwordHash: await bcrypt.hash(adminPass, 12) });
    out.push([adminUser, "(كلمة المرور من ملف .env)"]);
  }
  const team = [["أميرة أشرف", "amira"], ["زياد شريف", "ziad"], ["محمد وائل", "mohamed"], ["يمنى النقيب", "yomna"], ["مريم السادات", "mariam"]];
  for (const [name, username] of team) {
    if (await exists(username)) continue;
    const p = pw();
    await db.insert(users).values({ name, username, passwordHash: await bcrypt.hash(p, 12) });
    out.push([username, p]);
  }
  if ((await db.select({ n: count() }).from(fixedCosts))[0].n === 0)
    await db.insert(fixedCosts).values([{ name: "السيرفرات", amountEgp: 700 }, { name: "OpenRouter للتست", amountEgp: 700 }, { name: "الاشتراكات", amountEgp: 700 }]);
  if ((await db.select({ n: count() }).from(suppliers).where(eq(suppliers.category, "WHATSAPP")))[0].n === 0)
    await db.insert(suppliers).values([
      { category: "WHATSAPP", provider: "مزود واتساب", item: "رسالة تسويقية", price: 0.2415, currency: "SAR", billing: "PER_MESSAGE" },
      { category: "WHATSAPP", provider: "مزود واتساب", item: "رسالة خدمات (Utility)", price: 0.0135, currency: "SAR", billing: "PER_MESSAGE" },
      { category: "WHATSAPP", provider: "مزود واتساب", item: "رسالة مصادقة", price: 0.0135, currency: "SAR", billing: "PER_MESSAGE" },
      { category: "WHATSAPP", provider: "مزود واتساب", item: "خدمة عملاء", price: 0.0135, currency: "SAR", billing: "PER_MESSAGE", details: "أول 1,000 رسالة شهرياً مجاناً" },
    ]);
  console.log("\n=== الحسابات الجديدة (احفظها الآن، لن تظهر مرة أخرى) ===");
  for (const [u, p] of out) console.log(`${u}\t${p}`);
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
