"use client";

import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import { Building2, UserPlus } from "lucide-react";
import { useActionState } from "react";
import { Field, SubmitButton } from "@/app/components/form";
import { criarCorretorAction, criarImobiliariaAction } from "./actions";

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
      <SubmitButton pending={pending} icon={Building2}>
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
      {state.erro && <Alert severity="error">{state.erro}</Alert>}
      <SubmitButton pending={pending} icon={UserPlus}>
        Criar corretor
      </SubmitButton>
    </Stack>
  );
}
