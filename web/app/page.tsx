import Link from "next/link";
import { Ghost, LockKeyhole, Cpu, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

const features = [
  {
    icon: Cpu,
    title: "Scored in your browser",
    body: "The model is eleven weights and a bias. It ships to your browser and runs there, so the posting you paste is not uploaded to check it.",
  },
  {
    icon: LineChart,
    title: "It shows its working",
    body: "Every result breaks down into the signals that moved it, and says how far each one pushed the score. The explanation is the model, not a story told afterwards.",
  },
  {
    icon: LockKeyhole,
    title: "Honest about what it is",
    body: "Trained on 30 hand-labelled postings: 70% accuracy against a 50% baseline. The site shows you that overlap rather than hiding it behind a number.",
  },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="flex flex-col items-center gap-6 py-20 text-center sm:py-28">
        <Ghost className="size-12 text-primary" />
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Is this job posting actually real?
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Paste a job posting and HireProof scores how closely its wording
          matches postings labelled as <strong className="text-foreground">ghost jobs</strong>
          {" "}&mdash; listings put up with no real intent to hire.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link href={user ? "/check" : "/signup"}>
              {user ? "Check a posting" : "Get started"}
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/how">How it works</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 pb-20 sm:grid-cols-3">
        {features.map((f) => (
          <Card key={f.title}>
            <CardHeader>
              <f.icon className="size-5 text-primary" />
              <CardTitle className="text-base">{f.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {f.body}
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
