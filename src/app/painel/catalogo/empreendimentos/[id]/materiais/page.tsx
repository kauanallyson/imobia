import DeleteIcon from "@mui/icons-material/Delete";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { buscarEmpreendimento } from "@/data/empreendimentos";
import {
  listarMateriaisDeMarketing,
  urlDoMaterial,
} from "@/data/materiais-de-marketing";
import { verificarCorretor } from "@/data/session";
import { enviarMaterialAction, removerMaterialAction } from "./actions";
import { formatarTamanho, rotuloDoDestino, rotuloDoTipo } from "./formatos";
import { MaterialForm } from "./forms";

type Props = PageProps<"/painel/catalogo/empreendimentos/[id]/materiais">;

export default function MateriaisPage({ params }: Props) {
  return (
    <Stack spacing={4}>
      <Suspense fallback={<Typography>Carregando…</Typography>}>
        <Materiais params={params} />
      </Suspense>
    </Stack>
  );
}

async function Materiais({ params }: Pick<Props, "params">) {
  const session = await verificarCorretor();
  const { id } = await params;
  const empreendimento = await buscarEmpreendimento(session, id);
  if (!empreendimento) notFound();
  const materiais = await listarMateriaisDeMarketing(
    session,
    empreendimento.id,
  );
  const comUrl = await Promise.all(
    materiais.map(async (m) => ({
      ...m,
      url: await urlDoMaterial(session, m.id),
    })),
  );

  return (
    <>
      <Stack component="section" spacing={0.5}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Material de marketing
        </Typography>
        <Typography color="text.secondary">
          <Link href={`/painel/catalogo/empreendimentos/${empreendimento.id}`}>
            {empreendimento.nome}
          </Link>
        </Typography>
      </Stack>

      <Stack component="section" spacing={2}>
        {comUrl.length === 0 ? (
          <Typography color="text.secondary">Nenhum material ainda.</Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {comUrl.map((m) => (
                <ListItem
                  key={m.id}
                  divider
                  sx={{
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: 1,
                  }}
                >
                  <ListItemText
                    primary={m.nome}
                    secondary={`${rotuloDoTipo[m.tipoDeArquivo]} · ${formatarTamanho(m.tamanho)}`}
                  />
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center" }}
                  >
                    <Chip
                      label={rotuloDoDestino[m.destino]}
                      size="small"
                      variant="outlined"
                    />
                    {m.url && (
                      <Button
                        component="a"
                        href={m.url}
                        target="_blank"
                        rel="noreferrer"
                        size="small"
                        startIcon={
                          <OpenInNewIcon aria-hidden fontSize="small" />
                        }
                      >
                        Abrir
                      </Button>
                    )}
                    <Stack
                      component="form"
                      action={removerMaterialAction}
                      sx={{ ml: "auto" }}
                    >
                      <input type="hidden" name="materialId" value={m.id} />
                      <Button
                        type="submit"
                        color="error"
                        size="small"
                        startIcon={<DeleteIcon aria-hidden fontSize="small" />}
                      >
                        Remover
                      </Button>
                    </Stack>
                  </Stack>
                </ListItem>
              ))}
            </List>
          </Paper>
        )}
        <Typography variant="subtitle1" component="h3">
          Novo material
        </Typography>
        <MaterialForm
          action={enviarMaterialAction}
          id={crypto.randomUUID()}
          empreendimentoId={empreendimento.id}
        />
      </Stack>
    </>
  );
}
