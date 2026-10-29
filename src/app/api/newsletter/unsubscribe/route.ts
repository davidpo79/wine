import { linkPage } from "@/lib/link-page";
import { unsubscribe, verifyUnsubscribe } from "@/lib/newsletter";

// Unsubscribe link in every newsletter. GET: the link in the footer (shows a confirmation page).
// POST: one-click unsubscribe sent by Gmail/Yahoo from the List-Unsubscribe header.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = verifyUnsubscribe(u.searchParams.get("c"), u.searchParams.get("t"));
  if (id) await unsubscribe(id);
  return linkPage("pt", id ? "unsubDone" : "invalidLink");
}

export async function POST(req: Request) {
  const u = new URL(req.url);
  const id = verifyUnsubscribe(u.searchParams.get("c"), u.searchParams.get("t"));
  if (!id) return new Response("invalid link", { status: 400 });
  await unsubscribe(id);
  return new Response(null, { status: 200 });
}
