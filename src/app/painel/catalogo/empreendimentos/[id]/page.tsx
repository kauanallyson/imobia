import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { buscarEmpreendimento } from "@/data/empreendimentos";
import { listarIncorporadoras } from "@/data/incorporadoras";
import { listarLotes } from "@/data/lotes";
import { listarModelosDeCasa } from "@/data/modelos-de-casa";
import { verificarCorretor } from "@/data/session";
import {
  criarLoteAction,
  criarModeloDeCasaAction,
  editarEmpreendimentoAction,
} from "../../actions";
import {
  corDoStatus,
  formatarM2,
  formatarReais,
  rotuloDoStatus,
} from "../../formatos";
import { EmpreendimentoForm, LoteForm, ModeloDeCasaForm } from "../../forms";

export default function EmpreendimentoPage({
  params,
}: PageProps<"/painel/catalogo/empreendimentos/[id]">) {
  return (
    <Stack spacing={4}>
      <Suspense fallback={<Typography>Carregando…</Typography>}>
        <Empreendimento params={params} />
      </Suspense>
    </Stack>
  );
}

async function Empreendimento({ params }: { params: Promise<{ id: string }> }) {
  const session = await verificarCorretor();
  const { id } = await params;
  const empreendimento = await buscarEmpreendimento(session, id);
  if (!empreendimento) notFound();
  const [lotes, modelos, incorporadoras] = await Promise.all([
    listarLotes(session, empreendimento.id),
    listarModelosDeCasa(session, empreendimento.id),
    listarIncorporadoras(session),
  ]);

  return (
    <>
      <Stack component="section" spacing={0.5}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {empreendimento.nome}
        </Typography>
        <Typography color="text.secondary">
          {empreendimento.incorporadora} · {empreendimento.cidade}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {empreendimento.endereco}
        </Typography>
      </Stack>

      <Stack component="section" spacing={2}>
        <Typography variant="h6" component="h2">
          Lotes
        </Typography>
        {lotes.length === 0 ? (
          <Typography color="text.secondary">Nenhum lote ainda.</Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {lotes.map((lote) => (
                <ListItemButton
                  key={lote.id}
                  component={Link}
                  href={`/painel/catalogo/lotes/${lote.id}`}
                  divider
                >
                  <ListItemText
                    primary={`Quadra ${lote.quadra} · Lote ${lote.numero}`}
                    secondary={`${formatarM2(lote.area)} · ${formatarReais(lote.preco)}`}
                  />
                  <Chip
                    label={rotuloDoStatus[lote.status]}
                    color={corDoStatus[lote.status]}
                    size="small"
                    variant="outlined"
                  />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        )}
        <Typography variant="subtitle1" component="h3">
          Novo lote
        </Typography>
        <LoteForm
          action={criarLoteAction}
          id={crypto.randomUUID()}
          empreendimentoId={empreendimento.id}
        />
      </Stack>

      <Stack component="section" spacing={2}>
        <Typography variant="h6" component="h2">
          Modelos de casa
        </Typography>
        {modelos.length === 0 ? (
          <Typography color="text.secondary">
            Nenhum modelo de casa ainda.
          </Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {modelos.map((m) => (
                <ListItemButton
                  key={m.id}
                  component={Link}
                  href={`/painel/catalogo/modelos/${m.id}`}
                  divider
                >
                  <ListItemText
                    primary={m.nome}
                    secondary={`${formatarM2(m.areaConstruida)} · ${m.quartos} quartos · ${m.suites} suítes · ${m.banheiros} banheiros · ${m.vagas} vagas · ${formatarReais(m.preco)}`}
                  />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        )}
        <Typography variant="subtitle1" component="h3">
          Novo modelo de casa
        </Typography>
        <ModeloDeCasaForm
          action={criarModeloDeCasaAction}
          id={crypto.randomUUID()}
          empreendimentoId={empreendimento.id}
        />
      </Stack>

      <Stack component="section" spacing={2}>
        <Typography variant="h6" component="h2">
          Dados do empreendimento
        </Typography>
        <EmpreendimentoForm
          action={editarEmpreendimentoAction}
          id={empreendimento.id}
          valores={empreendimento}
          incorporadoras={incorporadoras}
        />
      </Stack>
    </>
  );
}
