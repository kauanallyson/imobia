import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { listarPendencias, rotuloDoTipo } from "@/data/pendencias";
import { verificarCorretor } from "@/data/session";
import { formatoDataHora } from "../negocios/etapas";

export const metadata: Metadata = { title: "Pendências" };

export default function PendenciasPage() {
  return (
    <Suspense fallback={<Typography>Carregando…</Typography>}>
      <Pendencias />
    </Suspense>
  );
}

// Lista do corretor (história 72): abertas primeiro, com o tipo em destaque.
async function Pendencias() {
  const session = await verificarCorretor();
  const lista = await listarPendencias(session);
  const abertas = lista.filter((p) => p.estado === "aberta");
  const resolvidas = lista.filter((p) => p.estado === "resolvida");

  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
        Pendências
      </Typography>
      <Secao titulo="Abertas" quantidade={abertas.length}>
        {abertas.length === 0 ? (
          <Typography color="text.secondary">
            Nada pendente. O assistente avisa aqui (e no seu WhatsApp) quando
            precisar de você.
          </Typography>
        ) : (
          <ListaDePendencias lista={abertas} />
        )}
      </Secao>
      {resolvidas.length > 0 && (
        <Secao titulo="Resolvidas" quantidade={resolvidas.length}>
          <ListaDePendencias lista={resolvidas} />
        </Secao>
      )}
    </Stack>
  );
}

function Secao({
  titulo,
  quantidade,
  children,
}: {
  titulo: string;
  quantidade: number;
  children: React.ReactNode;
}) {
  return (
    <Stack component="section" spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Typography variant="h6" component="h2">
          {titulo}
        </Typography>
        <Chip label={quantidade} size="small" />
      </Stack>
      {children}
    </Stack>
  );
}

function ListaDePendencias({
  lista,
}: {
  lista: Awaited<ReturnType<typeof listarPendencias>>;
}) {
  return (
    <Paper variant="outlined">
      <List disablePadding>
        {lista.map((p) => (
          <ListItemButton
            key={p.id}
            component={Link}
            href={`/painel/pendencias/${p.id}`}
            divider
            sx={{ minHeight: 64, alignItems: "flex-start", gap: 1 }}
          >
            <ListItemText
              primary={
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", flexWrap: "wrap" }}
                >
                  <Chip
                    label={rotuloDoTipo[p.tipo]}
                    size="small"
                    color={p.estado === "aberta" ? "primary" : "default"}
                  />
                  <Typography component="span" noWrap>
                    {p.clienteNome}
                  </Typography>
                </Stack>
              }
              secondary={`${p.descricao} · ${formatoDataHora.format(p.criadaEm)}`}
              slotProps={{ secondary: { noWrap: true } }}
            />
          </ListItemButton>
        ))}
      </List>
    </Paper>
  );
}
