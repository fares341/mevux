import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
const g = globalThis as unknown as { pool?: Pool };
const pool = g.pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") g.pool = pool;
export const db = drizzle(pool, { schema });
export * from "@/db/schema";
