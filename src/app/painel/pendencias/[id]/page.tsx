import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import HandshakeIcon from "@mui/icons-material/Handshake";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { buscarPendencia, rotuloDoTipo } from "@/data/pendencias";
import { verificarCorretor } from "@/data/session";
import { formatarTelefone, formatoDataHora } from "../../negocios/etapas";
import { resolverPendenciaAction } from "../actions";

export const metadata: Metadata = { title: "Pendência" };

export default function PendenciaPage({
  params,
}: PageProps<"/painel/pendencias/[id]">) {
  return (
    <Stack spacing={3}>
      <Button
        component={Link}
        href="/painel/pendencias"
        startIcon={<ArrowBackIcon aria-hidden fontSize="small" />}
        sx={{ alignSelf: "flex-start" }}
      >
        Pendências
      </Button>
      <Suspense fallback={<Typography>Carregando…</Typography>}>
        <Pendencia params={params} />
      </Suspense>
    </Stack>
  );
}

// Destino do link do aviso (história 74): o corretor resolve pelo celular.
async function Pendencia({ params }: { params: Promise<{ id: string }> }) {
  const session = await verificarCorretor();
  const { id } = await params;
  const pendencia = await buscarPendencia(session, id);
  if (!pendencia) notFound();
  const aberta = pendencia.estado === "aberta";

  return (
    <>
      <Stack component="header" spacing={1}>
        <Chip
          label={rotuloDoTipo[pendencia.tipo]}
          color={aberta ? "primary" : "default"}
          sx={{ alignSelf: "flex-start" }}
        />
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {pendencia.clienteNome}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {formatarTelefone(pendencia.clienteTelefone)} · criada em{" "}
          {formatoDataHora.format(pendencia.criadaEm)}
        </Typography>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography sx={{ whiteSpace: "pre-wrap" }}>
          {pendencia.descricao}
        </Typography>
      </Paper>

      {aberta ? (
        <form action={resolverPendenciaAction}>
          <input type="hidden" name="pendenciaId" value={pendencia.id} />
          <Button
            type="submit"
            variant="contained"
            size="large"
            disableElevation
            fullWidth
            startIcon={<TaskAltIcon aria-hidden fontSize="small" />}
          >
            Resolver
          </Button>
        </form>
      ) : (
        <Alert severity="success">
          Resolvida em{" "}
          {pendencia.resolvidaEm
            ? formatoDataHora.format(pendencia.resolvidaEm)
            : "—"}
          .
        </Alert>
      )}

      <Button
        component={Link}
        href={`/painel/negocios/${pendencia.negocioId}`}
        variant="outlined"
        size="large"
        fullWidth
        startIcon={<HandshakeIcon aria-hidden fontSize="small" />}
      >
        Abrir o negócio
      </Button>
    </>
  );
}
