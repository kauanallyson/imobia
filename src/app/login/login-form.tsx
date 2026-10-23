"use client";

import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import { LogIn } from "lucide-react";
import { useActionState } from "react";
import { Field, SubmitButton } from "@/app/components/form";
import { type SignInState, signIn } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    signIn,
    {},
  );

  return (
    <Stack component="form" action={formAction} spacing={2}>
      <Field
        label="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.email}
      />
      <Field
        label="Senha"
        name="senha"
        type="password"
        autoComplete="current-password"
      />
      {state.erro && <Alert severity="error">{state.erro}</Alert>}
      <SubmitButton pending={pending} icon={LogIn}>
        Entrar
      </SubmitButton>
    </Stack>
  );
}
