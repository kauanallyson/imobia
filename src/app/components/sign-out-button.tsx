import LogoutIcon from "@mui/icons-material/Logout";
import Button from "@mui/material/Button";
import { signOut } from "@/app/login/actions";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button
        type="submit"
        color="inherit"
        startIcon={<LogoutIcon aria-hidden fontSize="small" />}
      >
        Sair
      </Button>
    </form>
  );
}
