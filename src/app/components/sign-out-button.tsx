import Button from "@mui/material/Button";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button
        type="submit"
        color="inherit"
        startIcon={<LogOut aria-hidden size={18} />}
      >
        Sair
      </Button>
    </form>
  );
}
