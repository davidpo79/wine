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
  "won",
] as const;
export type LeadStatus = (typeof STATUSES)[number];

/** Business outcomes a rep may set after a call. Opt-out has its own always-visible button. */
export const REP_OUTCOMES: LeadStatus[] = ["no_answer", "callback", "interested", "not_interested", "wrong_number", "won"];
/** Statuses a lead can be dialed from. */
export const DIALABLE: LeadStatus[] = ["ready", "no_answer", "callback"];
/** Never leave these (opt-out and blocks are permanent). */
export const FINAL_BLOCKED: LeadStatus[] = ["opt_out", "blocked"];

/** The sales pipeline board: five columns over the lead statuses. */
export const PIPELINE = [
  { key: "new", label: "New lead", statuses: ["new", "enrichment_pending", "ready", "calling"], drop: null },
  { key: "no_answer", label: "No answer", statuses: ["no_answer"], drop: "no_answer" },
  { key: "follow_up", label: "Follow-up", statuses: ["callback", "interested"], drop: "callback" },
  { key: "lost", label: "Not relevant", statuses: ["not_interested", "wrong_number", "failed", "opt_out", "blocked"], drop: "not_interested" },
  { key: "won", label: "Closed", statuses: ["won"], drop: "won" },
] as const satisfies readonly { key: string; label: string; statuses: readonly LeadStatus[]; drop: LeadStatus | null }[];
export type PipelineKey = (typeof PIPELINE)[number]["key"];

export const pipelineColumn = (status: string): PipelineKey => PIPELINE.find((c) => (c.statuses as readonly string[]).includes(status))?.key ?? "new";
