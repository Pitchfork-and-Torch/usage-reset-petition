export const SOURCE_IDS = new Set([
  "2106122988097519712",
  "2106408022696477145",
]);

export const HOST = "usageresetpetition.jonbailey.xyz";

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

export function normHandle(value) {
  return String(value || "").trim().replace(/^@+/, "");
}

export function validHandle(value) {
  return HANDLE_RE.test(normHandle(value));
}

export function parsePostUrl(input) {
  let url;
  try {
    url = new URL(String(input || "").trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!["x.com", "twitter.com", "mobile.twitter.com", "mobile.x.com"].includes(host)) {
    return null;
  }
  const named = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/);
  if (named && named[1].toLowerCase() !== "i") {
    return { handle: named[1], id: named[2] };
  }
  const bare = url.pathname.match(/^\/i\/(?:web\/)?status\/(\d+)/);
  if (bare) return { handle: null, id: bare[1] };
  return null;
}

export function signingLine(code) {
  return `I support the Friday 4:45pm New York Grok Bot usage reset. ${code} https://${HOST}/`;
}

export function excerpt(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function fold(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function negated(text) {
  return (
    /\b(not|never|won'?t|wouldn'?t|don'?t|do not|cannot|can't)\b.{0,40}\b(sign|support|agree)\b/.test(text) ||
    /\b(against|oppose|no thanks)\b/.test(text) ||
    /\b(don'?t|do not|not|never)\b.{0,24}\b(reset|friday)\b/.test(text)
  );
}

export function qualifies(tweet) {
  const text = fold(tweet && tweet.text);
  const quoteId = tweet && tweet.quote && tweet.quote.id != null ? String(tweet.quote.id) : "";
  const replyId = tweet && tweet.replying_to_status != null ? String(tweet.replying_to_status) : "";
  const linked = SOURCE_IDS.has(quoteId) || SOURCE_IDS.has(replyId);
  const mentionsHost = text.includes(HOST);
  const hasTime = /4[:.]45|16:45/.test(text);
  const hasTopic = /friday|reset|usage|petition|sign/.test(text);
  const positive = /\bsign\b|\bagree\b|\bsupport\b|\byes\b|i'm in|im in|count me|\bpetition\b|4[:.]45/.test(text);
  const otherSchedule = /\b(wednesday|saturday|daily|every day)\b/.test(text) && !hasTime;

  if (negated(text)) {
    return { ok: false, reason: "This post reads as a no." };
  }
  if (otherSchedule) {
    return { ok: false, reason: "This post asks for a different schedule. This page records the Friday 4:45pm New York reset only." };
  }
  if (mentionsHost || (hasTime && hasTopic) || (linked && positive)) {
    return { ok: true, reason: "supports the Friday 4:45pm New York reset" };
  }
  if (linked) {
    return { ok: false, reason: "A reply or quote counts only when it supports the Friday 4:45pm New York reset." };
  }
  return { ok: false, reason: "The post must support a Friday 4:45pm New York reset, or include the signing line from this page." };
}

export function decide(tweet, expectedHandle, expectedCode) {
  const author = normHandle(tweet && tweet.author && tweet.author.screen_name);
  const wanted = normHandle(expectedHandle);
  if (!author || author.toLowerCase() !== wanted.toLowerCase()) {
    return { ok: false, error: `That post is not from @${wanted}.` };
  }
  const code = String(expectedCode || "").toUpperCase();
  const text = String((tweet && tweet.text) || "").toUpperCase();
  if (!code || !text.includes(code)) {
    return { ok: false, error: "That post does not contain your signing code. Post the full line, then paste the link." };
  }
  const support = qualifies(tweet);
  if (!support.ok) return { ok: false, error: support.reason };
  return { ok: true };
}
