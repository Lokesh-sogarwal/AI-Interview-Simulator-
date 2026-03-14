export function isValidEmail(email: string) {
  if (!email) return false;
  if (email.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPassword(password: string) {
  if (!password) return false;
  // bcrypt truncates at 72 bytes; keep a safe char limit here.
  if (password.length < 8) return false;
  if (password.length > 72) return false;
  return true;
}

export function clampString(input: string, maxLen: number) {
  if (input.length <= maxLen) return input;
  return input.slice(0, maxLen);
}
