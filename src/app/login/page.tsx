import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

// Não há link de cadastro: contas são criadas pelo administrador.
export default function LoginPage() {
  return (
    <Container
      component="main"
      maxWidth="xs"
      sx={{ flex: 1, display: "flex", alignItems: "center", py: 6 }}
    >
      <Stack spacing={3} sx={{ width: "100%" }}>
        <div>
          <Typography
            variant="subtitle2"
            color="primary"
            sx={{ fontWeight: 700 }}
          >
            loteAI
          </Typography>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Entrar
          </Typography>
        </div>
        <LoginForm />
      </Stack>
    </Container>
  );
}
