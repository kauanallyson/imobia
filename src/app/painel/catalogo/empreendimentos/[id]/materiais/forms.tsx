"use client";

import UploadFileIcon from "@mui/icons-material/UploadFile";
import Alert from "@mui/material/Alert";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import { useActionState } from "react";
import { Field, SubmitButton } from "@/app/components/form";
import type { FormState } from "../../../actions";
import { rotuloDoDestino } from "./formatos";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function MaterialForm({
  action,
  id,
  empreendimentoId,
}: {
  action: Action;
  id: string;
  empreendimentoId: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <Stack component="form" action={formAction} spacing={2}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="empreendimentoId" value={empreendimentoId} />
      <Field
        label="Arquivo (PDF, imagem ou vídeo, até 25 MB)"
        name="arquivo"
        type="file"
        slotProps={{
          inputLabel: { shrink: true },
          htmlInput: { accept: "application/pdf,image/*,video/*" },
        }}
      />
      <Field
        label="Nome (opcional; usa o nome do arquivo)"
        name="nome"
        required={false}
      />
      <Field label="Destino" name="destino" select defaultValue="ambos">
        {Object.entries(rotuloDoDestino).map(([valor, rotulo]) => (
          <MenuItem key={valor} value={valor}>
            {rotulo}
          </MenuItem>
        ))}
      </Field>
      {state.erro && <Alert severity="error">{state.erro}</Alert>}
      {state.ok && <Alert severity="success">Material enviado.</Alert>}
      <SubmitButton pending={pending} icon={UploadFileIcon}>
        Enviar material
      </SubmitButton>
    </Stack>
  );
}
