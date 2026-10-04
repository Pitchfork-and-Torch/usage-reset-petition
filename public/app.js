const handleInput = document.getElementById("handle");
const codeForm = document.getElementById("code-form");
const signForm = document.getElementById("sign-form");
const lineBox = document.getElementById("line-box");
const lineField = document.getElementById("line");
const postLink = document.getElementById("post-x");
const codeNote = document.getElementById("code-note");
const statusEl = document.getElementById("form-status");
const countEl = document.getElementById("count");
const emptyEl = document.getElementById("empty");
const showingEl = document.getElementById("showing");
const signersEl = document.getElementById("signers");
const companyInput = document.getElementById("company");

const nyTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function setStatus(message, kind) {
  statusEl.textContent = message || "";
  if (kind) statusEl.dataset.kind = kind;
  else delete statusEl.dataset.kind;
}

function currentHandle() {
  return handleInput.value.trim().replace(/^@+/, "");
}

function safePostUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "x.com" && host !== "twitter.com") return "";
    return url.href;
  } catch {
    return "";
  }
}

function renderLedger(data) {
  const count = Number(data.count) || 0;
  countEl.textContent = String(count);
  emptyEl.hidden = count > 0;
  showingEl.hidden = count <= 100;
  if (count > 100) showingEl.textContent = "Showing the latest 100.";
  signersEl.replaceChildren();
  for (const signer of data.signers || []) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    const href = safePostUrl(signer.url);
    link.href = href || "https://x.com/";
    link.rel = "noopener noreferrer";
    link.textContent = "@" + String(signer.handle || "");
    const quote = document.createElement("p");
    quote.textContent = signer.excerpt || "";
    const time = document.createElement("time");
    if (signer.signedAt) {
      time.dateTime = signer.signedAt;
      const parsed = new Date(signer.signedAt);
      time.textContent = Number.isNaN(parsed.getTime()) ? "" : nyTime.format(parsed) + " New York";
    }
    item.append(link, quote, time);
    signersEl.append(item);
  }
}

async function loadLedger() {
  const response = await fetch("/api/ledger", { headers: { Accept: "application/json" } });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Could not load signatures.");
  renderLedger(data);
}

codeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Getting a line...");
  try {
    const response = await fetch("/api/code", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ handle: currentHandle(), company: companyInput.value }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      setStatus(data.error || "Could not make a line.", "bad");
      return;
    }
    if (data.already) {
      lineBox.hidden = true;
      setStatus("@" + data.signer.handle + " is already on the list.", "ok");
      await loadLedger();
      return;
    }
    lineField.value = data.line;
    postLink.href = data.intentUrl;
    const until = new Date(data.expiresAt);
    const when = Number.isNaN(until.getTime()) ? "24 hours" : nyTime.format(until) + " New York";
    codeNote.textContent = "Code " + data.code + " works until " + when + ". Post it from @" + data.handle + ".";
    lineBox.hidden = false;
    setStatus("Post the line, then paste the link below.", "ok");
  } catch {
    setStatus("Could not reach the petition. Try again.", "bad");
  }
});

document.getElementById("copy-line").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(lineField.value);
    setStatus("Line copied.", "ok");
  } catch {
    lineField.focus();
    lineField.select();
    setStatus("Select the line and copy it.", "bad");
  }
});

signForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Checking the post...");
  try {
    const response = await fetch("/api/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        handle: currentHandle(),
        postUrl: document.getElementById("post-url").value.trim(),
        company: companyInput.value,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      setStatus(data.error || "Could not sign.", "bad");
      return;
    }
    setStatus(data.already ? "@" + data.signer.handle + " is already on the list." : "Signed. @" + data.signer.handle + " is on the list.", "ok");
    await loadLedger();
  } catch {
    setStatus("Could not reach the petition. Try again.", "bad");
  }
});

loadLedger().catch(() => {
  setStatus("Could not load the signature list.", "bad");
});
