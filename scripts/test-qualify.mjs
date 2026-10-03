import { decide, qualifies, signingLine } from "../src/qualify.mjs";

const posts = {
  tibor: "2106408022696477145",
  grokbotter: "2106414275820396562",
  michael: "2106414897982791729",
  tlm: "2106421671725015297",
  jon: "2106122988097519712",
};

async function load(id) {
  const response = await fetch(`https://api.fxtwitter.com/i/status/${id}`, {
    headers: { "User-Agent": "usage-reset-petition", Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`lookup ${id} ${response.status}`);
  const data = await response.json();
  return data.tweet;
}

function assert(name, condition) {
  if (!condition) {
    console.error("FAIL", name);
    process.exitCode = 1;
  } else {
    console.log("ok", name);
  }
}

const tweets = {};
for (const [name, id] of Object.entries(posts)) {
  tweets[name] = await load(id);
}

assert("tibor supports", qualifies(tweets.tibor).ok === true);
assert("jon names the time", qualifies(tweets.jon).ok === true);
assert("grokbotter rejected", qualifies(tweets.grokbotter).ok === false);
assert("michael rejected", qualifies(tweets.michael).ok === false);
assert("tlm too vague", qualifies(tweets.tlm).ok === false);

const refusal = {
  text: "I will not sign a Friday 4:45 reset petition",
  author: { screen_name: "someone" },
  quote: { id: "2106122988097519712" },
};
assert("negation rejected", qualifies(refusal).ok === false);

const code = "URP-TEST";
const good = {
  text: signingLine(code),
  author: { screen_name: "CaseCheck", name: "Case" },
  id: "1",
};
assert("issued line passes", decide(good, "casecheck", code).ok === true);
assert("wrong author fails", decide(good, "other", code).ok === false);
assert("missing code fails", decide(tweets.tibor, "tibor_tee", code).ok === false);

if (process.exitCode) process.exit(process.exitCode);
console.log("qualify checks passed");
