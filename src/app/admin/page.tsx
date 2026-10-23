import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { listarImobiliarias } from "@/data/imobiliarias";
import { verificarAdministrador } from "@/data/session";
import { CriarImobiliariaForm } from "./forms";

export const metadata: Metadata = { title: "Administração" };

export default function AdminPage() {
  return (
    <Stack component="main" spacing={4}>
      <Suspense fallback={<Typography>Carregando…</Typography>}>
        <Imobiliarias />
      </Suspense>
    </Stack>
  );
}

async function Imobiliarias() {
  const session = await verificarAdministrador();
  const imobiliarias = await listarImobiliarias(session);

  return (
    <>
      <Stack component="section" spacing={2}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Imobiliárias
        </Typography>
        {imobiliarias.length === 0 ? (
          <Typography color="text.secondary">
            Nenhuma imobiliária ainda.
          </Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {imobiliarias.map((imobiliaria) => (
                <ListItemButton
                  key={imobiliaria.id}
                  component={Link}
                  href={`/admin/imobiliarias/${imobiliaria.id}`}
                  divider
                >
                  <ListItemText primary={imobiliaria.nome} />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        )}
      </Stack>
      <Stack component="section" spacing={2}>
        <Typography variant="h6" component="h2">
          Nova imobiliária
        </Typography>
        <CriarImobiliariaForm id={crypto.randomUUID()} />
      </Stack>
    </>
  );
}
