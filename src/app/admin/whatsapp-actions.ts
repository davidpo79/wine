"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { loadOutboundSettings } from "@/lib/outbound-settings";
import { waSend } from "@/lib/pt-callers/whatsapp";
import type { FormState } from "./actions";

/** Admin → WhatsApp: the template (first contact, with the person's consent) or free text inside the 24 h window. */
export async function waSendAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAdmin({ allowPtCaller: true });
  if (me.role === "fulfilment") return { error: "Not allowed." };
  await loadOutboundSettings();
  const leadId = Number(fd.get("lead"));
  if (!Number.isInteger(leadId) || leadId <= 0) return { error: "Unknown lead." };
  const r =
    fd.get("mode") === "template"
      ? await waSend(me, leadId, { mode: "template", optIn: fd.get("opt_in") === "on" })
      : await waSend(me, leadId, { mode: "text", text: String(fd.get("text") ?? "") });
  revalidatePath(`/admin/whatsapp/${leadId}`);
  return r.ok ? { ok: "Sent." } : { error: r.reason };
}
