import Link from "next/link";
import { Ghost } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LogoutButton } from "@/components/layout/logout-button";
import { NavLinks } from "@/components/layout/nav-links";
import { AccountMenu } from "@/components/layout/account-menu";

/*
 * Three zones, evenly weighted: mark, links, account.
 *
 * The previous version put a raw email address in the bar, which is the
 * longest and least useful string on the page and shoved the links
 * off-centre at every width. It lives behind an avatar now, so the middle
 * of the bar is the navigation and nothing else competes with it.
 */
export function Navbar({ userEmail }: { userEmail: string | null }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Ghost className="size-[17px]" />
          </span>
          <span className="brand-name">HireProof</span>
        </Link>

        {userEmail && <NavLinks />}

        <div className="topbar-end">
          <ThemeToggle />
          {userEmail ? (
            <AccountMenu email={userEmail}>
              <LogoutButton />
            </AccountMenu>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
