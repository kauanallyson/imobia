"use client";

import BusinessIcon from "@mui/icons-material/Business";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import { useActionState } from "react";
import { Field, SubmitButton } from "@/app/components/form";
import {
  criarCorretorAction,
  criarImobiliariaAction,
  definirTelefoneAction,
} from "./actions";

// `id` é gerado pelo servidor a cada renderização: reenviar o mesmo formulário
// (duplo clique, rede instável) não cria um segundo registro. Após criar, o
// revalidatePath traz um id novo para o próximo cadastro.
export function CriarImobiliariaForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(
    criarImobiliariaAction,
    {},
  );
  return (
    <Stack component="form" action={formAction} spacing={2}>
      <input type="hidden" name="id" value={id} />
      <Field label="Nome" name="nome" />
      {state.erro && <Alert severity="error">{state.erro}</Alert>}
      <SubmitButton pending={pending} icon={BusinessIcon}>
        Criar imobiliária
      </SubmitButton>
    </Stack>
  );
}

export function CriarCorretorForm({
  id,
  imobiliariaId,
}: {
  id: string;
  imobiliariaId: string;
}) {
  const [state, formAction, pending] = useActionState(criarCorretorAction, {});
  return (
    <Stack component="form" action={formAction} spacing={2}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="imobiliariaId" value={imobiliariaId} />
      <Field label="Nome" name="nome" autoComplete="off" />
      <Field label="E-mail" name="email" type="email" autoComplete="off" />
      <Field
        label="Senha inicial"
        name="senha"
        type="password"
        autoComplete="new-password"
        slotProps={{ htmlInput: { minLength: 8 } }}
      />
      <Field
        label="WhatsApp (avisos de pendência)"
        name="telefone"
        type="tel"
        required={false}
        autoComplete="off"
        placeholder="5588999990000"
        helperText="Só dígitos, com DDI e DDD. Opcional."
      />
      {state.erro && <Alert severity="error">{state.erro}</Alert>}
      <SubmitButton pending={pending} icon={PersonAddIcon}>
        Criar corretor
      </SubmitButton>
    </Stack>
  );
}

// Telefone de um corretor já criado; vazio remove.
export function DefinirTelefoneForm({
  corretorId,
  telefone,
}: {
  corretorId: string;
  telefone: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    definirTelefoneAction,
    {},
  );
  return (
    <Stack
      component="form"
      action={formAction}
      direction="row"
      spacing={1}
      sx={{ alignItems: "flex-start" }}
    >
      <input type="hidden" name="corretorId" value={corretorId} />
      <Field
        label="WhatsApp"
        name="telefone"
        type="tel"
        size="small"
        required={false}
        defaultValue={telefone ?? ""}
        placeholder="5588999990000"
        error={Boolean(state.erro)}
        helperText={state.erro}
      />
      <SubmitButton pending={pending} icon={WhatsAppIcon}>
        Salvar
      </SubmitButton>
    </Stack>
  );
}
