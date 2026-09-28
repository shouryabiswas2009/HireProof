"use client";

import { useEffect, useState } from "react";
// The ported plain-JS modules, kept byte-for-byte from the static site
// apart from import paths, so the browser half of the model is provably
// the same code that was running before.
import { loadPhrases } from "./features.js";
import { loadModel, score, band } from "./scorer.js";

export type Contribution = {
  name: string;
  label: string;
  neutralLabel: string;
  rawValue: number;
  contribution: number;
  points: number;
  strength: "strong" | "moderate" | "slight";
  clamped: boolean;
};

export type ScoreResult = {
  probability: number;
  z: number;
  contributions: Contribution[];
  rawFeatures: Record<string, number>;
  clampedFeatures: string[];
  outOfDistribution: boolean;
};

export type Band = { key: "low" | "medium" | "high"; title: string; blurb: string };

export type ModelFile = {
  trained_on: string;
  trained_date: string;
  n_examples: number;
  n_ghost: number;
  n_legit: number;
  feature_names: string[];
  feature_labels: Record<string, string>;
  feature_hypothesis?: Record<string, string>;
  weights: number[];
  metrics: Record<string, number>;
  warnings: string[];
  thresholds?: { low: number; high: number };
  out_of_fold?: { p: number; ghost: number }[];
};

/**
 * Load the two files the scorer needs, once, and hand back a ready flag.
 *
 * Both are static assets served from /public, so this is a plain fetch and
 * nothing about the posting text ever goes near the network - scoring
 * happens entirely in this browser, exactly as it did on the old static
 * site. The account gates the app and stores saved results; it does not
 * move the maths to a server.
 */
export function useScorer() {
  const [model, setModel] = useState<ModelFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadPhrases(), loadModel()])
      .then(([, loaded]: [unknown, ModelFile]) => {
        if (!cancelled) setModel(loaded);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    model,
    ready: model !== null,
    error,
    score: score as (text: string) => ScoreResult,
    band: band as (p: number) => Band,
  };
}
