import ApartmentIcon from "@mui/icons-material/Apartment";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import AppBar from "@mui/material/AppBar";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { SignOutButton } from "@/app/components/sign-out-button";
import { buscarImobiliaria } from "@/data/imobiliarias";
import { listarNegociosPorEtapa } from "@/data/negocios";
import { verificarCorretor } from "@/data/session";
import { etapas } from "@/lib/db/schema";
import {
  formatarTelefone,
  formatoDataHora,
  rotuloDaEtapa,
} from "./negocios/etapas";

export const metadata: Metadata = { title: "Painel" };

export default function PainelPage() {
  return (
    <Suspense fallback={null}>
      <Painel />
    </Suspense>
  );
}

// Quadro do funil (história 30), mobile-first: uma coluna com uma seção por
// etapa fixa, na ordem do funil.
async function Painel() {
  const session = await verificarCorretor();
  const [imobiliaria, quadro] = await Promise.all([
    buscarImobiliaria(session, session.imobiliariaId),
    listarNegociosPorEtapa(session),
  ]);
  const total = Object.values(quadro).reduce((n, l) => n + l.length, 0);

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
          <Button
            component={Link}
            href="/painel/catalogo"
            color="inherit"
            startIcon={<ApartmentIcon aria-hidden fontSize="small" />}
          >
            Catálogo
          </Button>
          <Button
            component={Link}
            href="/painel/whatsapp"
            color="inherit"
            startIcon={<WhatsAppIcon aria-hidden fontSize="small" />}
          >
            WhatsApp
          </Button>
          <SignOutButton />
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="sm" sx={{ py: 3 }}>
        <Stack spacing={3}>
          <Stack
            direction="row"
            spacing={2}
            sx={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
              Negócios
            </Typography>
            <Button
              component={Link}
              href="/painel/negocios/novo"
              variant="contained"
              disableElevation
              startIcon={<PersonAddIcon aria-hidden fontSize="small" />}
            >
              Novo
            </Button>
          </Stack>

          {total === 0 && (
            <Typography color="text.secondary">
              Nenhum negócio por enquanto. Quem mandar mensagem no seu WhatsApp
              pela primeira vez aparece aqui em Novo.
            </Typography>
          )}

          {etapas.map((etapa) => {
            const lista = quadro[etapa];
            return (
              <Stack component="section" key={etapa} spacing={1}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center" }}
                >
                  <Typography variant="h6" component="h2">
                    {rotuloDaEtapa[etapa]}
                  </Typography>
                  <Chip label={lista.length} size="small" />
                </Stack>
                {lista.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Nenhum negócio nesta etapa.
                  </Typography>
                ) : (
                  <Paper variant="outlined">
                    <List disablePadding>
                      {lista.map((negocio) => (
                        <ListItemButton
                          key={negocio.id}
                          component={Link}
                          href={`/painel/negocios/${negocio.id}`}
                          divider
                          sx={{ minHeight: 56 }}
                        >
                          <ListItemText
                            primary={negocio.clienteNome}
                            secondary={`${formatarTelefone(negocio.clienteTelefone)} · ${formatoDataHora.format(negocio.atualizadoEm)}`}
                            slotProps={{
                              primary: { noWrap: true },
                              secondary: { noWrap: true },
                            }}
                          />
                        </ListItemButton>
                      ))}
                    </List>
                  </Paper>
                )}
              </Stack>
            );
          })}
        </Stack>
      </Container>
    </>
  );
}
