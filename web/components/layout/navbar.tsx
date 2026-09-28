import Link from "next/link";
import { Ghost } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LogoutButton } from "@/components/layout/logout-button";
import { NavLinks } from "@/components/layout/nav-links";

// Server component: takes the signed-in user (or null) and renders the
// right side of the navbar accordingly.
export function Navbar({ userEmail }: { userEmail: string | null }) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Ghost className="size-5 text-primary" />
          <span>HireProof</span>
        </Link>

        {userEmail && <NavLinks />}

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {userEmail ? (
            <>
              <span className="hidden text-sm text-muted-foreground md:inline">
                {userEmail}
              </span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
