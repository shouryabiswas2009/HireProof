import { Checker } from "@/components/check/checker";

export const metadata = { title: "Check a posting — HireProof" };

export default function CheckPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Check a posting</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste the full text. It is scored in your browser and is not
          uploaded &mdash; saving a result stores the score and a title, never
          the posting itself.
        </p>
      </div>
      <Checker />
    </div>
  );
}
