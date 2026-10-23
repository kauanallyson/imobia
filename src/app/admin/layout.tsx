import AppBar from "@mui/material/AppBar";
import Container from "@mui/material/Container";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { type ReactNode, Suspense } from "react";
import Link from "@/app/components/link";
import { SignOutButton } from "@/app/components/sign-out-button";
import { verificarAdministrador } from "@/data/session";

// A checagem fica no layout: nada da área de administração é renderizado para
// quem não é administrador. As páginas e a DAL checam de novo.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={null}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

async function AdminShell({ children }: { children: ReactNode }) {
  await verificarAdministrador();
  return (
    <>
      <AppBar position="static" color="inherit" elevation={0}>
        <Toolbar sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Typography
            component={Link}
            href="/admin"
            variant="h6"
            sx={{ flex: 1, color: "inherit", textDecoration: "none" }}
          >
            loteAI · Administração
          </Typography>
          <SignOutButton />
        </Toolbar>
      </AppBar>
      <Container maxWidth="sm" sx={{ py: 3 }}>
        {children}
      </Container>
    </>
  );
}
