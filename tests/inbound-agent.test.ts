import { test } from "node:test";
import assert from "node:assert/strict";
const { inboundAction, encodeIn, decodeIn, inboundGreeting, inboundInstructions, partOfDay, CONDUCT_RULE } = await import("../src/lib/inbound-agent");

const DASHES = /[–—]/;
const OURS = "+351210210787";
const TEAM = "+351916926644";
const cfg = { assistantId: "a-in", forwardTo: TEAM, ourNumber: OURS };
const caller = (extra: Record<string, unknown> = {}) => encodeIn({ k: "in", r: "caller", from: "+351912345678", ...extra });
const team = encodeIn({ k: "in", r: "team", from: "+351912345678", a: "cc-A" });

test("incoming call: answered only when an inbound assistant is set; other legs are left to the older handlers", () => {
  const p = { call_control_id: "cc-A", direction: "incoming", from: "+351912345678", to: OURS };
  assert.deepEqual(inboundAction("call.initiated", p, cfg), { do: "answer", ccid: "cc-A", state: { k: "in", r: "caller", from: "+351912345678" } });
  // No inbound assistant: the old transfer to the forward phone handles it.
  assert.equal(inboundAction("call.initiated", p, { ...cfg, assistantId: "" }), null);
  // Outgoing legs and the admin phone's legs are not ours.
  assert.equal(inboundAction("call.initiated", { ...p, direction: "outgoing" }, cfg), null);
  assert.equal(inboundAction("call.answered", { call_control_id: "x", client_state: Buffer.from(JSON.stringify({ humanCallId: "h", leg: "rep" })).toString("base64") }, cfg), null);
  assert.equal(decodeIn("not base64 json"), null);
});

test("caller answered: the team phone rings first; no team phone (or our own number) means the AI answers at once", () => {
  const p = { call_control_id: "cc-A", client_state: caller() };
  assert.equal(inboundAction("call.answered", p, cfg)?.do, "ring_team");
  assert.equal(inboundAction("call.answered", p, { ...cfg, forwardTo: "" })?.do, "start_ai");
  assert.equal(inboundAction("call.answered", p, { ...cfg, forwardTo: OURS })?.do, "start_ai");
});

test("team leg: answered stops the ringback; no answer, busy or rejected hands the caller to the AI; a finished call ends both", () => {
  assert.deepEqual(inboundAction("call.answered", { call_control_id: "cc-B", client_state: team }, cfg), { do: "team_answered", callerCcid: "cc-A" });
  for (const cause of ["timeout", "user_busy", "call_rejected", "unspecified"]) {
    assert.deepEqual(inboundAction("call.hangup", { call_control_id: "cc-B", client_state: team, hangup_cause: cause }, cfg), { do: "start_ai", ccid: "cc-A", state: { k: "in", r: "caller", from: "+351912345678" } }, cause);
  }
  assert.deepEqual(inboundAction("call.hangup", { call_control_id: "cc-B", client_state: team, hangup_cause: "normal_clearing" }, cfg), { do: "hangup", ccid: "cc-A" });
});

test("caller hangs up while the team phone rings: the team leg is stopped; AI conversation end alerts the shop", () => {
  assert.deepEqual(inboundAction("call.hangup", { call_control_id: "cc-A", client_state: caller({ b: "cc-B" }) }, cfg), { do: "hangup", ccid: "cc-B" });
  assert.equal(inboundAction("call.hangup", { call_control_id: "cc-A", client_state: caller() }, cfg), null);
  assert.deepEqual(inboundAction("call.conversation.ended", { call_control_id: "cc-A", client_state: caller() }, cfg), { do: "alert", from: "+351912345678" });
});

test("greeting by Lisbon time of day; instructions carry the shop's facts and the guideline rules", () => {
  assert.equal(partOfDay(new Date("2026-11-10T09:30:00Z")), "bom dia");
  assert.equal(partOfDay(new Date("2026-11-10T15:00:00Z")), "boa tarde");
  assert.equal(partOfDay(new Date("2026-11-10T21:00:00Z")), "boa noite");
  const g = inboundGreeting(new Date("2026-11-10T15:00:00Z"));
  assert.match(g, /^Olá, muito boa tarde! Bem-vindo à Wine Portugal\. Sou a Madalena, a assistente virtual da empresa\./);
  assert.match(g, /pode ser gravada/);
  const i = inboundInstructions("30/11");
  for (const re of [/vinho\.prendadenatal\.com/, /49,90 euros/, /89,90 euros/, /149,70 euros/, /3,90 euros/, /by 30\/11 arrive before Christmas/, /cannot transfer the call/, /team will call them back/, /European Portuguese/]) assert.match(i, re);
  assert.doesNotMatch(i, /wine-portugal\.com/);
  for (const re of [/never claim that wine has health benefits/, /over 18/, /never invent vintages, grape varieties, alcohol percentages/, /8 to 12 degrees/]) assert.match(CONDUCT_RULE, re);
  assert.doesNotMatch(g + i + CONDUCT_RULE, DASHES);
});
