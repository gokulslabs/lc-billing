// Password rules for staff accounts. Kept strict because the old system used
// phone numbers as passwords.
export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (/^[\d\s+()-]+$/.test(password)) return "Don't use a phone number or only digits.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password))
    return "Mix letters and numbers.";
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 3 && password.toLowerCase().includes(local))
    return "Don't include your email name in the password.";
  return null;
}
