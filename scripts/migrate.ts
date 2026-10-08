// Applies pending migrations from ./drizzle to the database in DATABASE_URL.
// Run with: pnpm db:migrate
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}

await migrate(drizzle(neon(url)), { migrationsFolder: "drizzle" });
console.log("Database is up to date.");
