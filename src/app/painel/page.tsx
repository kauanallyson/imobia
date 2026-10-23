import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import AppBar from "@mui/material/AppBar";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { SignOutButton } from "@/app/components/sign-out-button";
import { buscarImobiliaria } from "@/data/imobiliarias";
import { verificarCorretor } from "@/data/session";

export const metadata: Metadata = { title: "Painel" };

export default function PainelPage() {
  return (
    <Suspense fallback={null}>
      <Painel />
    </Suspense>
  );
}

// Mobile-first: uma coluna, alvos de toque grandes. Os negócios entram aqui
// no ticket do funil.
async function Painel() {
  const session = await verificarCorretor();
  const imobiliaria = await buscarImobiliaria(session, session.imobiliariaId);

  return (
    <>
      <AppBar position="sticky" color="inherit" elevation={0}>
        <Toolbar sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Stack sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="subtitle2"
              color="primary"
              sx={{ fontWeight: 700 }}
            >
              loteAI
            </Typography>
            <Typography variant="body2" noWrap>
              {imobiliaria?.nome}
            </Typography>
          </Stack>
          <SignOutButton />
        </Toolbar>
      </AppBar>
      <Container
        component="main"
        maxWidth="sm"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          py: 6,
        }}
      >
        <Typography variant="h6" component="h1">
          Seu painel
        </Typography>
        <Typography color="text.secondary">
          Nenhum negócio por enquanto.
        </Typography>
        <Button
          component={Link}
          href="/painel/whatsapp"
          variant="outlined"
          size="large"
          startIcon={<WhatsAppIcon aria-hidden fontSize="small" />}
          sx={{ mt: 3 }}
        >
          Conectar WhatsApp
        </Button>
      </Container>
    </>
  );
}
