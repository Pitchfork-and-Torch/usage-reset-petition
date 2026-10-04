import {
  HOST,
  decide,
  excerpt,
  normHandle,
  parsePostUrl,
  signingLine,
  validHandle,
} from "./qualify.mjs";

const CODE_TTL_SECONDS = 60 * 60 * 24;
const LEDGER_KEY = "ledger";
const SIGNER_PREFIX = "signer:";
const SIGNER_CAP = 2000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }
    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("X-Frame-Options", "DENY");
    const path = url.pathname;
    if (path === "/" || path.endsWith(".html") || path.endsWith(".js") || path.endsWith(".css")) {
      headers.set("Cache-Control", "public, max-age=300");
    }
    return new Response(asset.body, { status: asset.status, headers });
  },
};

async function handleApi(request, env, url) {
  if (url.pathname === "/api/ledger" && request.method === "GET") {
    const ledger = await readLedger(env);
    return json({
      ok: true,
      count: ledger.count,
      signers: ledger.signers,
    });
  }
  if (url.pathname === "/api/code" && request.method === "POST") {
    return issueCode(request, env);
  }
  if (url.pathname === "/api/sign" && request.method === "POST") {
    return sign(request, env);
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }
  return json({ ok: false, error: "Not found." }, 404);
}

async function issueCode(request, env) {
  if (await limited(env, request, "code", 10)) {
    return json({ ok: false, error: "Too many attempts. Wait ten minutes." }, 429);
  }
  const body = await readBody(request);
  if (body.error) return json({ ok: false, error: body.error }, 400);
  if (String(body.value.company || "").trim()) {
    return json({ ok: false, error: "Leave the extra field blank." }, 400);
  }
  const handle = normHandle(body.value.handle);
  if (!validHandle(handle)) {
    return json({ ok: false, error: "Enter an X handle. Letters, numbers, underscore. 15 characters max." }, 400);
  }
  const existing = await getSigner(env, handle);
  if (existing) {
    return json({ ok: true, already: true, signer: publicSigner(existing) });
  }
  const key = codeKey(handle);
  const current = await env.SIGNS.get(key, "json");
  const now = Date.now();
  let record = current;
  if (!record || !record.code || Date.parse(record.expiresAt) <= now) {
    const code = makeCode();
    record = {
      code,
      line: signingLine(code),
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + CODE_TTL_SECONDS * 1000).toISOString(),
    };
    await env.SIGNS.put(key, JSON.stringify(record), { expirationTtl: CODE_TTL_SECONDS });
  }
  return json({
    ok: true,
    already: false,
    handle,
    code: record.code,
    line: record.line,
    intentUrl: "https://x.com/intent/post?text=" + encodeURIComponent(record.line),
    expiresAt: record.expiresAt,
  });
}

async function sign(request, env) {
  if (await limited(env, request, "sign", 8)) {
    return json({ ok: false, error: "Too many attempts. Wait ten minutes." }, 429);
  }
  const body = await readBody(request);
  if (body.error) return json({ ok: false, error: body.error }, 400);
  if (String(body.value.company || "").trim()) {
    return json({ ok: false, error: "Leave the extra field blank." }, 400);
  }
  const handle = normHandle(body.value.handle);
  if (!validHandle(handle)) {
    return json({ ok: false, error: "Enter the X handle that posted." }, 400);
  }
  const parsed = parsePostUrl(body.value.postUrl);
  if (!parsed) {
    return json({ ok: false, error: "Paste a link like https://x.com/name/status/123" }, 400);
  }
  if (parsed.handle && parsed.handle.toLowerCase() !== handle.toLowerCase()) {
    return json({ ok: false, error: `That link is not a post from @${handle}.` }, 400);
  }

  const existing = await getSigner(env, handle);
  if (existing) {
    return json({ ok: true, already: true, signer: publicSigner(existing) });
  }
  const count = await signerCount(env);
  if (count >= SIGNER_CAP) {
    return json({ ok: false, error: "The ledger is full." }, 403);
  }

  const codeRecord = await env.SIGNS.get(codeKey(handle), "json");
  if (!codeRecord || !codeRecord.code || Date.parse(codeRecord.expiresAt) <= Date.now()) {
    return json({ ok: false, error: "Get a signing code first. Codes last 24 hours." }, 400);
  }

  const tweet = await lookupTweet(parsed.handle || handle, parsed.id);
  if (!tweet) {
    return json({ ok: false, error: "Could not read that public post. Check the link and try again." }, 400);
  }
  if (String(tweet.id) !== String(parsed.id)) {
    return json({ ok: false, error: "That link does not match the post that was read." }, 400);
  }
  const verdict = decide(tweet, handle, codeRecord.code);
  if (!verdict.ok) return json({ ok: false, error: verdict.error }, 400);

  const author = tweet.author.screen_name;
  const signer = {
    handle: author,
    name: cleanName(tweet.author.name),
    url: `https://x.com/${author}/status/${tweet.id}`,
    postId: String(tweet.id),
    excerpt: excerpt(tweet.text),
    signedAt: new Date().toISOString(),
  };
  await env.SIGNS.put(signerKey(handle), JSON.stringify(signer));
  await env.SIGNS.delete(codeKey(handle));
  return json({ ok: true, already: false, signer: publicSigner(signer), count: count + 1 });
}

async function lookupTweet(handle, id) {
  const endpoint = `https://api.fxtwitter.com/${encodeURIComponent(handle)}/status/${encodeURIComponent(id)}`;
  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "User-Agent": "usage-reset-petition",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data && data.tweet ? data.tweet : null;
  } catch {
    return null;
  }
}

function signerKey(handle) {
  return SIGNER_PREFIX + String(handle || "").toLowerCase();
}

async function listKeys(kv, prefix) {
  const names = [];
  let cursor;
  do {
    const opts = { prefix };
    if (cursor) opts.cursor = cursor;
    const page = await kv.list(opts);
    for (const item of page.keys || []) names.push(item.name);
    cursor = page.list_complete ? "" : page.cursor || "";
  } while (cursor);
  return names;
}

async function migrateLegacyLedger(env) {
  const rows = await env.SIGNS.get(LEDGER_KEY, "json");
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const handle = String((row && row.handle) || "").trim().toLowerCase();
    if (!handle) continue;
    const key = signerKey(handle);
    const existing = await env.SIGNS.get(key);
    if (!existing) await env.SIGNS.put(key, JSON.stringify(row));
  }
  await env.SIGNS.delete(LEDGER_KEY);
}

async function getSigner(env, handle) {
  await migrateLegacyLedger(env);
  return env.SIGNS.get(signerKey(handle), "json");
}

async function signerCount(env) {
  await migrateLegacyLedger(env);
  const names = await listKeys(env.SIGNS, SIGNER_PREFIX);
  return names.length;
}

async function readLedger(env) {
  await migrateLegacyLedger(env);
  const names = await listKeys(env.SIGNS, SIGNER_PREFIX);
  const rows = [];
  for (const name of names) {
    const row = await env.SIGNS.get(name, "json");
    if (!row || !row.handle) continue;
    rows.push(publicSigner(row));
  }
  rows.sort((a, b) => String(b.signedAt || "").localeCompare(String(a.signedAt || "")));
  return { count: rows.length, signers: rows.slice(0, 100) };
}

function publicSigner(row) {
  return {
    handle: row.handle,
    name: row.name || "",
    url: row.url,
    excerpt: row.excerpt || "",
    signedAt: row.signedAt,
  };
}

function codeKey(handle) {
  return `code:${handle.toLowerCase()}`;
}

function makeCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let code = "URP-";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

function cleanName(value) {
  return String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80);
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > 4000) return { error: "Too large." };
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Send JSON." };
    return { value };
  } catch {
    return { error: "Send JSON." };
  }
}

async function limited(env, request, bucket, max) {
  const ip = request.headers.get("CF-Connecting-IP") || "0";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${bucket}:${ip}:${HOST}`));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
  const prefix = `rl:${bucket}:${hex}:`;
  const existing = await listKeys(env.SIGNS, prefix);
  if (existing.length >= max) return true;
  const rand = new Uint8Array(8);
  crypto.getRandomValues(rand);
  const suffix = [...rand].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  await env.SIGNS.put(prefix + suffix, "1", { expirationTtl: 600 });
  return false;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}
