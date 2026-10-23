"use client";

import SaveIcon from "@mui/icons-material/Save";
import SearchIcon from "@mui/icons-material/Search";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useActionState } from "react";
import { Field, SubmitButton } from "@/app/components/form";
import {
  type BuscaState,
  salvarBaseDeConhecimentoAction,
  testarPerguntaAction,
} from "../../../actions";

export function BaseDeConhecimentoForm({
  empreendimentoId,
  texto,
}: {
  empreendimentoId: string;
  texto: string;
}) {
  const [state, formAction, pending] = useActionState(
    salvarBaseDeConhecimentoAction,
    {},
  );
  return (
    <Stack component="form" action={formAction} spacing={2}>
      <input type="hidden" name="empreendimentoId" value={empreendimentoId} />
      <Field
        label="Base de conhecimento"
        name="texto"
        required={false}
        multiline
        minRows={12}
        defaultValue={texto}
        helperText="Localização, infraestrutura, lazer, perguntas frequentes… Use títulos (# Título) e parágrafos: cada bloco vira um trecho que o assistente consulta."
      />
      {state.erro && <Alert severity="error">{state.erro}</Alert>}
      {state.ok && (
        <Alert severity="success">Base de conhecimento salva e indexada.</Alert>
      )}
      <SubmitButton pending={pending} icon={SaveIcon}>
        Salvar e indexar
      </SubmitButton>
    </Stack>
  );
}

export function TestarPerguntaForm({
  empreendimentoId,
}: {
  empreendimentoId: string;
}) {
  const [state, formAction, pending] = useActionState<BuscaState, FormData>(
    testarPerguntaAction,
    {},
  );
  return (
    <Stack spacing={2}>
      <Stack component="form" action={formAction} spacing={2}>
        <input type="hidden" name="empreendimentoId" value={empreendimentoId} />
        <Field
          label="Pergunta de um cliente"
          name="pergunta"
          defaultValue={state.pergunta}
          placeholder="Ex.: Aceita financiamento pela Caixa?"
        />
        {state.erro && <Alert severity="error">{state.erro}</Alert>}
        <SubmitButton pending={pending} icon={SearchIcon}>
          Testar pergunta
        </SubmitButton>
      </Stack>
      {state.trechos && state.trechos.length === 0 && (
        <Typography color="text.secondary">
          Nenhum trecho encontrado. Salve a base primeiro.
        </Typography>
      )}
      {state.trechos?.map((trecho, i) => (
        <Paper key={trecho.texto} variant="outlined" sx={{ p: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Trecho {i + 1} · distância {trecho.distancia.toFixed(3)}
          </Typography>
          <Typography sx={{ whiteSpace: "pre-wrap" }}>
            {trecho.texto}
          </Typography>
        </Paper>
      ))}
    </Stack>
  );
}
