import "./load-env";
import { sql } from "../src/db";
const [r] = await sql`select order_id from shipments where label_pdf is not null order by id desc limit 1`;
console.log(r.order_id);
await sql.end();
