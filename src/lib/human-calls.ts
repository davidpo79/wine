// Admin → customer phone calls: the store, the three admin endpoints' logic and the webhook state machine.
// Same flow as astro-dynamic-server (humanCalls.js / humanCallApi.js); the Telnyx commands are in telnyx-call-control.ts.
//
//   start   insert the row (dialing) BEFORE dialing, then dial the admin's browser (leg A)        → rep_ringing
//   webhook call.answered on leg A → atomic claim rep_answered → customer_dialing, dial the customer (leg B)
//           call.bridged → connected (the only proof two people can hear each other); recording starts here (if on)
//           call.hangup on either leg → terminal; every other leg is hung up
//   state   the browser polls every 2 s; `connected` comes from here and from nowhere else
import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { HumanCall } from "@/db/schema";
import type { AdminSession } from "./auth";
import { normalizePhone } from "./leads";
import { logOrderEvent } from "./orders";
import { bucketConfigured, putObject } from "./bucket";
import * as ptHooks from "./pt-callers/call-hooks";
import { outboundEnv } from "./outbound-settings";
import { CONDUCT_RULE, encodeIn, inboundAction, inboundGreeting, inboundInstructions, type InState } from "./inbound-agent";
import { marketCutoffIso, sendInboundCallAlert } from "./email";
import { getSettings } from "./settings";
import {
  TERMINAL,
  TelnyxError,
  createRepCredential,
  decodeClientState,
  deleteRepCredential,
  dialCustomerLeg,
  dialRepLeg,
  hangupLeg,
  inboundForward,
  transferInbound,
  answerInbound,
  dialTeamLeg,
  updateClientState,
  startInboundAssistant,
  sendDtmf,
  humanCallConfig,
  humanCallMissing,
  isTerminal,
  machineVerdict,
  mintRepToken,
  rankOf,
  startRecording,
  startRingback,
  statusForEvent,
  stopRingback,
  type CallStatus,
  type Leg,
} from "./telnyx-call-control";

const T = schema.humanCalls;
const E = schema.humanCallRepEndpoints;
const log = (...a: unknown[]) => console.log("[human-call]", ...a);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const pgCode = (e: unknown): { code?: string; constraint?: string } => {
  const x = e as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  return { code: x?.code ?? x?.cause?.code, constraint: x?.constraint_name ?? x?.cause?.constraint_name };
};

type Result = { status: number; body: Record<string, unknown> };
const reply = (status: number, body: Record<string, unknown>): Result => ({ status, body });

// --- Store ----------------------------------------------------------------------------------------------------------

const newCallId = () => `hc_${randomBytes(8).toString("hex")}`;

async function resolveLeg(ccid: string): Promise<{ row: HumanCall; leg: Leg } | null> {
  const [row] = await db.select().from(T).where(or(eq(T.callControlId, ccid), eq(T.repCallControlId, ccid))).limit(1);
  if (!row) return null;
  return { row, leg: row.repCallControlId === ccid ? "rep" : "customer" };
}

/** Write-once binding: a column already holding another id is never overwritten. */
async function bindLeg(id: string, leg: Leg, ccid: string, callSessionId?: string | null) {
  const col = leg === "rep" ? T.repCallControlId : T.callControlId;
  const set = leg === "rep" ? { repCallControlId: ccid, ...(callSessionId ? { callSessionId } : {}), updatedAt: new Date() } : { callControlId: ccid, updatedAt: new Date() };
  const r = await db
    .update(T)
    .set(set)
    .where(and(eq(T.id, id), or(isNull(col), eq(col, ccid))))
    .returning({ id: T.id });
  return r.length > 0;
}

/**
 * The one lifecycle write: monotonic (only rows ranked below the new status move, so terminal rows are immutable),
 * timestamps written once, duration from the bridge.
 */
async function applyLifecycle(ccid: string, status: CallStatus, at: Date, hangupCause?: string | null) {
  const below = Object.keys({ dialing: 0, rep_ringing: 0, rep_answered: 0, customer_dialing: 0, bridged: 0 }).filter((s) => rankOf(s) < rankOf(status));
  const terminal = isTerminal(status);
  const [row] = await db
    .update(T)
    .set({
      status,
      updatedAt: new Date(),
      ...(status === "rep_answered" ? { repAnsweredAt: sql`coalesce(${T.repAnsweredAt}, ${at.toISOString()}::timestamptz)` } : {}),
      ...(status === "bridged" ? { bridgedAt: sql`coalesce(${T.bridgedAt}, ${at.toISOString()}::timestamptz)` } : {}),
      ...(terminal
        ? {
            endedAt: sql`coalesce(${T.endedAt}, ${at.toISOString()}::timestamptz)`,
            hangupCause: sql`coalesce(${T.hangupCause}, ${hangupCause ?? null}::text)`,
            durationMs: sql`case when ${T.bridgedAt} is null then null else greatest(0, (extract(epoch from (coalesce(${T.endedAt}, ${at.toISOString()}::timestamptz) - ${T.bridgedAt})) * 1000)::int) end`,
          }
        : {}),
    })
    .where(and(or(eq(T.callControlId, ccid), eq(T.repCallControlId, ccid)), inArray(T.status, below)))
    .returning();
  return row ?? (await resolveLeg(ccid))?.row ?? null;
}

async function failCall(id: string, error: string) {
  await db
    .update(T)
    .set({ status: "failed", error, endedAt: sql`coalesce(${T.endedAt}, now())`, updatedAt: new Date() })
    .where(and(eq(T.id, id), sql`${T.status} not in ('completed','rep_no_answer','no_answer','busy','failed','canceled')`));
}

// --- Who can be called ----------------------------------------------------------------------------------------------

type Target = { orderId: string | null; leadId: number | null; name: string; phone: string | null; consent: boolean };

async function target(input: { orderId?: unknown; leadId?: unknown }): Promise<Target | null> {
  if (typeof input.orderId === "string" && input.orderId) {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, input.orderId)).limit(1);
    return o ? { orderId: o.id, leadId: null, name: o.customerName ?? o.shippingAddress?.name ?? o.id, phone: o.phone, consent: o.consentCalls } : null;
  }
  const leadId = Number(input.leadId);
  if (Number.isInteger(leadId) && leadId > 0) {
    const [l] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).limit(1);
    return l ? { orderId: null, leadId: l.id, name: l.name, phone: l.phone, consent: l.consentPhone && !l.unsubscribedAt } : null;
  }
  return null;
}

// --- POST /admin/calls/webrtc-token ---------------------------------------------------------------------------------

/** The admin's credential (created on first use) and a fresh login token, the only thing that reaches the browser. */
export async function webrtcToken(me: AdminSession): Promise<Result> {
  const missing = humanCallMissing();
  if (missing.length) return reply(503, { error: `Calling is not configured: ${missing.join(", ")} not set.` });
  try {
    let [ep] = await db.select().from(E).where(eq(E.adminId, me.id)).limit(1);
    if (ep && !ep.active) return reply(403, { error: "Calling is disabled for your user." });
    if (!ep) {
      const cred = await createRepCredential(me.id);
      const won = await db
        .insert(E)
        .values({ adminId: me.id, sipUsername: cred.sipUsername, credentialId: cred.credentialId, connectionId: cred.connectionId })
        .onConflictDoNothing({ target: E.adminId })
        .returning()
        .catch(() => []);
      if (!won.length) {
        // Another tab won the race: keep its credential and delete the one just made.
        await deleteRepCredential(cred.credentialId).catch((e) => log("orphan credential not deleted", errText(e)));
        [ep] = await db.select().from(E).where(eq(E.adminId, me.id)).limit(1);
        if (!ep) return reply(503, { error: "Could not set up your calling device. Try again." });
      } else ep = won[0];
    }
    const t = await mintRepToken(ep.credentialId);
    return reply(200, { ok: true, token: t.token, expiresInSecs: t.expiresInSecs, sipUsername: ep.sipUsername });
  } catch (e) {
    log("webrtc-token", errText(e)); // provider text stays in the log
    return reply(502, { error: "Telnyx did not issue a calling token. Try again in a minute." });
  }
}

// --- POST /admin/calls/start ----------------------------------------------------------------------------------------

export async function startCall(me: AdminSession, input: { orderId?: unknown; leadId?: unknown }): Promise<Result> {
  const t = await target(input);
  if (!t) return reply(404, { error: "Not found." });
  const to = t.phone ? normalizePhone(t.phone) : null;
  if (!to) return reply(400, { error: "This customer has no valid phone number." });
  if (!t.consent) return reply(403, { error: "This customer has not agreed to be called." });
  return placeCall(me, { to, orderId: t.orderId, leadId: t.leadId });
}

/**
 * Inserts the row, then rings the admin's browser. `onCreated` runs after the row exists and before anything is
 * dialed (the Portugal-callers module links its lead there, so the webhook already knows the call's rules).
 */
export async function placeCall(me: AdminSession, t: { to: string; orderId?: string | null; leadId?: number | null; onCreated?: (callId: string) => Promise<void> }): Promise<Result> {
  // The row exists BEFORE anything is dialed; the partial unique index allows one live call per admin.
  const id = newCallId();
  const to = t.to;
  const from = humanCallConfig().fromNumber || null;
  try {
    await db.insert(T).values({ id, orderId: t.orderId ?? null, leadId: t.leadId ?? null, toNumber: to, fromNumber: from, initiatedBy: me.id, initiatedByEmail: me.email, status: "dialing" });
  } catch (e) {
    const pg = pgCode(e);
    if (pg.code === "23505") {
      const [active] = await db
        .select({ id: T.id, status: T.status })
        .from(T)
        .where(and(eq(T.initiatedBy, me.id), sql`${T.status} not in ('completed','rep_no_answer','no_answer','busy','failed','canceled')`))
        .limit(1);
      return reply(409, { error: "You already have a call in progress", code: "rep_busy", activeCallId: active?.id ?? null, activeStatus: active?.status ?? null });
    }
    throw e;
  }
  if (t.orderId) await logOrderEvent(t.orderId, "human_call_attempt", { callId: id, by: me.email }).catch(() => {});
  if (t.onCreated) {
    try {
      await t.onCreated(id);
    } catch (e) {
      await failCall(id, `call_setup_failed:${errText(e)}`);
      throw e;
    }
  }

  const notPlaced = async (error: string, dialError: string) => {
    await failCall(id, error);
    return reply(200, { ok: true, callId: id, status: "failed", dialed: false, dialError });
  };
  const missing = humanCallMissing();
  if (missing.length) return notPlaced(`sales_provider_config:${missing.join(",")}`, `Calling is not configured (${missing.join(", ")}).`);
  const [ep] = await db.select().from(E).where(and(eq(E.adminId, me.id), eq(E.active, true))).limit(1);
  if (!ep) return notPlaced("rep_endpoint_missing", "Your calling device is not connected. Connect it and try again.");
  await db.update(T).set({ repSipUsername: ep.sipUsername }).where(eq(T.id, id));

  let leg: { callControlId: string; callSessionId: string | null };
  try {
    leg = await dialRepLeg({ callId: id, sipUsername: ep.sipUsername });
  } catch (e) {
    log("rep leg dial", id, errText(e));
    return notPlaced(`rep_leg_dial_rejected:${errText(e)}`, "The call could not be placed. Please try again.");
  }
  // From here the leg is live: never fail the row. If the bind is lost, client_state on the webhook recovers it.
  const bound = await bindLeg(id, "rep", leg.callControlId, leg.callSessionId).catch(() => false);
  if (!bound) return reply(200, { ok: true, callId: id, status: "dialing", dialed: true, bound: false, bindPending: true });
  await applyLifecycle(leg.callControlId, "rep_ringing", new Date()).catch(() => null);
  return reply(200, { ok: true, callId: id, status: "rep_ringing", dialed: true, bound: true });
}

// --- POST /admin/calls/state ----------------------------------------------------------------------------------------

/** Closed tokens for the browser; the stored error (with provider text) never leaves the server. */
export function errorToken(error: string | null) {
  if (!error) return null;
  const k = error.split(":")[0];
  if (k === "sales_provider_config") return "calling_not_configured";
  if (k === "rep_endpoint_missing") return "rep_device_not_connected";
  if (k === "rep_endpoint_unavailable") return "calling_unavailable";
  if (k === "rep_leg_dial_rejected" || k === "rep_leg_missing_at_bridge_time") return "call_not_placed";
  if (k === "customer_leg_dial_rejected") return "customer_not_reached";
  return "call_failed";
}

export function publicState(r: HumanCall) {
  const machine = r.answeredBy === "machine";
  return {
    callId: r.id,
    status: r.status,
    connected: r.status === "bridged" && !machine,
    answeredBy: r.answeredBy ?? null,
    likelyVoicemail: r.answeredBy ? machine : null,
    humanAnswerAt: r.humanAnswerAt?.toISOString() ?? null,
    repAnsweredAt: r.repAnsweredAt?.toISOString() ?? null,
    connectedAt: machine ? null : (r.bridgedAt?.toISOString() ?? null),
    endedAt: r.endedAt?.toISOString() ?? null,
    durationMs: r.durationMs ?? null,
    recording: r.recordingStatus ?? null,
    error: errorToken(r.error),
  };
}

export async function callState(me: AdminSession, callId: unknown): Promise<Result> {
  if (typeof callId !== "string" || !callId) return reply(404, { error: "Not found." });
  const [r] = await db.select().from(T).where(and(eq(T.id, callId), eq(T.initiatedBy, me.id))).limit(1);
  if (!r) return reply(404, { error: "Not found." });
  return reply(200, { ok: true, state: publicState(r) });
}

/** Keypad during a connected call: digits go to the other side's line (the caller's own call only). */
export async function callDtmf(me: AdminSession, callId: unknown, digits: unknown): Promise<Result> {
  if (typeof callId !== "string" || !callId) return reply(404, { error: "Not found." });
  if (typeof digits !== "string" || !/^[0-9*#]{1,20}$/.test(digits)) return reply(400, { error: "Digits 0-9, * and # only." });
  const [r] = await db.select().from(T).where(and(eq(T.id, callId), eq(T.initiatedBy, me.id))).limit(1);
  if (!r) return reply(404, { error: "Not found." });
  if (r.status !== "bridged" || !r.callControlId) return reply(409, { error: "The call is not connected." });
  try {
    await sendDtmf(r.callControlId, digits);
  } catch (e) {
    log("dtmf", r.id, errText(e));
    return reply(502, { error: "The tones could not be sent." });
  }
  return reply(200, { ok: true });
}

// --- POST /api/telnyx/human-call-webhook ----------------------------------------------------------------------------

// Telnyx flagged accounts for too many calls of 6 s or less: a bridged customer leg is never hung up before 7 s.
const MIN_BRIDGED_MS = 7_000;

async function hangupOtherLegs(row: HumanCall, reportingCcid: string) {
  for (const [leg, ccid] of [
    ["rep", row.repCallControlId],
    ["customer", row.callControlId],
  ] as const) {
    if (!ccid || ccid === reportingCcid) continue;
    const since = row.bridgedAt ? Date.now() - row.bridgedAt.getTime() : Infinity;
    const wait = leg === "customer" && since < MIN_BRIDGED_MS ? MIN_BRIDGED_MS - since : 0;
    const run = () => hangupLeg(ccid).catch((e) => log("hangup", row.id, leg, errText(e)));
    if (wait > 0) setTimeout(run, wait);
    else await run();
  }
}

async function dialCustomerFor(row: HumanCall) {
  try {
    const missing = humanCallMissing();
    if (missing.length) throw new TelnyxError(`sales_provider_config:${missing.join(",")}`, 0);
    if (!row.repCallControlId) throw new TelnyxError("rep_leg_missing_at_bridge_time", 0);
    // A Portugal-callers lead is rechecked right before its phone rings (an opt-out may have landed meanwhile).
    const pt = await ptHooks.isPtCall(row.id);
    const refusal = pt ? await ptHooks.customerLegRefusal(row.id) : null;
    if (refusal) throw new TelnyxError(`pt_recheck_refused:${refusal}`, 0);
    // Portugal callers: answering-machine detection only when the settings say voicemail ends the call by itself.
    const leg = await dialCustomerLeg({ callId: row.id, to: row.toNumber, linkTo: row.repCallControlId, amd: !pt || ptHooks.autoHangupOnVoicemail() });
    await bindLeg(row.id, "customer", leg.callControlId);
  } catch (e) {
    const msg = errText(e);
    log("customer leg dial", row.id, msg);
    await failCall(row.id, /^(sales_provider_config|rep_leg_missing|pt_recheck_refused)/.test(msg) ? msg : `customer_leg_dial_rejected:${msg}`);
    if (row.repCallControlId) await hangupLeg(row.repCallControlId).catch(() => {});
    if (await ptHooks.isPtCall(row.id).catch(() => false)) await ptHooks.onCallEnded(row.id).catch(() => {});
  }
}

async function startRecordingFor(row: HumanCall) {
  if (!humanCallConfig().record || !row.callControlId) return;
  if (await ptHooks.isPtCall(row.id)) return; // Portugal-callers calls are never recorded
  const [claimed] = await db
    .update(T)
    .set({ recordingStatus: "requested", updatedAt: new Date() })
    .where(and(eq(T.id, row.id), isNull(T.recordingStatus), isNull(T.recordingKey), sql`${T.bridgedAt} is not null`))
    .returning({ id: T.id });
  if (!claimed) return;
  // A recording failure never drops the call.
  await startRecording(row.callControlId, row.id).catch(async (e) => {
    log("record_start", row.id, errText(e));
    await db.update(T).set({ recordingStatus: "failed", updatedAt: new Date() }).where(eq(T.id, row.id));
  });
}

async function saveRecording(p: Record<string, unknown>) {
  const ccid = String(p.call_control_id ?? "");
  const [row] = ccid ? await db.select().from(T).where(eq(T.callControlId, ccid)).limit(1) : [];
  if (!row || row.recordingKey) return;
  const urls = (p.recording_urls ?? p.public_recording_urls ?? {}) as { mp3?: string; wav?: string };
  const url = urls.mp3 ?? urls.wav ?? (p.recording_url as string | undefined);
  const fail = (why: string) => db.update(T).set({ recordingStatus: "failed", error: sql`coalesce(${T.error}, ${`recording:${why}`}::text)`, updatedAt: new Date() }).where(eq(T.id, row.id));
  if (!url) return fail("no_url");
  if (!bucketConfigured()) return fail("bucket_not_configured");
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) return fail(`download_${r.status}`);
    const mp3 = !urls.mp3 && urls.wav ? false : true;
    const key = await putObject(`private/calls/${row.id}.${mp3 ? "mp3" : "wav"}`, Buffer.from(await r.arrayBuffer()), mp3 ? "audio/mpeg" : "audio/wav");
    const start = Date.parse(String(p.recording_started_at ?? ""));
    const end = Date.parse(String(p.recording_ended_at ?? ""));
    await db
      .update(T)
      .set({ recordingStatus: "stored", recordingKey: key, recordingDurationMs: Number.isFinite(end - start) ? end - start : null, updatedAt: new Date() })
      .where(eq(T.id, row.id));
  } catch (e) {
    await fail(errText(e));
  }
}

/** Incoming calls with the AI fallback; false = not configured or not such a leg (the forward below takes it). */
async function handleInbound(type: string, p: Record<string, unknown>) {
  const env = outboundEnv();
  const act = inboundAction(type, p, { assistantId: env.TELNYX_INBOUND_ASSISTANT_ID ?? "", forwardTo: env.TELNYX_INBOUND_FORWARD_TO ?? "", ourNumber: String(p.to ?? env.TELNYX_FROM_NUMBER ?? "") });
  if (!act) return false;
  if (act.do === "answer") await answerInbound(act.ccid, encodeIn(act.state));
  else if (act.do === "ring_team") {
    await startRingback(act.ccid, act.ccid);
    const b = await dialTeamLeg({
      to: env.TELNYX_INBOUND_FORWARD_TO!,
      from: env.TELNYX_FROM_NUMBER || String(p.to ?? ""),
      callerCcid: act.ccid,
      clientState: encodeIn({ k: "in", r: "team", from: act.state.from, a: act.ccid }),
      ringSecs: Number(env.TELNYX_INBOUND_RING_SECS) > 0 ? Number(env.TELNYX_INBOUND_RING_SECS) : 15,
    }).catch((e) => (log("inbound team dial", act.ccid, errText(e)), null));
    // Remember the team leg on the caller's leg (a caller who hangs up stops it), or answer with the AI right away.
    if (b) await updateClientState(act.ccid, encodeIn({ ...act.state, b }));
    else await startAi(act.ccid, act.state);
  } else if (act.do === "start_ai") await startAi(act.ccid, act.state);
  else if (act.do === "team_answered") await stopRingback(act.callerCcid, act.callerCcid);
  else if (act.do === "hangup") await hangupLeg(act.ccid);
  else if (act.do === "alert") await sendInboundCallAlert(act.from);
  return true;
}

async function startAi(callerCcid: string, state: InState) {
  await stopRingback(callerCcid, callerCcid);
  const settings = await getSettings();
  const cutoff = new Date(marketCutoffIso(settings, "PT")).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit" });
  await startInboundAssistant(callerCcid, {
    assistantId: outboundEnv().TELNYX_INBOUND_ASSISTANT_ID!,
    greeting: inboundGreeting(),
    instructions: `${inboundInstructions(cutoff)}\n\n${CONDUCT_RULE}`,
    clientState: encodeIn({ k: "in", r: "caller", from: state.from }),
  });
}

/** Called after the signature check. Every event on the account arrives here; unknown legs are ignored. */
export async function handleHumanCallEvent(evt: { event_type?: string; occurred_at?: string; payload?: Record<string, unknown> }) {
  const type = evt.event_type ?? "";
  const p = evt.payload ?? {};
  if (type === "call.recording.saved") return saveRecording(p);
  const ccid = String(p.call_control_id ?? "");
  if (type === "call.recording.error") {
    if (ccid) await db.update(T).set({ recordingStatus: "failed", updatedAt: new Date() }).where(eq(T.callControlId, ccid));
    return;
  }
  if (!ccid) return;
  if (await handleInbound(type, p).catch((e) => (log("inbound", ccid, errText(e)), true))) return;
  const fwd = inboundForward(type, p);
  if (fwd) return void (await transferInbound(fwd).catch((e) => log("inbound forward", ccid, errText(e))));

  let found = await resolveLeg(ccid);
  if (!found) {
    // The webhook beat the synchronous bind: client_state says which row and leg (it never creates rows).
    const cs = decodeClientState(p.client_state);
    if (!cs) return;
    await bindLeg(cs.humanCallId, cs.leg, ccid, cs.leg === "rep" ? ((p.call_session_id as string) ?? null) : null).catch(() => false);
    found = await resolveLeg(ccid);
    if (!found) return;
  }
  const { leg } = found;
  let row = found.row;

  const verdict = machineVerdict(type, p as { result?: unknown });
  if (verdict) {
    // First verdict wins; informative only (premium AMD has labelled a real 7-minute conversation as a machine).
    await db
      .update(T)
      .set({
        amdResult: sql`coalesce(${T.amdResult}, ${verdict.result}::text)`,
        answeredBy: sql`coalesce(${T.answeredBy}, ${verdict.isMachine ? "machine" : verdict.isHuman ? "human" : null}::text)`,
        ...(verdict.isHuman ? { humanAnswerAt: sql`coalesce(${T.humanAnswerAt}, now())` } : {}),
        updatedAt: new Date(),
      })
      .where(eq(T.id, row.id));
    if (row.status === "bridged") await startRecordingFor(row);
    // Portugal callers with "voicemail ends the call": hang up both legs and log the call as voicemail.
    if (verdict.isMachine && !row.endedAt && ptHooks.autoHangupOnVoicemail() && (await ptHooks.isPtCall(row.id))) {
      await ptHooks.onVoicemail(row.id).catch((e) => log("pt voicemail", row.id, errText(e)));
      for (const id of [row.callControlId, row.repCallControlId]) if (id) await hangupLeg(id).catch(() => {});
    }
    return;
  }

  const status = statusForEvent(type, p, leg, row.status, !!row.repAnsweredAt || rankOf(row.status) >= 2, !!row.bridgedAt || row.status === "bridged");
  if (status) {
    const at = Date.parse(evt.occurred_at ?? "");
    row = (await applyLifecycle(ccid, status, Number.isFinite(at) ? new Date(at) : new Date(), (p.hangup_cause as string) ?? null)) ?? row;
  }

  if (row.status === "rep_answered" && leg === "rep") {
    // Exactly one customer dial, however many times call.answered is delivered.
    const [claimed] = await db
      .update(T)
      .set({ status: "customer_dialing", updatedAt: new Date() })
      .where(and(eq(T.id, row.id), eq(T.status, "rep_answered"), isNull(T.callControlId)))
      .returning();
    if (claimed) await dialCustomerFor(claimed);
  } else if (type === "call.initiated" && leg === "customer" && row.status === "customer_dialing") {
    if (row.repCallControlId) await startRingback(row.repCallControlId, row.id).catch((e) => log("ringback", row.id, errText(e)));
  } else if (row.status === "bridged") {
    if (row.repCallControlId) await stopRingback(row.repCallControlId, row.id).catch(() => {});
    await startRecordingFor(row);
  } else if (isTerminal(row.status)) {
    if (row.repCallControlId) await stopRingback(row.repCallControlId, row.id).catch(() => {});
    await hangupOtherLegs(row, ccid);
    if (await ptHooks.isPtCall(row.id)) await ptHooks.onCallEnded(row.id).catch((e) => log("pt call end", row.id, errText(e)));
    if (status && row.orderId) await logOrderEvent(row.orderId, "human_call_ended", { callId: row.id, status: row.status, durationMs: row.durationMs }).catch(() => {});
  }
}

export { TERMINAL };
