"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { contactHref, inboxScope, inScope, sendManual } from "@/lib/inbox";
import type { FormState } from "./actions";

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Admin → Inbox: answer a conversation (threaded under the customer's last message) or write a new email. A sales rep may write only to her own leads. */
export async function inboxSendAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAdmin({ allowPtCaller: true });
  const to = String(fd.get("to") ?? "").trim().toLowerCase();
  const subject = String(fd.get("subject") ?? "").trim();
  const text = String(fd.get("text") ?? "").trim();
  const replyMessageId = String(fd.get("reply_message_id") ?? "").trim() || null;
  if (!EMAIL_RE.test(to)) return { error: "Invalid recipient email." };
  if (!inScope(await inboxScope(me), to)) return { error: "You can only write to your own leads." };
  if (!subject) return { error: "Subject is required." };
  if (!text) return { error: "Write a message first." };
  if (text.length > 20000) return { error: "Message too long." };
  const r = await sendManual({ to, subject, text, sentBy: me.email, replyTo: replyMessageId ? { messageId: replyMessageId, subject } : null });
  if ("error" in r && r.error) return { error: `Not sent: ${r.error}` };
  revalidatePath("/admin/inbox");
  revalidatePath(contactHref(to));
  if (fd.get("new") === "1") redirect(contactHref(to));
  return { ok: "Sent." };
}
