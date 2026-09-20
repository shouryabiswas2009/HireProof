/*
 * Tests for the highlight offset mapping.
 *
 * This is the piece most likely to be subtly wrong: it converts positions
 * found in the NORMALISED text back to positions in what the visitor
 * actually pasted. Off-by-one errors here would underline the wrong words,
 * which is worse than not underlining anything, and would look like a
 * model bug rather than a rendering one.
 *
 * Run from the repo root:  node tests/js/test_highlight.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizeWithMap, findMatches, annotate } from "../../docs/highlight.js";
import { initPhrases, normalize } from "../../docs/features.js?v=13";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const config = JSON.parse(
  readFileSync(join(repoRoot, "shared", "phrases.json"), "utf-8")
);
initPhrases(config);

let checks = 0, failures = 0;
function check(condition, message) {
  checks++;
  if (!condition) { failures++; console.error(`  FAIL: ${message}`); }
}
function eq(actual, expected, message) {
  check(actual === expected, `${message}\n        got:      ${JSON.stringify(actual)}\n        expected: ${JSON.stringify(expected)}`);
}

// --- The normalised string must match features.js exactly, or the model
// --- and the highlighter would be looking at different text.
for (const sample of [
  "WE ARE A FAST-PACED,\r\n   DYNAMIC   ENVIRONMENT.",
  "  leading and trailing   ",
  "Café role\n\nwith accents",
  "",
  "one",
]) {
  eq(normalizeWithMap(sample).normalized, normalize(sample),
     `normalizeWithMap must agree with features.js normalize() for ${JSON.stringify(sample)}`);
}

// --- Every map entry must point at a real character, and slicing the
// --- original by the map must recover the matched words.
{
  const text = "WE ARE A FAST-PACED,\r\n   DYNAMIC   ENVIRONMENT. You will wear many hats.";
  const { normalized, map } = normalizeWithMap(text);
  eq(map.length, normalized.length, "map must have one entry per normalised character");
  check(map.every(i => i >= 0 && i < text.length), "every map entry is inside the original text");
  check(map.every((v, i) => i === 0 || v >= map[i - 1]), "map indices must be non-decreasing");

  const i = normalized.indexOf("wear many hats");
  const span = [map[i], map[i + "wear many hats".length - 1] + 1];
  eq(text.slice(span[0], span[1]), "wear many hats", "recovers a phrase spanning normal spaces");

  const j = normalized.indexOf("dynamic environment");
  const span2 = [map[j], map[j + "dynamic environment".length - 1] + 1];
  eq(text.slice(span2[0], span2[1]), "DYNAMIC   ENVIRONMENT",
     "recovers a phrase across collapsed whitespace, preserving original case");
}

// --- Matches must land on the right words.
{
  const text = "We are a fast-paced team. Salary: $95,000 per year. Email jo@example.com.";
  const found = findMatches(text, config);
  const byFeature = {};
  for (const m of found) (byFeature[m.feature] ||= []).push(text.slice(m.start, m.end));

  check(byFeature.buzzword_density?.includes("fast-paced"), "finds the buzzword");
  check(byFeature.has_salary_range?.length === 1, "finds one salary figure");
  check(byFeature.has_contact_email?.[0] === "jo@example.com", "finds the email exactly");
  // Every span must slice back to something non-empty and in range.
  check(found.every(m => m.start < m.end && m.end <= text.length), "all spans are in range");
}

// --- Overlapping phrases must not produce nested or crossed spans.
{
  const text = "This is a fast-paced, fast paced, work hard play hard team player environment.";
  const found = findMatches(text, config);
  const sorted = [...found].sort((a, b) => a.start - b.start);
  let ok = true;
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) ok = false;
  check(ok, "no two highlight spans may overlap");
}

// --- The rendered HTML must be safe and must preserve the text exactly.
{
  const text = 'A <script>alert("x")</script> fast-paced role & more';
  const { html } = annotate(text, config, { buzzword_density: 1 });
  check(!html.includes("<script>"), "raw script tags must be escaped");
  check(html.includes("&lt;script&gt;"), "script tag is escaped, not stripped");
  check(html.includes("&amp;"), "ampersand is escaped");
  // Strip the marks and unescape: we must get the original text back.
  const roundTrip = html
    .replace(/<\/?mark[^>]*>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  eq(roundTrip, text, "annotating must not add, drop or reorder any character");
}

// --- Direction controls the colour class.
{
  const text = "We are a fast-paced team with a competitive salary.";
  const up = annotate(text, config, { buzzword_density: 1 }).html;
  const down = annotate(text, config, { buzzword_density: -1 }).html;
  check(up.includes("hl-raise"), "positive contribution renders as raise");
  check(down.includes("hl-lower"), "negative contribution renders as lower");
}

// --- A phrase must NOT be highlighted when its feature did not fire.
{
  // Senior posting: the years pattern matches, but experience_mismatch
  // needs a junior title too, so the feature is zero and nothing here
  // should be marked for it.
  const text = "Senior Engineer. We require 8+ years of experience building systems.";
  const ungated = annotate(text, config, { experience_mismatch: 1 }).html;
  const gated = annotate(text, config, { experience_mismatch: 1 },
                         { experience_mismatch: 0 }).html;
  check(ungated.includes('data-signal="experience_mismatch"'),
        "without gating the years phrase is marked");
  check(!gated.includes('data-signal="experience_mismatch"'),
        "gating suppresses a phrase whose feature scored zero");

  // And it must still mark it when the feature DID fire.
  const junior = "Entry level developer needed, must have 8+ years of experience.";
  const fired = annotate(junior, config, { experience_mismatch: 1 },
                         { experience_mismatch: 1 }).html;
  check(fired.includes('data-signal="experience_mismatch"'),
        "a feature that fired still gets its phrase marked");
}

// --- Empty and whitespace-only input must not throw.
for (const edge of ["", "   ", "\n\n\n"]) {
  const { html } = annotate(edge, config, {});
  check(typeof html === "string", `annotate survives ${JSON.stringify(edge)}`);
}

console.log(`\n  ${checks - failures}/${checks} checks passed.`);
if (failures) { console.error(`  ${failures} FAILED`); process.exit(1); }
console.log("  Highlight offsets map back to the original text correctly.\n");
