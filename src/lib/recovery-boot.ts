// Abandoned-checkout channels at server start (20/11/2026): make sure the Spanish call assistant and the Black Friday
// WhatsApp template exist, then log one line per channel, so the logs show what will really go out.
import { loadOutboundSettings, outboundEnv, saveOutbound, savedOutbound } from "./outbound-settings";
import { assistantFor, ensureSpanishAssistant, telnyxConfigured } from "./telnyx";
import { approvedTemplateLanguages, bfRecoveryTemplateStatus, createBfRecoveryTemplate, whatsappMissing } from "./whatsapp";

export async function recoveryBoot() {
  await loadOutboundSettings(true);
  const env = outboundEnv();
  const log = (m: string) => console.log(`[recovery-boot] ${m}`);
  const step = async (name: string, f: () => Promise<string>) => {
    try {
      log(`${name}: ${await f()}`);
    } catch (e) {
      console.error(`[recovery-boot] ${name} failed:`, e instanceof Error ? e.message : e);
    }
  };
  await step("spanish assistant", () =>
    ensureSpanishAssistant(async (id) => {
      await saveOutbound({ ...savedOutbound(), TELNYX_ASSISTANT_ID_ES: id });
    }),
  );
  if (env.TELNYX_API_KEY && env.WHATSAPP_WABA_ID) {
    await step("black friday template", async () => (await createBfRecoveryTemplate()).message);
    await step("black friday template status", bfRecoveryTemplateStatus);
  }
  const assistants = ["pt", "es", "de", "nl", "fr", "ru", "en"].map((l) => `${l}=${assistantFor(l) ? "yes" : "no"}`).join(" ");
  const wa = whatsappMissing();
  log(
    `channels: email=${process.env.RESEND_API_KEY ? "yes" : "no"} whatsapp=${wa.length ? `missing ${wa.join(",")}` : "yes"} (provider ${env.WHATSAPP_PROVIDER === "meta" ? "meta" : "telnyx"}, trilogia langs: pt ${approvedTemplateLanguages().join(" ")}) sms=${telnyxConfigured("sms") ? "yes" : "no"} voice=${telnyxConfigured("voice") ? "yes" : "no"} assistants: ${assistants}`,
  );
}
