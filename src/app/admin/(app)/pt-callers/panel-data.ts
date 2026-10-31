import { schema } from "@/db";
import { businessLineRequired, creditCaps, dailyCallCap, dncRequired, legalBasisRequired, pilotNumbers, resultMode } from "@/lib/pt-callers/flags";
import { maskPhone } from "@/lib/pt-callers/phone";
import { humanCallMissing } from "@/lib/telnyx-call-control";
import { outboundEnv } from "@/lib/outbound-settings";

type Row = typeof schema.ptLeads.$inferSelect;

/** The setup facts the leads screen shows (no secrets, only whether they are set). */
export const panelConfig = () => ({
  apolloKey: !!process.env.APOLLO_API_KEY,
  webhookBase: outboundEnv().APOLLO_WEBHOOK_BASE_URL ?? null,
  resultMode: resultMode(),
  caps: creditCaps(),
  callCap: dailyCallCap(),
  callHours: outboundEnv().PT_CALLERS_CALL_HOURS ?? null,
  pilot: pilotNumbers(),
  telnyxMissing: humanCallMissing(),
  dncRequired: dncRequired(),
  legalBasisRequired: legalBasisRequired(),
  businessLineRequired: businessLineRequired(),
});

/** One lead row for the leads screen. A sales rep sees the phone masked: she calls by clicking, never by copying it. */
export const panelLead = (l: Row, maskForRep = false) => ({
  id: l.id,
  name: [l.firstName, l.lastName ?? l.lastNameMasked].filter(Boolean).join(" ") || "—",
  firstName: l.firstName,
  hasSurname: !!l.lastName,
  surnameMasked: !l.lastName && !!l.lastNameMasked,
  manual: l.source === "manual",
  linkedinUrl: l.linkedinUrl,
  email: l.email,
  emailedAt: l.emailedAt?.toISOString() ?? null,
  title: l.title,
  company: l.company,
  companySize: l.companySize,
  location: l.location,
  phone: maskForRep ? maskPhone(l.phone) : l.phone,
  phoneType: l.phoneType,
  numberClass: l.numberClass,
  legalBasis: l.legalBasis,
  status: l.status,
  approved: !!l.approvedAt,
  assignedTo: l.assignedTo,
  demo: l.demo,
  attempts: l.attempts,
  note: maskForRep ? null : l.note, // the rep's screen shows only her own notes (set by the page)
  failReason: l.failReason,
  fetchedAt: l.fetchedAt.toISOString(),
  retentionUntil: l.retentionUntil.toISOString(),
});
