import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/* Everything except the landing page and the auth screens needs a session.
 *
 * NOTE ON WHAT SIGNING IN ACTUALLY PROTECTS. The scoring still runs in the
 * visitor's browser, so a posting is never uploaded just by being checked.
 * The account exists so a check can be SAVED and come back later, and so
 * the app has a durable identity to hang that history on. It is worth
 * being precise about, because the old static site claimed "nothing
 * leaves your browser, there is no server" - that sentence is no longer
 * true in general, and the copy says so rather than quietly keeping a
 * claim that has stopped holding.
 */
const PUBLIC_PATHS = ["/", "/login", "/signup", "/auth"];
const AUTH_PATHS = ["/login", "/signup"];

// Called from proxy.ts (Next.js 16's renamed middleware) on every request.
// Refreshes the Supabase session cookie and redirects based on auth state.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  // A simple mistake here can cause hard-to-debug session refresh issues.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(
    (p) => path === p || (p !== "/" && path.startsWith(p))
  );
  const isAuthPath = AUTH_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Remember where they were headed, so login returns them there
    // instead of dumping everyone on the same page.
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/check";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
