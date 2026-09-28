"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useScorer, type ScoreResult } from "@/lib/scoring/use-scorer";
import { saveCheck } from "@/lib/actions/checks";
import { Result } from "@/components/check/result";
import { EXAMPLES } from "@/lib/scoring/examples.js";
import { checkInput, MIN_WORDS } from "@/lib/scoring/validate.js";

export function Checker() {
  const { model, ready, error, score, band } = useScorer();
  const [text, setText] = useState("");
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [saving, startSaving] = useTransition();

  const check = checkInput(text);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  function onScore() {
    if (!ready || !check.ok) return;
    setResult(score(text));
  }

  function onSave() {
    if (!result) return;
    startSaving(async () => {
      const outcome = await saveCheck({
        score: result.probability,
        band: band(result.probability).key,
        wordCount: words,
        // The first line is usually the job title, and it is all that is
        // needed to recognise the entry later. Storing the whole posting
        // would mean uploading someone's paste to keep a bookmark.
        title: text.trim().split("\n")[0].slice(0, 120),
        topSignal: result.contributions[0]?.label ?? null,
      });
      if (outcome?.error) toast.error(outcome.error);
      else toast.success("Saved to your history.");
    });
  }

  return (
    <>
      <section className="card card-input">
        <div className="input-head">
          <label htmlFor="posting">Job posting text</label>
          <span className="word-count">{words} words</span>
        </div>
        <textarea
          id="posting"
          rows={12}
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Paste the full text of a job posting here\n\nTip: select everything from the job title down to the end of the description."}
        />

        <div className="controls">
          <button className="btn btn-primary" onClick={onScore} disabled={!ready || !check.ok}>
            Score this posting
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setText("");
              setResult(null);
            }}
          >
            Clear
          </button>
          {result && (
            <button className="btn btn-ghost" onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : "Save to history"}
            </button>
          )}
        </div>

        <p className="hint" id="input-hint">
          {error
            ? `Could not load the model: ${error}`
            : !ready
              ? "Loading the model…"
              : check.ok
                ? ""
                : check.message || `Paste at least ${MIN_WORDS} words of a job posting.`}
        </p>

        {/* Examples, so a visitor can see the range without pasting
            anything. All three are written for this page and checked
            against the current model. */}
        <p className="examples">
          <span className="examples-label">Or try an example:</span>
          {(
            [
              ["ghost", "Ghost-like"],
              ["genuine", "Genuine"],
              ["borderline", "Borderline"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className="chip"
              onClick={() => {
                setText(EXAMPLES[key]);
                setResult(null);
              }}
            >
              {label}
            </button>
          ))}
        </p>

        <p className="privacy-note">
          Your text never leaves this page &mdash; the model runs inside your
          browser. Saving a result stores the score and a title, never the
          posting itself.
        </p>
      </section>

      {result && (
        <Result result={result} verdict={band(result.probability)} model={model} />
      )}
    </>
  );
}
