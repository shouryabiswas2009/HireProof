/*
 * Runs the SAME test cases as tests/test_features.py through the JavaScript
 * feature extractor, and checks it produces the same numbers.
 *
 * This is the safety net for the one real weakness in this project's design:
 * feature extraction exists twice, once in Python for training and once in
 * JavaScript for the live site. If the two ever disagree, the website feeds
 * the model different numbers than it learned from, and the scores silently
 * become meaningless. Nothing would crash; it would just be wrong.
 *
 * Run from the repo root:
 *     node tests/js/test_features.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  initPhrases, normalize, extractFeatures, maxYearsRequired, FEATURE_NAMES,
} from "../../docs/features.js?v=13";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

const readJson = (...parts) =>
  JSON.parse(readFileSync(join(repoRoot, ...parts), "utf-8"));

initPhrases(readJson("shared", "phrases.json"));
const fixtures = readJson("tests", "fixtures", "feature_cases.json");

let failures = 0;
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`  FAIL: ${message}`);
  }
}

// --- The shared cases, the whole point of this file ---
for (const testCase of fixtures.cases) {
  const actual = extractFeatures(testCase.text);
  for (const [name, expected] of Object.entries(testCase.expected)) {
    if (name.startsWith("_")) continue; // notes for humans, not features
    const difference = Math.abs(actual[name] - expected);
    check(
      difference <= fixtures.tolerance,
      `${testCase.name}: feature '${name}' was ${actual[name]}, expected ${expected}`
    );
  }
}

// --- A few JavaScript-specific traps worth guarding ---

// "".split(" ") returns [""] in JavaScript, so an empty posting could be
// counted as one word and give log_word_count = ln(2) instead of 0.
check(extractFeatures("").log_word_count === 0, "empty text must have log_word_count 0");

// Leading whitespace produces an empty first element when splitting in
// JavaScript but not in Python; the filter(Boolean) in normalize handles it.
check(normalize("   a   b  ") === "a b", "normalize must trim and collapse whitespace");

// A "g" regex keeps its lastIndex between calls, so running the same
// extractor twice could return different answers if it were not reset.
const first = extractFeatures("Requires 6 years of experience for this entry level role.");
const second = extractFeatures("Requires 6 years of experience for this entry level role.");
check(
  first.experience_mismatch === second.experience_mismatch,
  "repeated calls must give identical results (regex lastIndex must be reset)"
);
check(maxYearsRequired(normalize("needs 4 years experience")) === 4, "years parsed");

// Every named feature must actually be produced.
const produced = Object.keys(extractFeatures("some text"));
for (const name of FEATURE_NAMES) {
  check(produced.includes(name), `feature '${name}' missing from output`);
}
check(produced.length === FEATURE_NAMES.length, "no unexpected extra features");

// Every value must be a real, finite number.
for (const testCase of fixtures.cases) {
  for (const [name, value] of Object.entries(extractFeatures(testCase.text))) {
    check(Number.isFinite(value), `${testCase.name}/${name} was ${value}`);
  }
}

console.log(`\n  ${checks - failures}/${checks} checks passed.`);
if (failures > 0) {
  console.error(`  ${failures} FAILED - the Python and JavaScript extractors disagree.`);
  process.exit(1);
}
console.log("  Python and JavaScript feature extractors agree.\n");
