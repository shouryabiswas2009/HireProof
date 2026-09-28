import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase client for use on the server (Server Components, Server Actions,
// Route Handlers). Reads/writes the session via Next.js cookies.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore since the
            // proxy (lib/supabase/middleware.ts) refreshes the session too.
          }
        },
      },
    }
  );
}
