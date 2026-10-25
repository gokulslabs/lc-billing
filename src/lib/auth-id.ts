const STAFF_EMAIL_DOMAIN = "staff.ladiescollections.local";

export function signInEmail(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  return `${digits}@${STAFF_EMAIL_DOMAIN}`;
}
