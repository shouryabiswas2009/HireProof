/*
 * Prints the JavaScript model's probability for each posting handed to it.
 *
 * Not a test by itself: tests/test_parity_predictions.py runs this and
 * compares the numbers against Python's. Usage:
 *     node tests/js/predict.mjs <path-to-json-array-of-texts>
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initPhrases } from "../../docs/features.js?v=21";
import { initModel, score } from "../../docs/scorer.js?v=21";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const readJson = (...parts) =>
  JSON.parse(readFileSync(join(repoRoot, ...parts), "utf-8"));

initPhrases(readJson("docs", "phrases.json"));
initModel(readJson("docs", "model.json"));

const texts = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const results = texts.map((text) => {
  const { probability, z, contributions } = score(text);
  return {
    probability,
    z,
    contributions: Object.fromEntries(
      contributions.map((c) => [c.name, c.contribution])
    ),
  };
});

process.stdout.write(JSON.stringify(results));
