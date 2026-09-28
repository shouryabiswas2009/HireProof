import { Suspense } from "react";
import { Ghost } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <Ghost className="size-8 text-primary" />
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Log in to check a posting and keep your history.
        </p>
      </div>
      {/* useSearchParams needs a Suspense boundary, or the whole route
          opts out of static rendering and the build warns. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
