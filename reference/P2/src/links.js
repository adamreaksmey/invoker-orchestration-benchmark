import { randomBytes } from "node:crypto";

const CODE_LENGTH = 6;
const CODE_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CUSTOM_CODE_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function generateCode() {
  return Array.from(randomBytes(CODE_LENGTH), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export function isValidUrl(value) {
  if (typeof value !== "string") return false;
  try {
    return ALLOWED_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isValidCustomCode(value) {
  return typeof value === "string" && CUSTOM_CODE_PATTERN.test(value);
}

export function summarizeClicks(code, url, clicks) {
  const clicksByDay = {};
  for (const click of clicks) {
    const day = new Date(click.clicked_at).toISOString().slice(0, 10);
    clicksByDay[day] = (clicksByDay[day] ?? 0) + 1;
  }
  const latest = clicks.at(-1);
  return { code, url, totalClicks: clicks.length, lastClickedAt: latest ? new Date(latest.clicked_at).toISOString() : null, clicksByDay };
}
