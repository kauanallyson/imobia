import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AppBar from "@mui/material/AppBar";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { type ReactNode, Suspense } from "react";
import Link from "@/app/components/link";
import { SignOutButton } from "@/app/components/sign-out-button";
import { verificarCorretor } from "@/data/session";

// Catálogo é área de corretor: a checagem fica no layout e a DAL checa de
// novo.
export default function CatalogoLayout({
  children,
}: LayoutProps<"/painel/catalogo">) {
  return (
    <Suspense fallback={null}>
      <CatalogoShell>{children}</CatalogoShell>
    </Suspense>
  );
}

async function CatalogoShell({ children }: { children: ReactNode }) {
  await verificarCorretor();
  return (
    <>
      <AppBar position="sticky" color="inherit" elevation={0}>
        <Toolbar sx={{ borderBottom: 1, borderColor: "divider", gap: 1 }}>
          <IconButton
            component={Link}
            href="/painel"
            aria-label="Voltar ao painel"
            edge="start"
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography
            component={Link}
            href="/painel/catalogo"
            variant="h6"
            noWrap
            sx={{ flex: 1, color: "inherit", textDecoration: "none" }}
          >
            Catálogo
          </Typography>
          <SignOutButton />
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="sm" sx={{ py: 3 }}>
        {children}
      </Container>
    </>
  );
}
