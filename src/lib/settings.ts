import { db, schema } from "@/db";
import { DEFAULT_SETTINGS, type Settings } from "./settings-defaults";

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(schema.settings);
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await db
    .insert(schema.settings)
    .values({ key, value: value as unknown })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: value as unknown } });
}
