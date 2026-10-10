// Usage: npm run admin:create -- email@example.com 'password'
// (or omit the password to generate a random one, printed once)
import "./load-env";
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { sql as pg, db, schema } from "../src/db";

const [email, pwArg] = process.argv.slice(2);
if (!email || !email.includes("@")) {
  console.error("Usage: npm run admin:create -- <email> [password]");
  process.exit(1);
}
const password = pwArg ?? randomBytes(12).toString("base64url");
if (password.length < 10) {
  console.error("Password must be at least 10 characters");
  process.exit(1);
}
const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
await db
  .insert(schema.adminUsers)
  .values({ email: email.toLowerCase(), passwordHash })
  .onConflictDoUpdate({ target: schema.adminUsers.email, set: { passwordHash } });
console.log(`admin ready: ${email.toLowerCase()}`);
if (!pwArg) console.log(`generated password (shown once): ${password}`);
await pg.end();
