import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { verificarCorretor } from "@/data/session";
import { CriarClienteENegocioForm } from "../forms";

export const metadata: Metadata = { title: "Novo negócio" };

export default function NovoNegocioPage() {
  return (
    <Container component="main" maxWidth="sm" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Button
          component={Link}
          href="/painel"
          startIcon={<ArrowBackIcon aria-hidden fontSize="small" />}
          sx={{ alignSelf: "flex-start" }}
        >
          Quadro
        </Button>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Novo cliente e negócio
        </Typography>
        <Typography color="text.secondary">
          Para um cliente que chegou por outro meio. Quem manda mensagem no seu
          WhatsApp pela primeira vez entra sozinho no quadro.
        </Typography>
        <Suspense fallback={<Typography>Carregando…</Typography>}>
          <Formulario />
        </Suspense>
      </Stack>
    </Container>
  );
}

async function Formulario() {
  await verificarCorretor();
  return (
    <CriarClienteENegocioForm
      clienteId={crypto.randomUUID()}
      negocioId={crypto.randomUUID()}
    />
  );
}
