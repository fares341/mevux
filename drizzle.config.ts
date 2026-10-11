import { defineConfig } from "drizzle-kit";
// Schema changes are written as SQL files in ./drizzle (committed to git) with `npm run db:generate`,
// then applied on the server with `npm run db:migrate` (see scripts/migrate.ts). Never `push --force` in production.
export default defineConfig({ schema: "./src/db/schema.ts", out: "./drizzle", dialect: "postgresql", dbCredentials: { url: process.env.DATABASE_URL! } });
