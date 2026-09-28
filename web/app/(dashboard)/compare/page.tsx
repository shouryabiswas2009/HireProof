import { Comparer } from "@/components/check/comparer";

export const metadata = { title: "Compare — HireProof" };

export default function ComparePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compare two postings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Useful when two adverts are for the same kind of role and you want to
          know which reads better. Both are scored in your browser by the same
          model as a single check.
        </p>
      </div>
      <Comparer />
    </div>
  );
}
