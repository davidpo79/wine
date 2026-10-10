/** Converts a wall-clock date/time in Europe/Lisbon to the matching UTC instant (handles WET/WEST). */
export function lisbonToUtc(date: string, time = "00:00") {
  const guess = new Date(`${date}T${time}:00Z`);
  const lisbon = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Lisbon" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (lisbon.getTime() - utc.getTime()));
}

/** "YYYY-MM-DD" of an instant in Europe/Lisbon. */
export function lisbonDate(d = new Date()) {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
}

export function lisbonDateTime(d: Date | null | undefined) {
  if (!d) return "";
  return d.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "short", timeStyle: "short" });
}

export function startOfLisbonDay(daysAgo = 0) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return lisbonToUtc(lisbonDate(d), "00:00");
}
