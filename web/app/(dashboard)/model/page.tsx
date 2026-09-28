import fs from "node:fs/promises";
import path from "node:path";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModelFile } from "@/lib/scoring/use-scorer";

export const metadata = { title: "The model — HireProof" };

// Read the same file the browser scores with, so this page cannot end up
// describing a model other than the one actually in use.
async function readModel(): Promise<ModelFile> {
  const raw = await fs.readFile(
    path.join(process.cwd(), "public", "model.json"),
    "utf-8"
  );
  return JSON.parse(raw) as ModelFile;
}

function pct(x: number | undefined) {
  return `${Math.round((x ?? 0) * 100)}%`;
}

export default async function ModelPage() {
  const model = await readModel();
  const weights = model.feature_names
    .map((name, i) => ({
      name,
      label: model.feature_labels[name] ?? name,
      w: model.weights[i],
    }))
    .sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
  const largest = Math.abs(weights[0]?.w ?? 1);

  const stats = [
    { label: "Accuracy", value: pct(model.metrics.cv_accuracy), note: "cross-validated" },
    { label: "Baseline", value: pct(model.metrics.baseline_accuracy), note: "always guess the commonest" },
    { label: "Precision", value: pct(model.metrics.cv_precision), note: "of those called ghost, this share were" },
    { label: "Recall", value: pct(model.metrics.cv_recall), note: "of real ghost postings, this share caught" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">The model</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Trained on {model.n_examples} hand-labelled postings ({model.n_ghost} ghost,{" "}
          {model.n_legit} genuine) on {model.trained_date}.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="py-5">
              <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
              <p className="text-sm font-medium">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What it learned</CardTitle>
          <p className="text-sm text-muted-foreground">
            One weight per signal, on standardised features, so a longer bar
            really does mean a more influential signal. A bar near zero means
            the data gave no evidence either way &mdash; a finding rather than a
            failure.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {weights.map((row) => {
              const ghost = row.w > 0;
              return (
                <li
                  key={row.name}
                  className="grid grid-cols-[1fr_auto] items-center gap-3"
                >
                  <div>
                    <p className="text-sm">{row.label}</p>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${ghost ? "bg-red-500/70" : "bg-blue-500/70"}`}
                        style={{ width: `${(Math.abs(row.w) / largest) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="tabular-nums text-sm text-muted-foreground">
                    {ghost ? "+" : "−"}
                    {Math.abs(row.w).toFixed(3)}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {model.warnings?.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base">What the training run flagged</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {model.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
