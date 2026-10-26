"use client";

import AddIcon from "@mui/icons-material/Add";
import EditLocationAltIcon from "@mui/icons-material/EditLocationAlt";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import Alert from "@mui/material/Alert";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useActionState } from "react";
import { Field, SubmitButton } from "@/app/components/form";
import {
  alterarLocalDaVisitaAction,
  bloquearDataAction,
  criarJanelaAction,
  type FormState,
} from "./actions";
import { nomesDosDias } from "./formatos";

const inicial: FormState = {};

function Erro({ state }: { state: FormState }) {
  return state.erro ? <Alert severity="error">{state.erro}</Alert> : null;
}

// Nova janela semanal; o `id` vem do servidor para a criação ser idempotente.
export function JanelaForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(criarJanelaAction, inicial);
  return (
    <Stack component="form" action={action} spacing={2}>
      <input type="hidden" name="id" value={id} />
      <TextField
        select
        fullWidth
        label="Dia da semana"
        name="diaDaSemana"
        defaultValue={1}
      >
        {nomesDosDias.map((nome, dia) => (
          <MenuItem key={nome} value={dia}>
            {nome}
          </MenuItem>
        ))}
      </TextField>
      <Stack direction="row" spacing={2}>
        <Field
          label="Início"
          name="inicio"
          type="time"
          defaultValue="09:00"
          slotProps={{ htmlInput: { step: 1800 } }}
        />
        <Field
          label="Fim"
          name="fim"
          type="time"
          defaultValue="12:00"
          slotProps={{ htmlInput: { step: 1800 } }}
        />
      </Stack>
      <Erro state={state} />
      <SubmitButton pending={pending} icon={AddIcon}>
        Adicionar janela
      </SubmitButton>
    </Stack>
  );
}

export function BloqueioForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(bloquearDataAction, inicial);
  return (
    <Stack component="form" action={action} spacing={2}>
      <input type="hidden" name="id" value={id} />
      <Field
        label="Data"
        name="data"
        type="date"
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <Erro state={state} />
      <SubmitButton pending={pending} icon={EventBusyIcon}>
        Bloquear data
      </SubmitButton>
    </Stack>
  );
}

// História 57: muda o local de uma visita (ex.: para a imobiliária).
export function AlterarLocalForm({
  visitaId,
  local,
}: {
  visitaId: string;
  local: string;
}) {
  const [state, action, pending] = useActionState(
    alterarLocalDaVisitaAction,
    inicial,
  );
  return (
    <Stack component="form" action={action} spacing={1}>
      <input type="hidden" name="visitaId" value={visitaId} />
      <Field
        label="Local"
        name="local"
        defaultValue={local}
        multiline
        minRows={2}
        size="small"
      />
      <Erro state={state} />
      {state.ok && <Alert severity="success">Local alterado.</Alert>}
      <SubmitButton pending={pending} icon={EditLocationAltIcon}>
        Alterar local
      </SubmitButton>
    </Stack>
  );
}
