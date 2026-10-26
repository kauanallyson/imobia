import PersonOffIcon from "@mui/icons-material/PersonOff";
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
import { listarCorretores } from "@/data/corretores";
import { buscarImobiliaria } from "@/data/imobiliarias";
import { verificarAdministrador } from "@/data/session";
import { desativarCorretorAction } from "../../actions";
import { CriarCorretorForm, DefinirTelefoneForm } from "../../forms";

export default function ImobiliariaPage({
  params,
}: PageProps<"/admin/imobiliarias/[id]">) {
  return (
    <Stack component="main" spacing={4}>
      <Suspense fallback={<Typography>Carregando…</Typography>}>
        <Imobiliaria params={params} />
      </Suspense>
    </Stack>
  );
}

async function Imobiliaria({ params }: { params: Promise<{ id: string }> }) {
  const session = await verificarAdministrador();
  const { id } = await params;
  const imobiliaria = await buscarImobiliaria(session, id);
  if (!imobiliaria) notFound();
  const corretores = await listarCorretores(session, imobiliaria.id);

  return (
    <>
      <Stack component="section" spacing={2}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {imobiliaria.nome}
        </Typography>
        <Typography variant="h6" component="h2">
          Corretores
        </Typography>
        {corretores.length === 0 ? (
          <Typography color="text.secondary">Nenhum corretor ainda.</Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {corretores.map((corretor) => (
                <ListItem key={corretor.id} divider>
                  <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center" }}
                    >
                      <ListItemText
                        primary={corretor.nome}
                        secondary={corretor.email}
                        slotProps={{
                          primary: { noWrap: true },
                          secondary: { noWrap: true },
                        }}
                        sx={{ flex: 1, minWidth: 0 }}
                      />
                      {corretor.ativo ? (
                        <form action={desativarCorretorAction}>
                          <input
                            type="hidden"
                            name="corretorId"
                            value={corretor.id}
                          />
                          <Button
                            type="submit"
                            color="error"
                            startIcon={
                              <PersonOffIcon aria-hidden fontSize="small" />
                            }
                          >
                            Desativar
                          </Button>
                        </form>
                      ) : (
                        <Chip label="Desativado" size="small" />
                      )}
                    </Stack>
                    {corretor.ativo && (
                      <DefinirTelefoneForm
                        corretorId={corretor.id}
                        telefone={corretor.telefone}
                      />
                    )}
                  </Stack>
                </ListItem>
              ))}
            </List>
          </Paper>
        )}
      </Stack>
      <Stack component="section" spacing={2}>
        <Typography variant="h6" component="h2">
          Novo corretor
        </Typography>
        <CriarCorretorForm
          id={crypto.randomUUID()}
          imobiliariaId={imobiliaria.id}
        />
      </Stack>
    </>
  );
}
