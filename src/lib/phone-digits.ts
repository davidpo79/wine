/**
 * What a typed phone number really holds: its digits, and a "+" only in front. Separators of any kind go (spaces,
 * dashes and en dashes, dots, slashes, brackets) and so do invisible characters: phones paste contact numbers
 * wrapped in Unicode direction marks (U+202A/U+202C) that the field shows as nothing, and the number was refused.
 */
export function phoneDigits(input: string): string {
  const s = input.trim();
  const plus = /^[\s‎‏‪-‮⁦-⁩]*\+/.test(s);
  const d = s.replace(/\D/g, "");
  return plus ? `+${d}` : d;
}
