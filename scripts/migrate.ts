import "./load-env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
await migrate(drizzle({ client: sql }), { migrationsFolder: "drizzle" });
console.log("migrations applied");
await sql.end();
