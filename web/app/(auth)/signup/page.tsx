import { Ghost } from "lucide-react";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <Ghost className="size-8 text-primary" />
        <h1 className="text-2xl font-semibold">Create an account</h1>
        <p className="text-sm text-muted-foreground">
          Postings are scored in your browser. An account is what lets a
          result be saved.
        </p>
      </div>
      <SignupForm />
    </div>
  );
}
