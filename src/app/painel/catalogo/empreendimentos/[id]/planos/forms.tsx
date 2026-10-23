"use client";

import CalculateIcon from "@mui/icons-material/Calculate";
import PaymentsIcon from "@mui/icons-material/Payments";
import SaveIcon from "@mui/icons-material/Save";
import Alert from "@mui/material/Alert";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Form from "next/form";
import { useActionState } from "react";
import { Field, SubmitButton } from "@/app/components/form";
import type { Lote } from "@/data/lotes";
import type { ModeloDeCasa } from "@/data/modelos-de-casa";
import type { PlanoDePagamento } from "@/data/planos-de-pagamento";
import type { FormState } from "../../../actions";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

// Cria (sem `valores`) ou edita (com `valores`). `id` vem do servidor:
// reenviar não duplica.
export function PlanoForm({
  action,
  id,
  empreendimentoId,
  valores,
}: {
  action: Action;
  id: string;
  empreendimentoId: string;
  valores?: PlanoDePagamento;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <Stack component="form" action={formAction} spacing={2}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="empreendimentoId" value={empreendimentoId} />
      <Field label="Nome" name="nome" defaultValue={valores?.nome} />
      <Field
        label="Entrada (%)"
        name="percentualDeEntrada"
        type="number"
        defaultValue={valores?.percentualDeEntrada}
        slotProps={{
          htmlInput: {
            step: "0.01",
            min: "0",
            max: "100",
            inputMode: "decimal",
          },
        }}
      />
      <Field
        label="Número de parcelas"
        name="numeroDeParcelas"
        type="number"
        defaultValue={valores?.numeroDeParcelas}
        slotProps={{ htmlInput: { step: "1", min: "1", inputMode: "numeric" } }}
      />
      <Field
        label="Condições (correção, taxas)"
        name="condicoes"
        required={false}
        multiline
        minRows={2}
        defaultValue={valores?.condicoes}
      />
      {state.erro && <Alert severity="error">{state.erro}</Alert>}
      {state.ok && valores && <Alert severity="success">Plano salvo.</Alert>}
      <SubmitButton pending={pending} icon={valores ? SaveIcon : PaymentsIcon}>
        {valores ? "Salvar" : "Criar plano"}
      </SubmitButton>
    </Stack>
  );
}

// Escolha do lote (+ casa opcional) para simular todos os planos. GET: a
// página relê `searchParams`.
export function SimuladorForm({
  lotes,
  modelos,
  loteId,
  modeloDeCasaId,
}: {
  lotes: Lote[];
  modelos: ModeloDeCasa[];
  loteId?: string;
  modeloDeCasaId?: string;
}) {
  return (
    <Stack component={Form} action="" spacing={2}>
      <Field label="Lote" name="loteId" select defaultValue={loteId ?? ""}>
        {lotes.map((l) => (
          <MenuItem key={l.id} value={l.id}>
            Quadra {l.quadra} · Lote {l.numero}
          </MenuItem>
        ))}
      </Field>
      <Field
        label="Modelo de casa (opcional)"
        name="modeloDeCasaId"
        select
        required={false}
        defaultValue={modeloDeCasaId ?? ""}
      >
        <MenuItem value="">Só o lote</MenuItem>
        {modelos.map((m) => (
          <MenuItem key={m.id} value={m.id}>
            {m.nome}
          </MenuItem>
        ))}
      </Field>
      <SubmitButton icon={CalculateIcon}>Simular</SubmitButton>
    </Stack>
  );
}
