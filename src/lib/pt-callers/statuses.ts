// Lead statuses and the sets the rules use. Pure: safe in the browser (no env, no database).

export const STATUSES = [
  "new",
  "ready",
  "calling",
  "no_answer",
  "callback",
  "interested",
  "not_interested",
  "wrong_number",
  "opt_out",
  "blocked",
  "enrichment_pending",
  "failed",
] as const;
export type LeadStatus = (typeof STATUSES)[number];

/** Business outcomes a rep may set after a call. Opt-out has its own always-visible button. */
export const REP_OUTCOMES: LeadStatus[] = ["no_answer", "callback", "interested", "not_interested", "wrong_number"];
/** Statuses a lead can be dialed from. */
export const DIALABLE: LeadStatus[] = ["ready", "no_answer", "callback"];
/** Never leave these (opt-out and blocks are permanent). */
export const FINAL_BLOCKED: LeadStatus[] = ["opt_out", "blocked"];
