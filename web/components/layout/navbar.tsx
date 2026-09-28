import Link from "next/link";
import { Ghost } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LogoutButton } from "@/components/layout/logout-button";

const navLinks = [
  { href: "/check", label: "Check a posting" },
  { href: "/compare", label: "Compare" },
  { href: "/history", label: "History" },
  { href: "/model", label: "The model" },
  { href: "/how", label: "How it works" },
];

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

        {userEmail && (
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}

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
