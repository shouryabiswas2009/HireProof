import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "How it works — HireProof" };

const steps: [string, string][] = [
  [
    "Normalise",
    "Lowercase the text and collapse all whitespace, so a phrase split across a line break is still found.",
  ],
  [
    "Extract 11 signals",
    "Whether a pay figure is given, how dense the buzzwords are, whether a team or manager is named, and eight more. Each becomes one number.",
  ],
  [
    "Standardise",
    "Rescale each signal using the mean and spread from training, so one learning rate suits them all and the weights stay comparable.",
  ],
  [
    "Add them up",
    "Each standardised signal is multiplied by its learned weight and summed, starting from a constant called the bias.",
  ],
  [
    "Squash it",
    "That sum can be any number at all, so the sigmoid folds it into the 0–100% range.",
  ],
];

export default function HowPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">How it works</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Logistic regression, written from scratch &mdash; no scikit-learn. The
          training runs in Python; the scoring runs in your browser.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">From text to a score</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4">
            {steps.map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <pre className="mt-6 overflow-x-auto rounded-md bg-muted p-4 text-xs">
            {"z = bias + (w₁ × x₁) + … + (w₁₁ × x₁₁)\nprobability = 1 ÷ (1 + e^−z)"}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Why logistic regression, and not something bigger?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">The explanation is the model.</strong>{" "}
            Each signal&rsquo;s push is literally a term in that sum, so the
            breakdown on a result is the arithmetic itself, not a story told
            afterwards.
          </p>
          <p>
            <strong className="text-foreground">The dataset is small.</strong>{" "}
            Something more flexible would memorise thirty postings rather than
            learn from them.
          </p>
          <p>
            <strong className="text-foreground">It is small enough to ship.</strong>{" "}
            Eleven weights and a bias fit in a few kilobytes, which is why the
            scoring can happen in your browser at all.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where this gets things wrong</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">A well-written ghost posting.</strong>{" "}
              Anything with a salary, a named manager and a deadline scores
              low, whether or not the job exists.
            </li>
            <li>
              <strong className="text-foreground">A badly-written real job.</strong>{" "}
              Plenty of genuine postings are full of buzzwords and missing a
              salary. Those score high and should not.
            </li>
            <li>
              <strong className="text-foreground">Tech-sector wording.</strong>{" "}
              Most of the labelled postings are software and office roles;
              other industries phrase things differently.
            </li>
            <li>
              <strong className="text-foreground">A small, one-person training set.</strong>{" "}
              Every label reflects one person&rsquo;s judgement, so the model
              inherits their blind spots along with their reasoning.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
