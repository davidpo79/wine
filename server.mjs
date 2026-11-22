// Production server: `next start` plus one fix (David, 22/11/2026).
// Some browsers (in-app browsers among them) request the route-group chunks with the parentheses percent-encoded,
// /_next/static/chunks/app/%28site%29/…. Next serves its static files before middleware runs and answers those with
// 404, so the page dies with "Application error". Decode the parentheses of /_next/ paths before Next sees them.
import { createServer } from "node:http";
import next from "next";

const port = Number(process.env.PORT) || 3000;
const app = next({ dev: false, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();

await app.prepare();
createServer((req, res) => {
  if (req.url && req.url.startsWith("/_next/") && /%2[89]/i.test(req.url)) req.url = req.url.replace(/%28/gi, "(").replace(/%29/gi, ")");
  handle(req, res);
}).listen(port, "0.0.0.0", () => console.log(`> Ready on http://0.0.0.0:${port}`));
