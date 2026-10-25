// Bots and tests (Meta's ad review, crawlers, the smoke test) are kept out of the admin funnel under one source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOT_SOURCE, funnelSource, isBotUa } from "../src/lib/bots";

const REAL = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/530.0]";
const META_REVIEW = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.37 Safari/537.36";

test("recognises bots, headless browsers and Meta's ad review", () => {
  assert.equal(isBotUa("Mozilla/5.0 HeadlessChrome/120.0"), true);
  assert.equal(isBotUa("facebookexternalhit/1.1"), true);
  assert.equal(isBotUa("Mozilla/5.0 (compatible; Googlebot/2.1)"), true);
  assert.equal(isBotUa(META_REVIEW), true);
  assert.equal(isBotUa(REAL), false);
  assert.equal(isBotUa(null), false);
});

test("keeps a real visit's source and files the rest under bots & tests", () => {
  assert.equal(funnelSource("Meta ads", REAL), "Meta ads");
  assert.equal(funnelSource("Meta ads", META_REVIEW), BOT_SOURCE);
  assert.equal(funnelSource("smoke-test", REAL), BOT_SOURCE);
  assert.equal(funnelSource(BOT_SOURCE, REAL), BOT_SOURCE);
  assert.equal(funnelSource(null, REAL), null);
});
