/*
 * Tests for the input rules.
 *
 * The link test is the one worth checking carefully: "contains a URL" is
 * the obvious implementation and it is wrong, because plenty of real
 * postings include an application link or a contact address. These pin
 * the distinction between a posting that mentions a link and a paste that
 * IS a link.
 */

import { checkInput, looksLikeLink, MIN_WORDS, MAX_CHARS } from "../../docs/validate.js?v=24";

let checks = 0, failures = 0;
function check(condition, message) {
  checks++;
  if (!condition) { failures++; console.error(`  FAIL: ${message}`); }
}

const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

// --- Empty and short ---------------------------------------------------
check(checkInput("").code === "empty", "empty input is rejected");
check(checkInput("   \n  ").code === "empty", "whitespace only is empty");
check(checkInput(words(5)).code === "too-short", "5 words is too short");
check(checkInput(words(MIN_WORDS - 1)).code === "too-short", "one word under the floor is short");
check(checkInput(words(MIN_WORDS)).ok === true, "exactly the floor is accepted");
check(checkInput(words(MIN_WORDS + 50)).ok === true, "comfortably over the floor is accepted");

// The short message must name the actual count, so the reader can see
// how far off they are rather than guessing.
check(/\b7 words\b/.test(checkInput(words(7)).message), "short message states the word count");
check(/\b1 word\b/.test(checkInput("just one").message) === false, "two words is not '1 word'");
check(/\b1 word\b/.test(checkInput("solo").message), "one word is singular, not '1 words'");

// --- Too long ----------------------------------------------------------
check(checkInput("x".repeat(MAX_CHARS + 1)).code === "too-long", "over the cap is rejected");
check(checkInput("x".repeat(MAX_CHARS - 1)).code !== "too-long", "just under the cap is not");
// A huge paste must report its length, not silently truncate.
check(/characters/.test(checkInput("x".repeat(MAX_CHARS + 500)).message), "long message mentions characters");

// --- Links -------------------------------------------------------------
check(looksLikeLink("https://example.com/jobs/12345"), "a bare URL is a link");
check(looksLikeLink("  www.example.com/careers  "), "a bare www address is a link");
check(looksLikeLink("Check this out https://example.com/jobs/1"), "a URL plus a few words is a link");
check(checkInput("https://example.com/jobs/12345").code === "link", "a bare URL is refused as a link");

// The important negative cases: real postings that MENTION a link.
const postingWithLink = `Backend Engineer. Salary $95,000 to $115,000 per year.
You will report to Dana Okafor and own the billing service, writing Go and
Postgres every day. Our stack is Go, Postgres and Kubernetes, and you will
join the on-call rotation one week in six. Applications close on 14 March.
Apply at https://example.com/jobs/backend-engineer or email us for a chat.`;
check(!looksLikeLink(postingWithLink), "a full posting containing a link is NOT a link");
check(checkInput(postingWithLink).ok === true, "a full posting containing a link is accepted");
check(!looksLikeLink(words(40)), "text with no link at all is not a link");

// --- Ordering ----------------------------------------------------------
// A giant paste should be reported as too long, not misdiagnosed as short
// or as a link.
const giant = "https://example.com " + "x".repeat(MAX_CHARS);
check(checkInput(giant).code === "too-long", "length is reported before the link test");

// --- Shape -------------------------------------------------------------
for (const sample of ["", "short", words(40), "https://a.b"]) {
  const result = checkInput(sample);
  check(typeof result.ok === "boolean", "ok is a boolean");
  check(typeof result.words === "number", "words is a number");
  check(result.ok === (result.message === ""), "a message is present exactly when not ok");
}

console.log(`\n  ${checks - failures}/${checks} checks passed.`);
if (failures) { console.error(`  ${failures} FAILED`); process.exit(1); }
console.log("  Input rules behave.\n");
