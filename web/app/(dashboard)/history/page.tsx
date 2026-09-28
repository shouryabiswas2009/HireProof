import { listChecks } from "@/lib/actions/checks";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "History — HireProof" };

const BAND_LABEL: Record<string, string> = {
  low: "Reads genuine",
  medium: "Mixed signals",
  high: "Reads ghost-like",
};

export default async function HistoryPage() {
  const checks = await listChecks();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Checks you chose to save. The posting text was never stored, so
          these are scores and labels rather than copies of what you pasted.
        </p>
      </div>

      {checks.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing saved yet. Score a posting and press{" "}
            <span className="text-foreground">Save to history</span>.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {checks.map((c) => (
            <li key={c.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.title ?? "Untitled posting"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
                      {c.top_signal ? ` · ${c.top_signal}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge variant="secondary">{BAND_LABEL[c.band] ?? c.band}</Badge>
                    <span className="text-xl font-semibold tabular-nums">
                      {Math.round(c.score * 100)}%
                    </span>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
