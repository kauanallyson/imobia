"use client";

import UploadFileIcon from "@mui/icons-material/UploadFile";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import { useActionState } from "react";
import { Field, SubmitButton } from "@/app/components/form";
import { enviarModeloDePropostaAction } from "./actions";

// Ticket 17: envio (ou substituição) do modelo DOCX da proposta.
export function ModeloDePropostaForm({
  incorporadoraId,
  substituir,
}: {
  incorporadoraId: string;
  substituir: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    enviarModeloDePropostaAction,
    {},
  );
  return (
    <Stack component="form" action={formAction} spacing={2}>
      <input type="hidden" name="incorporadoraId" value={incorporadoraId} />
      <Field
        label="Arquivo DOCX (Word, até 10 MB)"
        name="arquivo"
        type="file"
        slotProps={{
          inputLabel: { shrink: true },
          htmlInput: {
            accept:
              ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          },
        }}
      />
      {state.erro && <Alert severity="error">{state.erro}</Alert>}
      {state.ok && <Alert severity="success">Modelo enviado.</Alert>}
      <SubmitButton pending={pending} icon={UploadFileIcon}>
        {substituir ? "Substituir modelo" : "Enviar modelo"}
      </SubmitButton>
    </Stack>
  );
}
