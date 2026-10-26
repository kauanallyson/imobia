"use client";

import type { SvgIconComponent } from "@mui/icons-material";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { useActionState } from "react";
import { fechamentoAction } from "./fechamento-actions";

// Ticket 18: um botão de decisão (confirmar/rejeitar assinatura, confirmar
// pagamento) com o erro logo abaixo.
export function AcaoDoFechamentoForm({
  negocioId,
  acao,
  rotulo,
  icone: Icone,
  variante = "contained",
  cor = "primary",
}: {
  negocioId: string;
  acao: "confirmar_assinatura" | "rejeitar_assinatura" | "confirmar_pagamento";
  rotulo: string;
  icone: SvgIconComponent;
  variante?: "contained" | "outlined";
  cor?: "primary" | "error" | "success";
}) {
  const [state, formAction, pending] = useActionState(fechamentoAction, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="negocioId" value={negocioId} />
      <input type="hidden" name="acao" value={acao} />
      <Button
        type="submit"
        variant={variante}
        color={cor}
        size="large"
        disableElevation
        fullWidth
        disabled={pending}
        startIcon={
          pending ? (
            <CircularProgress size={18} color="inherit" />
          ) : (
            <Icone aria-hidden fontSize="small" />
          )
        }
      >
        {rotulo}
      </Button>
      {state.erro && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {state.erro}
        </Alert>
      )}
    </form>
  );
}
