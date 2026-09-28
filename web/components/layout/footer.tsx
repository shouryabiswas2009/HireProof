import Link from "next/link";
import { MotionToggle } from "@/components/layout/motion-toggle";

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <p className="max-w-3xl">
          HireProof is a heuristic, not a detector, and it can be wrong in
          both directions. It compares wording against a small set of
          hand-labelled postings &mdash; it cannot know whether a job exists.
        </p>
        <p className="mt-4">
          <MotionToggle />
        </p>
        <p className="mt-3">
          <Link href="/how" className="hover:text-foreground">
            How it works
          </Link>
          {" · "}
          <Link href="/model" className="hover:text-foreground">
            The model
          </Link>
          {" · "}
          <a
            href="https://github.com/shouryabiswas2009/HireProof"
            rel="noopener"
            className="hover:text-foreground"
          >
            Source
          </a>
        </p>
      </div>
    </footer>
  );
}
