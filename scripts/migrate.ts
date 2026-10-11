/**
 * Safe database migration for production.
 * 1. Refuses to run any not-yet-applied migration that can delete data (DROP TABLE/COLUMN/TYPE, TRUNCATE, DELETE, type changes)
 *    unless ALLOW_DESTRUCTIVE=1 is set on purpose.
 * 2. Databases created before migrations existed (with `push`) are first brought up to date additively, then marked as baselined.
 * 3. Applies pending migrations inside a transaction (drizzle migrator).
 */
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { execSync } from "child_process";
import path from "path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const DIR = path.join(process.cwd(), "drizzle");
const DANGER = /\b(DROP\s+(TABLE|COLUMN|TYPE|SCHEMA)|TRUNCATE|DELETE\s+FROM|ALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE)\b/i;
type Entry = { idx: number; when: number; tag: string };

async function main() {
  const journal: { entries: Entry[] } = JSON.parse(readFileSync(path.join(DIR, "meta", "_journal.json"), "utf8"));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const q = (sql: string, p: unknown[] = []) => pool.query(sql, p);
  try {
    const hasUsers = (await q(`select to_regclass('public.users') as t`)).rows[0].t !== null;
    const hasLog = (await q(`select to_regclass('drizzle.__drizzle_migrations') as t`)).rows[0].t !== null;
    const applied = hasLog ? (await q(`select created_at from drizzle.__drizzle_migrations`)).rows.map((r) => Number(r.created_at)) : [];

    // Legacy database (made with push, before migrations): add anything missing without deleting, then baseline.
    if (hasUsers && applied.length === 0) {
      console.log("• قاعدة بيانات قديمة: هضيف أي جداول/أعمدة ناقصة من غير مسح، وبعدين أعلّمها كأساس.");
      try { execSync("npx drizzle-kit push", { stdio: "inherit", env: process.env }); }
      catch { throw new Error("التحديث محتاج تغيير ممكن يمسح داتا، فوقفته. مفيش حاجة اتغيرت."); }
      const base = journal.entries[0];
      const hash = createHash("sha256").update(readFileSync(path.join(DIR, `${base.tag}.sql`), "utf8")).digest("hex");
      await q(`create schema if not exists drizzle`);
      await q(`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`);
      await q(`insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)`, [hash, base.when]);
      applied.push(base.when);
    }

    const last = applied.length ? Math.max(...applied) : 0;
    const pending = journal.entries.filter((e) => e.when > last);
    for (const e of pending) {
      const sql = readFileSync(path.join(DIR, `${e.tag}.sql`), "utf8");
      if (DANGER.test(sql) && process.env.ALLOW_DESTRUCTIVE !== "1")
        throw new Error(`التعديل ${e.tag} فيه أمر ممكن يمسح داتا (${sql.match(DANGER)![0]}). اتوقف ومفيش حاجة اتغيرت. لو متأكد وعامل باك أب: ALLOW_DESTRUCTIVE=1`);
    }
    if (!pending.length) { console.log("✓ قاعدة البيانات محدّثة، مفيش تعديلات جديدة."); return; }
    await migrate(drizzle(pool), { migrationsFolder: DIR });
    console.log(`✓ اتطبق ${pending.length} تعديل: ${pending.map((e) => e.tag).join(", ")}`);
  } finally { await pool.end(); }
}
main().catch((e) => { console.error("✗", e.message); process.exit(1); });
