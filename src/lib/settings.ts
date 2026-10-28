export type StitchingHead = {
  id: string;
  label: string;
  sortOrder: number;
};

export type StitchingGarment = {
  id: string;
  name: string;
  sortOrder: number;
  measurements: StitchingHead[];
};

export type StitchingProcess = {
  id: string;
  name: string;
  sortOrder: number;
};

const NAME_MAX = 40;

const CORRECTIONS: readonly [string, string][] = [
  ["SHOLDER", "SHOULDER"],
  ["EMBROIDARY WORK", "EMBROIDERY WORK"],
  ["PRINCES CUT", "PRINCESS CUT"],
  ["INNER WRAR", "INNERWEAR"],
  ["SILPS", "SLIPS"],
  ["KURTHI", "KURTI"],
  ["HAND KACHIF", "HAND KERCHIEF"],
];

export function correctedSpelling(value: string): string {
  let name = value;
  for (const [from, to] of CORRECTIONS) name = name.replaceAll(from, to);
  return name;
}

export function shopName(value: string): string | null {
  const name = correctedSpelling(value.trim().replace(/\s+/g, " ").toUpperCase());
  if (!name || name.length > NAME_MAX) return null;
  return name;
}

export function nextSortOrder(existing: readonly number[]): number {
  return existing.reduce((max, value) => Math.max(max, value), 0) + 1;
}
