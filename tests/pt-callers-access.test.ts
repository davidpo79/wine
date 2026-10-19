// Portugal HR callers: structural guarantees, read from source.
// - The Portugal caller role is admitted ONLY where a file opts in, and the
//   files that opt in are exactly the Portugal surfaces plus the password
//   change and login redirect. Every other admin page and route keeps calling
//   the session check that refuses that role by default.
// - The module never reads shop or customer tables.
// - No key reaches the browser; no export, recording or bulk-dial route.
// - The rep's text is European Portuguese, not Brazilian.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
process.env.SESSION_SECRET = "x".repeat(40);
const { PT } = await import("../src/lib/pt-callers/pt-PT");

const ROOT = join(import.meta.dirname, "..");
function* walk(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) yield* walk(f);
    else if (/\.(ts|tsx)$/.test(n)) yield f;
  }
}
const rel = (f: string) => relative(ROOT, f).split("\\").join("/");
const SRC = [...walk(join(ROOT, "src"))];
const read = (f: string) => readFileSync(f, "utf8");

test("only the Portugal surfaces, the password change and the login redirect admit the Portugal caller role", () => {
  const code = (f: string) => read(f).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const optIn = SRC.filter((f) => /allowPtCaller:\s*true/.test(code(f))).map(rel).sort();
  assert.deepEqual(optIn, [
    "src/app/admin/actions.ts",
    "src/app/admin/login/page.tsx",
    "src/app/admin/password/page.tsx",
    "src/app/admin/pt-callers/page.tsx",
    "src/app/api/pt-callers/[...path]/route.ts",
    "src/lib/auth.ts",
  ]);
  const actions = read(join(ROOT, "src/app/admin/actions.ts"));
  assert.equal(actions.match(/allowPtCaller:\s*true/g)!.length, 1, "only the password-change action in actions.ts");
  assert.match(actions, /requireAdmin\(\{ allowPasswordChange: true, allowPtCaller: true \}\)/);
});

test("every other admin page and admin route still runs the session check that refuses the role", () => {
  const surfaces = SRC.filter((f) => /src\/app\/admin\/.*(page|route)\.tsx?$/.test(rel(f)) && !/\/(login|password|pt-callers)\//.test(rel(f)));
  assert.ok(surfaces.length > 20, `found ${surfaces.length} admin surfaces`);
  for (const f of surfaces) {
    const s = read(f);
    const guarded = /requireAdmin\(/.test(s) || /getAdmin\(/.test(s) || /\(app\)\//.test(rel(f));
    assert.ok(guarded, `${rel(f)} has no session check`);
    assert.doesNotMatch(s, /allowPtCaller/, `${rel(f)} must not admit the Portugal caller role`);
  }
  // The (app) group's layout is itself guarded, so a page inside it that forgot
  // its own check still refuses the role.
  assert.match(read(join(ROOT, "src/app/admin/(app)/layout.tsx")), /requireAdmin\(\)/);
});

test("auth maps roles explicitly: an unknown role is never admin", () => {
  const auth = read(join(ROOT, "src/lib/auth.ts"));
  assert.doesNotMatch(auth, /u\.role === "fulfilment" \? "fulfilment" : "admin"/);
  assert.match(auth, /normalizeRole\(u\.role\)/);
  assert.match(auth, /role === "pt_caller" && !opts\.allowPtCaller/);
});

test("the module reads only its own pt_* tables (and the team list for assignment)", () => {
  const files = SRC.filter((f) => rel(f).startsWith("src/lib/pt-callers/"));
  for (const f of files) {
    const s = read(f);
    for (const m of s.matchAll(/schema\.(\w+)/g)) assert.equal(m[1], "adminUsers", `${rel(f)} reads schema.${m[1]}`);
    // SQL lives in sql`...` templates: every table they name must be a pt_* table.
    for (const tpl of s.match(/sql`[^`]*`/g) ?? []) {
      for (const m of tpl.matchAll(/(?<!do )\b(?:from|into|update|join|truncate)\s+(\w+)/gi)) {
        assert.match(m[1], /^pt_\w+$/, `${rel(f)} touches table "${m[1]}"`);
      }
    }
  }
});

test("no key in browser code; no export, recording or bulk-dial route", () => {
  const screen = read(join(ROOT, "src/app/admin/pt-callers/PtCallersScreen.tsx"));
  assert.doesNotMatch(screen, /process\.env|API_KEY|localStorage|newCall\(/);
  const routes = read(join(ROOT, "src/app/api/pt-callers/[...path]/route.ts"));
  const paths = [...routes.matchAll(/^\s*"([a-z/:-]+)":/gm)].map((m) => m[1]);
  assert.ok(paths.length >= 20, `found ${paths.length} route paths`);
  for (const p of paths) assert.doesNotMatch(p, /export|csv|record|bulk|power|sms/i, p);
  const telnyx = read(join(ROOT, "src/lib/pt-callers/telnyx.ts"));
  for (const k of ["record:", "record_channels", "answering_machine_detection", "transcription_start", "/messages"]) assert.ok(!telnyx.includes(k), k);
});

test("the rep's text is European Portuguese, not Brazilian", () => {
  const text = JSON.stringify(PT);
  for (const w of ["contacto", "colaboradores", "equipa", "registo", "auscultadores", "Não contactar", "Direito de oposição"]) assert.ok(text.includes(w), w);
  const BR = /\b(você|vocês|celular|contato|contatos|equipe|usuário|cadastr\w*|registr(o|ar)|tela|fone de ouvido|planilha|arquivo)\b/i;
  assert.doesNotMatch(text, BR);
  assert.doesNotMatch(read(join(ROOT, "src/lib/pt-callers/pt-PT.ts")).replace(/\/\/.*$/gm, ""), BR);
});

test("every refusal the service can send has pt-PT words", () => {
  const svc = read(join(ROOT, "src/lib/pt-callers/service.ts"));
  const codes = new Set([...svc.matchAll(/return "([a-z_]+)";/g)].map((m) => m[1]));
  for (const c of codes) assert.ok(PT.refusals[c], `no pt-PT text for refusal ${c}`);
});

test("cross-site POSTs to the Portugal API are refused; same-site ones pass behind a proxy", async () => {
  const { sameSite } = await import("../src/lib/pt-callers/http");
  const r = (origin: string | null, host: string, fwd?: string) =>
    new Request("http://10.0.0.5:8080/api/pt-callers/admin/import", { method: "POST", headers: { ...(origin ? { origin } : {}), host, ...(fwd ? { "x-forwarded-host": fwd } : {}) } });
  assert.equal(sameSite(r("https://vinho.example.test", "10.0.0.5:8080", "vinho.example.test")), true);
  assert.equal(sameSite(r("http://127.0.0.1:3999", "127.0.0.1:3999")), true);
  assert.equal(sameSite(r(null, "127.0.0.1:3999")), true);
  assert.equal(sameSite(r("https://evil.example", "10.0.0.5:8080", "vinho.example.test")), false);
  assert.equal(sameSite(r("not a url", "x")), false);
});

test("API routes answer only the service's own refusal codes, never a database or provider error code", () => {
  for (const f of ["src/app/api/pt-callers/[...path]/route.ts", "src/app/api/pt-callers/apollo-webhook/[enrichId]/[secret]/route.ts"]) {
    const s = read(join(ROOT, f));
    assert.match(s, /e instanceof ServiceError\) return Response\.json\(\{ error: e\.code \}/, f);
    assert.doesNotMatch(s, /\?\.code\) return|err\?\.status\) return/, f);
  }
});
