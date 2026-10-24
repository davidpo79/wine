import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
 * Mock buyer: walks the buying funnel without paying.
 *
 *   landing page -> bundle selector (1 box / 2 boxes) -> /checkout -> valid mainland Portugal address and contact
 *   -> payment methods (MB WAY, card, Multibanco) shown and total matching the bundle. The pay button is never pressed.
 *
 * What reaches the server, and why it is safe in production (decision, 24/10/2026):
 *
 * - Opening /checkout POSTs /api/checkout, which creates an order row with status pending_payment (a "draft") and
 *   returns the amounts and the payment methods configured on the server. That request is let through on purpose:
 *   it is the only way to prove the server side of the funnel (catalog, sales open, payment configuration) works.
 *   In production the draft carries no name, email, phone or address (see below), so it can never start the
 *   abandoned-checkout follow-ups (src/lib/draft.ts schedules them only once an email AND a phone are saved), never
 *   sends an email, SMS, WhatsApp or call, and sends no Meta CAPI / GA4 event (the consent cookie below is set to
 *   "rejected"; the server-side Purchase needs a paid order anyway). It is tagged utm_source=smoke-test and
 *   utm_medium=playwright so it can be told apart in Admin. Side effects: each production run leaves two such empty
 *   drafts and uses two order numbers (WP-YYYY-NNNN), and it adds two "CheckoutOpened" rows to the internal funnel log.
 * - In production everything after that is stopped inside the browser, so it never leaves the test machine:
 *     PATCH /api/checkout (autosave: this is what would store the typed contact details and start the follow-ups),
 *     /api/checkout/prepare, /api/checkout/addons, /api/pay (payment), /api/leads (exit popup),
 *     /api/track and /api/j (analytics, kept clean of test traffic).
 *   Page routing alone is NOT enough: the autosave uses fetch(..., { keepalive: true }) and Chromium sends keepalive
 *   requests past Playwright's interception (verified: the contact details reached the database). So window.fetch
 *   and navigator.sendBeacon are wrapped by an init script that answers those calls locally, and page routing stays
 *   as a second layer.
 *   Against a local server (CI) the autosave and analytics calls are let through instead: the CI database is
 *   throwaway and has no messaging keys, and it proves the server accepts the address. Payment calls are stopped
 *   everywhere, and the test fails if the page even tries one.
 */

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE_URL);

const BUNDLES = [
  { qty: 1, key: "x1", total: /49,90\s*€/ },
  { qty: 2, key: "x2", total: /89,90\s*€/ },
] as const;

// Clearly fake buyer: example.com is a reserved domain and 910 000 000 is not a customer number.
const BUYER = {
  email: "smoke-test@example.com",
  phone: "910000000",
  firstName: "Teste",
  lastName: "Automatico",
  address1: "Rua Augusta 1",
  postalCode: "1000-001",
  city: "Lisboa",
};

type Rule = { path: string; prefix?: boolean; methods?: string[]; always?: boolean };
// always: stopped against any server. Otherwise: stopped in production only.
const RULES: Rule[] = [
  { path: "/api/checkout/prepare", prefix: true, always: true },
  { path: "/api/checkout/addons", prefix: true, always: true },
  { path: "/api/pay", prefix: true, always: true },
  { path: "/api/checkout", methods: ["PATCH"] },
  { path: "/api/leads", prefix: true },
  { path: "/api/track" },
  { path: "/api/j" },
];

function stopped(rules: Rule[], local: boolean, method: string, path: string): Rule | null {
  for (const r of rules) {
    if (!(r.always || !local)) continue;
    if (!(path === r.path || (r.prefix && path.startsWith(`${r.path}/`)))) continue;
    if (r.methods && !r.methods.includes(method.toUpperCase())) continue;
    return r;
  }
  return null;
}

/** Stops every call that could pay or, in production, store personal data. See the header comment. */
async function guard(context: BrowserContext) {
  // Layer 1, in the page: wraps fetch and sendBeacon before any app code runs (catches keepalive requests too).
  await context.addInitScript(
    ({ rules, local }) => {
      // Same matching as stopped() below; repeated here because the init script runs inside the page (no eval: CSP).
      const isStopped = (rs: Rule[], loc: boolean, method: string, path: string) =>
        rs.some(
          (r) =>
            (r.always || !loc) &&
            (path === r.path || (!!r.prefix && path.startsWith(`${r.path}/`))) &&
            (!r.methods || r.methods.includes(method.toUpperCase())),
        );
      const w = window as unknown as { __smokeStopped: string[] };
      w.__smokeStopped = [];
      const pathOf = (u: string) => new URL(u, location.href);
      const origFetch = window.fetch.bind(window);
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = pathOf(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (url.origin === location.origin && isStopped(rules, local, method, url.pathname)) {
          w.__smokeStopped.push(`${method} ${url.pathname}`);
          return Promise.resolve(new Response(JSON.stringify({ error: "stopped by the smoke test" }), { status: 503, headers: { "Content-Type": "application/json" } }));
        }
        return origFetch(input, init);
      };
      const origBeacon = navigator.sendBeacon?.bind(navigator);
      if (origBeacon) {
        navigator.sendBeacon = (u: string | URL, data?: BodyInit | null) => {
          const url = pathOf(String(u));
          if (url.origin === location.origin && isStopped(rules, local, "POST", url.pathname)) {
            w.__smokeStopped.push(`BEACON ${url.pathname}`);
            return true;
          }
          return origBeacon(u, data);
        };
      }
    },
    { rules: RULES, local: LOCAL },
  );

  // Layer 2, on the network: anything that still gets out (a navigation, a form post) is aborted.
  const origin = new URL(BASE_URL).origin;
  const routed: string[] = [];
  await context.route(
    (url) => url.origin === origin && url.pathname.startsWith("/api/"),
    async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (stopped(RULES, LOCAL, req.method(), path)) {
        routed.push(`${req.method()} ${path}`);
        return route.abort();
      }
      return route.continue();
    },
  );

  // Statistics and marketing consent rejected: no Pixel, GA4 or Clarity, and no consent banner over the page.
  await context.addCookies([
    { name: "wp_consent", value: encodeURIComponent(JSON.stringify({ v: 1, s: 0, m: 0, t: Date.now() })), url: BASE_URL },
  ]);

  return {
    /** Every call stopped so far, in the page and on the network. */
    async all(page: Page) {
      const inPage = await page.evaluate(() => (window as unknown as { __smokeStopped?: string[] }).__smokeStopped ?? []);
      return [...inPage, ...routed];
    },
  };
}

const isPayment = (call: string) => /\/api\/(pay|checkout\/prepare|checkout\/addons)(\/|$)/.test(call);

test("health endpoint reports the database reachable", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({ ok: true });
});

for (const bundle of BUNDLES) {
  test(`mock buyer: ${bundle.qty} ${bundle.qty === 1 ? "box" : "boxes"} up to the payment step, without paying`, async ({ page, context }) => {
    const calls = await guard(context);

    // 1. Landing page.
    await page.goto("/?lang=pt&utm_source=smoke-test&utm_medium=playwright");
    const selector = page.getByTestId("bundles-top");
    await expect(selector).toBeVisible();
    await expect(page.getByTestId("order-button")).toBeVisible();

    // 2. Bundle selector: pick the other option first, then the one under test, so the switch itself is exercised.
    const other = BUNDLES.find((b) => b.qty !== bundle.qty)!;
    await selector.getByTestId(`bundle-${other.qty}`).click();
    await expect(selector.getByTestId(`bundle-${other.qty}`)).toHaveAttribute("aria-pressed", "true");
    const option = selector.getByTestId(`bundle-${bundle.qty}`);
    await option.click();
    await expect(option).toHaveAttribute("aria-pressed", "true");
    await expect(selector.getByTestId(`bundle-${other.qty}`)).toHaveAttribute("aria-pressed", "false");
    await expect(option).toContainText(bundle.total);
    await expect(page.getByTestId("order-button")).toContainText(bundle.total);

    // 3. Checkout: the draft is created on the server (see the header comment).
    const created = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/checkout" && r.request().method() === "POST");
    await page.getByTestId("order-button").click();
    await page.waitForURL(/\/checkout\?/);
    const draft = await created;
    expect(draft.status(), "POST /api/checkout should create the draft").toBe(200);
    expect((await draft.json()).bundle_key).toBe(bundle.key);
    await page.waitForURL(/\/checkout\?o=[^&]+&t=/);

    // 4. Contact and a valid mainland Portugal address.
    for (const [k, v] of Object.entries(BUYER)) {
      const input = page.getByTestId(`checkout-${k}`);
      await input.fill(v);
      await expect(input).toHaveValue(v);
    }
    if (LOCAL) {
      // Local server only: the autosave reaches the server and is accepted.
      const saved = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/checkout" && r.request().method() === "PATCH" && r.ok());
      await page.getByTestId("checkout-city").blur();
      await saved;
      await expect(page.getByText("✓ Guardado")).toBeVisible();
    } else {
      // Production: the autosave was attempted and stopped in the browser, so the typed details never left it.
      await page.getByTestId("checkout-city").blur();
      await expect.poll(async () => (await calls.all(page)).filter((c) => c.endsWith(" /api/checkout"))).not.toEqual([]);
    }

    // 5. Payment methods offered, and the total of the chosen bundle. The pay button is checked, never pressed.
    const methods = page.getByTestId("payment-methods");
    await expect(methods, "payment methods missing: no ifthenpay/Stripe keys on this server?").toBeVisible();
    await expect(methods.getByTestId("payment-method-mbway")).toContainText("MB WAY");
    await expect(methods.getByTestId("payment-method-card")).toBeVisible();
    await expect(methods.getByTestId("payment-method-multibanco")).toContainText("Multibanco");
    await expect(page.getByTestId("checkout-total")).toContainText(bundle.total);
    const pay = page.getByTestId("pay-button");
    await expect(pay).toBeEnabled();
    await expect(pay).toContainText(bundle.total);

    expect((await calls.all(page)).filter(isPayment), "the smoke test must never start a payment").toEqual([]);
  });
}
