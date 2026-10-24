import { Fragment, type ReactNode } from "react";

// Dictionary strings carry a little inline markup: <b>, <em>, <s>, <br>. Rich turns it into React nodes
// (our own copy only, never user input). fmt() fills {placeholders}.
// Russian needs three plural forms: {n|one|few|many} becomes the form that agrees with the value of n
// ("{n} {n|коробка|коробки|коробок}" -> "5 коробок"). The other languages do not use this syntax.

/** Russian plural form for a count; for a range such as "2-4" the last number decides ("2-4 дня"). */
export function pluralRu(value: string | number, one: string, few: string, many: string): string {
  const m = String(value).match(/(\d+)\D*$/);
  if (!m) return many;
  const n = Number(m[1]) % 100;
  const n10 = n % 10;
  if (n10 === 1 && n !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n < 12 || n > 14)) return few;
  return many;
}

export function fmt(s: string, vars: Record<string, string | number> = {}): string {
  return s
    .replace(/\{(\w+)\|([^{}|]*)\|([^{}|]*)\|([^{}|]*)\}/g, (m, k, one, few, many) => (k in vars ? pluralRu(vars[k], one, few, many) : m))
    .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

const TAG = /<(b|em|s)>(.*?)<\/\1>|<br\s*\/?>/g;

export function rich(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of s.matchAll(TAG)) {
    if (m.index! > last) out.push(s.slice(last, m.index));
    if (m[0].startsWith("<br")) out.push(<br key={i++} />);
    else {
      const Tag = m[1] as "b" | "em" | "s";
      out.push(<Tag key={i++}>{m[2]}</Tag>);
    }
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function Rich({ s, vars }: { s: string; vars?: Record<string, string | number> }) {
  return <Fragment>{rich(vars ? fmt(s, vars) : s)}</Fragment>;
}
