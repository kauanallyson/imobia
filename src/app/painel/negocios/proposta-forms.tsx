"use client";

import MoreTimeIcon from "@mui/icons-material/MoreTime";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import SendIcon from "@mui/icons-material/Send";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import { useActionState } from "react";
import { SubmitButton } from "@/app/components/form";
import {
  aprovarPropostaAction,
  gerarPropostaAction,
  prorrogarReservaAction,
} from "./proposta-actions";

// Ticket 17: botões da proposta no detalhe do negócio.

export function GerarPropostaForm({
  negocioId,
  propostaId,
  rotulo,
}: {
  negocioId: string;
  propostaId: string;
  rotulo: string;
}) {
  const [state, formAction, pending] = useActionState(gerarPropostaAction, {});
  return (
    <Stack component="form" action={formAction} spacing={2}>
      <input type="hidden" name="negocioId" value={negocioId} />
      <input type="hidden" name="propostaId" value={propostaId} />
      {state.erro && <Alert severity="error">{state.erro}</Alert>}
      <SubmitButton pending={pending} icon={NoteAddIcon}>
        {rotulo}
      </SubmitButton>
    </Stack>
  );
}

export function AprovarPropostaForm({
  negocioId,
  propostaId,
}: {
  negocioId: string;
  propostaId: string;
}) {
  const [state, formAction, pending] = useActionState(
    aprovarPropostaAction,
    {},
  );
  return (
    <Stack component="form" action={formAction} spacing={2}>
      <input type="hidden" name="negocioId" value={negocioId} />
      <input type="hidden" name="propostaId" value={propostaId} />
      {state.erro && <Alert severity="error">{state.erro}</Alert>}
      <SubmitButton pending={pending} icon={SendIcon}>
        Aprovar e enviar ao cliente
      </SubmitButton>
    </Stack>
  );
}

export function ProrrogarReservaForm({
  negocioId,
  reservaId,
  opcoes,
}: {
  negocioId: string;
  reservaId: string;
  // Rótulo → nova expiração (ISO), calculada na renderização.
  opcoes: Array<{ rotulo: string; expiraEm: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    prorrogarReservaAction,
    {},
  );
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
        {opcoes.map((opcao) => (
          <form key={opcao.expiraEm} action={formAction}>
            <input type="hidden" name="negocioId" value={negocioId} />
            <input type="hidden" name="reservaId" value={reservaId} />
            <input type="hidden" name="expiraEm" value={opcao.expiraEm} />
            <SubmitButton pending={pending} icon={MoreTimeIcon}>
              {opcao.rotulo}
            </SubmitButton>
          </form>
        ))}
      </Stack>
      {state.erro && <Alert severity="error">{state.erro}</Alert>}
      {state.ok && <Alert severity="success">Reserva prorrogada.</Alert>}
    </Stack>
  );
}
