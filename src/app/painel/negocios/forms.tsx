"use client";

import CancelIcon from "@mui/icons-material/Cancel";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useActionState, useState } from "react";
import { Field, SubmitButton } from "@/app/components/form";
import type { Etapa } from "@/lib/db/schema";
import { etapas } from "@/lib/db/schema";
import {
  criarClienteENegocioAction,
  marcarPerdidoAction,
  mudarEtapaAction,
} from "./actions";
import { rotuloDaEtapa } from "./etapas";

const etapasAbertas = etapas.filter((e) => e !== "perdido");

// Mudança manual de etapa: um select com as etapas (menos Perdido, que tem
// o próprio formulário por exigir motivo).
export function MudarEtapaForm({
  negocioId,
  etapa,
}: {
  negocioId: string;
  etapa: Etapa;
}) {
  const [escolhida, setEscolhida] = useState<Etapa>(
    etapa === "perdido" ? "novo" : etapa,
  );
  return (
    <Stack component="form" action={mudarEtapaAction} spacing={2}>
      <input type="hidden" name="negocioId" value={negocioId} />
      <TextField
        select
        fullWidth
        label="Etapa"
        name="etapa"
        value={escolhida}
        onChange={(e) => setEscolhida(e.target.value as Etapa)}
      >
        {etapasAbertas.map((e) => (
          <MenuItem key={e} value={e}>
            {rotuloDaEtapa[e]}
          </MenuItem>
        ))}
      </TextField>
      <Button
        type="submit"
        variant="contained"
        size="large"
        disableElevation
        disabled={escolhida === etapa}
        startIcon={<SwapVertIcon aria-hidden fontSize="small" />}
      >
        Mudar etapa
      </Button>
    </Stack>
  );
}

export function MarcarPerdidoForm({ negocioId }: { negocioId: string }) {
  const [state, formAction, pending] = useActionState(marcarPerdidoAction, {});
  return (
    <Stack component="form" action={formAction} spacing={2}>
      <input type="hidden" name="negocioId" value={negocioId} />
      <Field
        label="Motivo da perda"
        name="motivo"
        multiline
        minRows={2}
        autoComplete="off"
      />
      {state.erro && <Alert severity="error">{state.erro}</Alert>}
      <Button
        type="submit"
        variant="outlined"
        color="error"
        size="large"
        disabled={pending}
        startIcon={<CancelIcon aria-hidden fontSize="small" />}
      >
        Marcar como perdido
      </Button>
    </Stack>
  );
}

// `clienteId` e `negocioId` vêm do servidor: reenviar não duplica nada.
export function CriarClienteENegocioForm({
  clienteId,
  negocioId,
}: {
  clienteId: string;
  negocioId: string;
}) {
  const [state, formAction, pending] = useActionState(
    criarClienteENegocioAction,
    {},
  );
  return (
    <Stack component="form" action={formAction} spacing={2}>
      <input type="hidden" name="clienteId" value={clienteId} />
      <input type="hidden" name="negocioId" value={negocioId} />
      <Field label="Nome" name="nome" autoComplete="off" />
      <Field
        label="Telefone (WhatsApp)"
        name="telefone"
        type="tel"
        autoComplete="off"
        placeholder="(88) 99999-0000"
      />
      <Field
        label="E-mail"
        name="email"
        type="email"
        required={false}
        autoComplete="off"
      />
      {state.erro && <Alert severity="error">{state.erro}</Alert>}
      <SubmitButton pending={pending} icon={PersonAddIcon}>
        Cadastrar cliente e negócio
      </SubmitButton>
    </Stack>
  );
}
