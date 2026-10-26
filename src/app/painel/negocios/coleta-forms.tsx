"use client";

import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import { useActionState, useState } from "react";
import { Field, SubmitButton } from "@/app/components/form";
import { apagarDadosDoClienteAction } from "./coleta-actions";

// Ticket 16: "Apagar dados do cliente (LGPD)" com passo de confirmação.
export function ApagarDadosDoClienteForm({
  negocioId,
  clienteId,
}: {
  negocioId: string;
  clienteId: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState(
    apagarDadosDoClienteAction,
    {},
  );
  const fechado = !aberto || state.ok;
  return (
    <>
      <Button
        variant="outlined"
        color="error"
        size="large"
        startIcon={<DeleteForeverIcon aria-hidden fontSize="small" />}
        onClick={() => setAberto(true)}
      >
        Apagar dados do cliente (LGPD)
      </Button>
      <Dialog open={!fechado} onClose={() => setAberto(false)} fullWidth>
        <Stack component="form" action={formAction}>
          <DialogTitle>Apagar dados do cliente?</DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              <DialogContentText>
                Nome, telefone, e-mail, CPF, referências, contatos, mensagens e
                arquivos de documentos serão apagados. O negócio continua no
                quadro, anonimizado. Não dá para desfazer.
              </DialogContentText>
              <input type="hidden" name="negocioId" value={negocioId} />
              <input type="hidden" name="clienteId" value={clienteId} />
              <Field
                label="Digite APAGAR para confirmar"
                name="confirmacao"
                autoComplete="off"
              />
              {state.erro && <Alert severity="error">{state.erro}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button size="large" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <SubmitButton pending={pending} icon={DeleteForeverIcon}>
              Apagar
            </SubmitButton>
          </DialogActions>
        </Stack>
      </Dialog>
    </>
  );
}
