import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { listarEmpreendimentos } from "@/data/empreendimentos";
import { listarIncorporadoras } from "@/data/incorporadoras";
import { verificarCorretor } from "@/data/session";
import { criarEmpreendimentoAction, criarIncorporadoraAction } from "./actions";
import { EmpreendimentoForm, IncorporadoraForm } from "./forms";

export const metadata: Metadata = { title: "Catálogo" };

export default function CatalogoPage() {
  return (
    <Stack spacing={4}>
      <Suspense fallback={<Typography>Carregando…</Typography>}>
        <Catalogo />
      </Suspense>
    </Stack>
  );
}

async function Catalogo() {
  const session = await verificarCorretor();
  const [empreendimentos, incorporadoras] = await Promise.all([
    listarEmpreendimentos(session),
    listarIncorporadoras(session),
  ]);

  return (
    <>
      <Stack component="section" spacing={2}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Empreendimentos
        </Typography>
        {empreendimentos.length === 0 ? (
          <Typography color="text.secondary">
            Nenhum empreendimento ainda.
          </Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {empreendimentos.map((e) => (
                <ListItemButton
                  key={e.id}
                  component={Link}
                  href={`/painel/catalogo/empreendimentos/${e.id}`}
                  divider
                >
                  <ListItemText
                    primary={e.nome}
                    secondary={`${e.cidade} · ${e.incorporadora}`}
                  />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        )}
        {incorporadoras.length > 0 && (
          <>
            <Typography variant="h6" component="h2">
              Novo empreendimento
            </Typography>
            <EmpreendimentoForm
              action={criarEmpreendimentoAction}
              id={crypto.randomUUID()}
              incorporadoras={incorporadoras}
            />
          </>
        )}
      </Stack>

      <Stack component="section" spacing={2}>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
          Incorporadoras
        </Typography>
        {incorporadoras.length === 0 ? (
          <Typography color="text.secondary">
            Cadastre uma incorporadora para então criar empreendimentos.
          </Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {incorporadoras.map((i) => (
                <ListItemButton
                  key={i.id}
                  component={Link}
                  href={`/painel/catalogo/incorporadoras/${i.id}`}
                  divider
                >
                  <ListItemText primary={i.nome} />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        )}
        <Typography variant="h6" component="h3">
          Nova incorporadora
        </Typography>
        <IncorporadoraForm
          action={criarIncorporadoraAction}
          id={crypto.randomUUID()}
        />
      </Stack>
    </>
  );
}
