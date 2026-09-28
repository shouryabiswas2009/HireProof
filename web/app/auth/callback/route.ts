import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* Where Supabase sends people after they click the confirmation link in
   their email. It swaps the one-time code for a session cookie and then
   forwards them into the app. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  // Same open-redirect guard as the login action: only ever bounce to a
  // path on this site.
  const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/check";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=confirm`);
}
