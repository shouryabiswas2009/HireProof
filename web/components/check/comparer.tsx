"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useScorer, type ScoreResult } from "@/lib/scoring/use-scorer";
import { checkInput } from "@/lib/scoring/validate.js";

// Below this the two scores are not far enough apart to mean anything on a
// model that is right about seven times in ten. Saying "too close to call"
// is more honest than ranking noise.
const MEANINGFUL_GAP = 5;

export function Comparer() {
  const { ready, score, band } = useScorer();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [results, setResults] = useState<[ScoreResult, ScoreResult] | null>(null);

  const bothOk = checkInput(a).ok && checkInput(b).ok;

  function onCompare() {
    if (!ready || !bothOk) return;
    setResults([score(a), score(b)]);
  }

  const gap = results
    ? Math.abs(results[0].probability - results[1].probability) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {[
          { label: "Posting A", value: a, set: setA },
          { label: "Posting B", value: b, set: setB },
        ].map((side) => (
          <Card key={side.label}>
            <CardHeader>
              <CardTitle className="text-base">{side.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={12}
                spellCheck={false}
                value={side.value}
                onChange={(e) => side.set(e.target.value)}
                placeholder="Paste a posting here"
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onCompare} disabled={!ready || !bothOk}>
          Compare
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setA("");
            setB("");
            setResults(null);
          }}
        >
          Clear both
        </Button>
        {!ready && <span className="text-sm text-muted-foreground">Loading the model…</span>}
      </div>

      {results && (
        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {results.map((r, i) => (
                <div key={i} className="rounded-md border p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Posting {i === 0 ? "A" : "B"}
                  </p>
                  <p className="text-3xl font-semibold tabular-nums">
                    {Math.round(r.probability * 100)}%
                  </p>
                  <Badge variant="secondary" className="mt-2">
                    {band(r.probability).title}
                  </Badge>
                </div>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">
              {gap < MEANINGFUL_GAP ? (
                <>
                  <strong className="text-foreground">Too close to call.</strong> The two
                  scores are {gap.toFixed(1)} points apart, which is well inside
                  what this model gets wrong. Treat them as the same.
                </>
              ) : (
                <>
                  Posting {results[0].probability > results[1].probability ? "A" : "B"} reads
                  more ghost-like, by {gap.toFixed(1)} points. That is a
                  difference worth noticing, not a verdict about either job.
                </>
              )}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
