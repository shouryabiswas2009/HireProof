import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed "Middleware" to "Proxy" (same functionality, new file
// name/convention). This runs on every request to keep the Supabase auth
// session cookie fresh and gate protected routes.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|model.json|phrases.json|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
