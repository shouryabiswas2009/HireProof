import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";

export function LogoutButton() {
  return (
    <form action={logout}>
      <Button type="submit" variant="ghost" size="icon" aria-label="Log out">
        <LogOut className="size-4" />
      </Button>
    </form>
  );
}
