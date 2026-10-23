import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import AppBar from "@mui/material/AppBar";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { SignOutButton } from "@/app/components/sign-out-button";
import { listarDatasBloqueadas, listarJanelas } from "@/data/disponibilidade";
import { verificarCorretor } from "@/data/session";
import { listarVisitas } from "@/data/visitas";
import {
  cancelarVisitaAction,
  desbloquearDataAction,
  removerJanelaAction,
} from "./actions";
import { formatarData, formatoDeVisita, nomesDosDias } from "./formatos";
import { AlterarLocalForm, BloqueioForm, JanelaForm } from "./forms";

export const metadata: Metadata = { title: "Agenda" };

export default function AgendaPage() {
  return (
    <Suspense fallback={null}>
      <Agenda />
    </Suspense>
  );
}

// Agenda do corretor (histórias 52, 57): disponibilidade semanal, datas
// bloqueadas e as próximas visitas.
async function Agenda() {
  const session = await verificarCorretor();
  const [janelas, bloqueios, visitas] = await Promise.all([
    listarJanelas(session),
    listarDatasBloqueadas(session),
    listarVisitas(session),
  ]);

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
          <Typography variant="h6" noWrap sx={{ flex: 1 }}>
            Agenda
          </Typography>
          <SignOutButton />
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="sm" sx={{ py: 3 }}>
        <Stack spacing={4}>
          <Stack component="section" spacing={2}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
              Próximas visitas
            </Typography>
            {visitas.length === 0 ? (
              <Typography color="text.secondary">
                Nenhuma visita marcada. O assistente marca aqui quando o cliente
                escolher um horário livre.
              </Typography>
            ) : (
              <Stack spacing={2}>
                {visitas.map((visita) => (
                  <Paper key={visita.id} variant="outlined" sx={{ p: 2 }}>
                    <Stack spacing={2}>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center" }}
                      >
                        <ListItemText
                          primary={`${formatoDeVisita.format(visita.dataHora)} · ${visita.clienteNome}`}
                          secondary={
                            visita.estado === "remarcada"
                              ? "Remarcada"
                              : "Agendada"
                          }
                          sx={{ flex: 1, m: 0 }}
                        />
                        <Button
                          component={Link}
                          href={`/painel/negocios/${visita.negocioId}`}
                          size="small"
                        >
                          Negócio
                        </Button>
                      </Stack>
                      <AlterarLocalForm
                        visitaId={visita.id}
                        local={visita.local}
                      />
                      <form action={cancelarVisitaAction}>
                        <input
                          type="hidden"
                          name="visitaId"
                          value={visita.id}
                        />
                        <Button
                          type="submit"
                          color="error"
                          startIcon={
                            <EventBusyIcon aria-hidden fontSize="small" />
                          }
                        >
                          Cancelar visita
                        </Button>
                      </form>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Stack>

          <Stack component="section" spacing={2}>
            <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
              Disponibilidade semanal
            </Typography>
            <Typography variant="body2" color="text.secondary">
              O assistente só oferece visitas dentro destas janelas (horário de
              Brasília), de hora em hora ou meia em meia hora.
            </Typography>
            {janelas.length === 0 ? (
              <Typography color="text.secondary">
                Nenhuma janela cadastrada: o assistente não consegue marcar
                visitas.
              </Typography>
            ) : (
              <Paper variant="outlined">
                <List disablePadding>
                  {janelas.map((janela) => (
                    <ListItem
                      key={janela.id}
                      divider
                      secondaryAction={
                        <form action={removerJanelaAction}>
                          <input type="hidden" name="id" value={janela.id} />
                          <IconButton
                            type="submit"
                            edge="end"
                            aria-label="Remover janela"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </form>
                      }
                    >
                      <ListItemText
                        primary={nomesDosDias[janela.diaDaSemana]}
                        secondary={`${janela.inicio} às ${janela.fim}`}
                      />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            )}
            <JanelaForm id={crypto.randomUUID()} />
          </Stack>

          <Stack component="section" spacing={2}>
            <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
              Datas bloqueadas
            </Typography>
            {bloqueios.length === 0 ? (
              <Typography color="text.secondary">
                Nenhuma data bloqueada.
              </Typography>
            ) : (
              <Paper variant="outlined">
                <List disablePadding>
                  {bloqueios.map((b) => (
                    <ListItem
                      key={b.id}
                      divider
                      secondaryAction={
                        <form action={desbloquearDataAction}>
                          <input type="hidden" name="id" value={b.id} />
                          <IconButton
                            type="submit"
                            edge="end"
                            aria-label="Desbloquear data"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </form>
                      }
                    >
                      <ListItemText primary={formatarData(b.data)} />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            )}
            <BloqueioForm id={crypto.randomUUID()} />
          </Stack>
        </Stack>
      </Container>
    </>
  );
}
