import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { UserX } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listarCorretores } from "@/data/corretores";
import { buscarImobiliaria } from "@/data/imobiliarias";
import { verificarAdministrador } from "@/data/session";
import { desativarCorretorAction } from "../../actions";
import { CriarCorretorForm } from "../../forms";

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
                <ListItem
                  key={corretor.id}
                  divider
                  secondaryAction={
                    corretor.ativo ? (
                      <form action={desativarCorretorAction}>
                        <input
                          type="hidden"
                          name="corretorId"
                          value={corretor.id}
                        />
                        <Button
                          type="submit"
                          color="error"
                          startIcon={<UserX aria-hidden size={18} />}
                        >
                          Desativar
                        </Button>
                      </form>
                    ) : (
                      <Chip label="Desativado" size="small" />
                    )
                  }
                >
                  <ListItemText
                    primary={corretor.nome}
                    secondary={corretor.email}
                    slotProps={{
                      primary: { noWrap: true },
                      secondary: { noWrap: true },
                    }}
                    sx={{ pr: 14 }}
                  />
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
