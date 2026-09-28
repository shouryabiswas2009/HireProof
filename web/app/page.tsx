import Link from "next/link";
import { Hero } from "@/components/hero";
import { createClient } from "@/lib/supabase/server";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="shell">
      <Hero>
        <p className="eyebrow">Scored in your browser</p>
        <h1>
          Is this job posting
          <br />
          <em data-text="actually real?">actually real?</em>
        </h1>
        <p className="tagline">
          Paste a job posting and HireProof scores how closely its wording
          matches postings labelled as <strong>ghost jobs</strong> &mdash;
          listings put up with no real intent to hire.
        </p>
        <p className="controls" style={{ justifyContent: "center" }}>
          <Link className="btn btn-primary" href={user ? "/check" : "/signup"}>
            {user ? "Check a posting" : "Get started"}
          </Link>
          <Link className="btn btn-ghost" href="/how">
            How it works
          </Link>
        </p>
      </Hero>

      <section className="card">
        <h2 className="card-title">What this is</h2>
        <p className="hint">
          A logistic regression written from scratch &mdash; no scikit-learn
          &mdash; trained on hand-labelled job postings. The model is eleven
          weights and a bias, small enough to ship to your browser and run
          there, so the posting you paste is not uploaded to score it.
        </p>
        <ul className="warn-list">
          <li>
            <strong>It shows its working.</strong> Every result breaks down
            into the signals that moved it, and says how far each one pushed
            the score. The explanation is the arithmetic, not a story told
            afterwards.
          </li>
          <li>
            <strong>It is honest about what it is.</strong> 70% accuracy
            against a 50% baseline, on 30 postings. The model page shows you
            that overlap rather than hiding it behind one number.
          </li>
          <li>
            <strong>An account is for remembering.</strong> Scoring never
            needed a server. Saving a result does &mdash; and a saved check
            keeps the score and a title, never the posting text.
          </li>
        </ul>
      </section>
    </div>
  );
}
