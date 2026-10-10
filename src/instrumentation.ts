// Starts the abandoned-checkout worker inside the Next.js server (Node runtime only).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
