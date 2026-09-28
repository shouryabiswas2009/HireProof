"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useScorer, type ScoreResult, type Band } from "@/lib/scoring/use-scorer";
import { saveCheck } from "@/lib/actions/checks";
import { checkInput, MIN_WORDS } from "@/lib/scoring/validate.js";

const BAND_STYLE: Record<Band["key"], { icon: typeof CheckCircle2; className: string }> = {
  low: { icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  medium: { icon: CircleAlert, className: "text-amber-600 dark:text-amber-400" },
  high: { icon: AlertTriangle, className: "text-red-600 dark:text-red-400" },
};

// Only the signals that actually moved the answer. A bar for a feature
// sitting on the training average implies a factor that did not apply.
const MEANINGFUL = 0.01;
const TOP_N = 5;

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

  const verdict = result ? band(result.probability) : null;
  const Icon = verdict ? BAND_STYLE[verdict.key].icon : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Job posting text</CardTitle>
          <span className="text-sm text-muted-foreground">{words} words</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            spellCheck={false}
            placeholder={`Paste the full text of a job posting here\n\nTip: select everything from the job title down to the end of the description.`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={onScore} disabled={!ready || !check.ok}>
              Score this posting
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setText("");
                setResult(null);
              }}
            >
              Clear
            </Button>
            <p className="text-sm text-muted-foreground">
              {error
                ? `Could not load the model: ${error}`
                : !ready
                  ? "Loading the model…"
                  : check.ok
                    ? "Your text is scored in this browser and is not uploaded."
                    : check.message || `Paste at least ${MIN_WORDS} words.`}
            </p>
          </div>
        </CardContent>
      </Card>

      {result && verdict && Icon && (
        <Card>
          <CardHeader>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Resemblance to ghost postings
            </p>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-semibold tabular-nums">
                {Math.round(result.probability * 100)}%
              </span>
              <span className={`flex items-center gap-2 text-sm font-medium ${BAND_STYLE[verdict.key].className}`}>
                <Icon className="size-4" />
                {verdict.title}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{verdict.blurb}</p>
          </CardHeader>

          <CardContent className="space-y-5">
            {result.outOfDistribution && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                Treat this score with extra caution: this posting sits outside
                the range the model was trained on, so the number is an
                extrapolation rather than a reading.
              </p>
            )}

            <Separator />

            <div>
              <h3 className="mb-3 text-sm font-semibold">What drove this score</h3>
              <ul className="space-y-3">
                {result.contributions
                  .filter((c) => Math.abs(c.contribution) > MEANINGFUL)
                  .slice(0, TOP_N)
                  .map((c) => {
                    const raises = c.contribution > 0;
                    return (
                      <li key={c.name} className="grid grid-cols-[1fr_auto] items-center gap-3">
                        <div>
                          <p className="text-sm">{c.label}</p>
                          <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${raises ? "bg-red-500/70" : "bg-blue-500/70"}`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  (Math.abs(c.contribution) /
                                    Math.abs(result.contributions[0].contribution)) * 100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                        <Badge variant={raises ? "destructive" : "secondary"} className="tabular-nums">
                          {raises ? "+" : "−"}
                          {Math.abs(c.points).toFixed(1)} pts
                        </Badge>
                      </li>
                    );
                  })}
              </ul>
            </div>

            {model && (
              <p className="text-xs text-muted-foreground">
                This model scores {Math.round((model.metrics.cv_accuracy ?? 0) * 100)}%
                accuracy against a {Math.round((model.metrics.baseline_accuracy ?? 0) * 100)}%
                baseline, trained on {model.n_examples} hand-labelled postings.
              </p>
            )}

            <Button variant="outline" onClick={onSave} disabled={saving}>
              <Save className="size-4" />
              {saving ? "Saving…" : "Save to history"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
