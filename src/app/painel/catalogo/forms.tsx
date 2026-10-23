"use client";

import AddHomeIcon from "@mui/icons-material/AddHome";
import ApartmentIcon from "@mui/icons-material/Apartment";
import BusinessIcon from "@mui/icons-material/Business";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import SaveIcon from "@mui/icons-material/Save";
import Alert from "@mui/material/Alert";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import { useActionState } from "react";
import { Field, SubmitButton } from "@/app/components/form";
import type { Empreendimento } from "@/data/empreendimentos";
import type { Incorporadora } from "@/data/incorporadoras";
import type { Lote } from "@/data/lotes";
import type { ModeloDeCasa } from "@/data/modelos-de-casa";
import type { FormState } from "./actions";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

// Um formulário serve para criar (sem `valores`) e editar (com `valores`).
// `id` é gerado pelo servidor na renderização: reenviar não duplica; na
// edição, `id` é o do registro.
type FormProps<T> = { action: Action; id: string; valores?: T };

function Mensagens({ state, salvo }: { state: FormState; salvo?: string }) {
  if (state.erro) return <Alert severity="error">{state.erro}</Alert>;
  if (state.ok && salvo) return <Alert severity="success">{salvo}</Alert>;
  return null;
}

const numero = (step = "0.01", min = "0") => ({
  type: "number" as const,
  slotProps: { htmlInput: { step, min, inputMode: "decimal" as const } },
});

export function IncorporadoraForm({
  action,
  id,
  valores,
}: FormProps<Incorporadora>) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <Stack component="form" action={formAction} spacing={2}>
      <input type="hidden" name="id" value={id} />
      <Field label="Nome" name="nome" defaultValue={valores?.nome} />
      <Mensagens state={state} salvo={valores && "Incorporadora salva."} />
      <SubmitButton pending={pending} icon={valores ? SaveIcon : BusinessIcon}>
        {valores ? "Salvar" : "Criar incorporadora"}
      </SubmitButton>
    </Stack>
  );
}

export function EmpreendimentoForm({
  action,
  id,
  valores,
  incorporadoras,
}: FormProps<Empreendimento> & { incorporadoras: Incorporadora[] }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <Stack component="form" action={formAction} spacing={2}>
      <input type="hidden" name="id" value={id} />
      <Field label="Nome" name="nome" defaultValue={valores?.nome} />
      <Field
        label="Incorporadora"
        name="incorporadoraId"
        select
        defaultValue={valores?.incorporadoraId ?? incorporadoras[0]?.id ?? ""}
      >
        {incorporadoras.map((i) => (
          <MenuItem key={i.id} value={i.id}>
            {i.nome}
          </MenuItem>
        ))}
      </Field>
      <Field label="Cidade" name="cidade" defaultValue={valores?.cidade} />
      <Field
        label="Endereço / localização"
        name="endereco"
        multiline
        minRows={2}
        defaultValue={valores?.endereco}
      />
      <Mensagens state={state} salvo={valores && "Empreendimento salvo."} />
      <SubmitButton pending={pending} icon={valores ? SaveIcon : ApartmentIcon}>
        {valores ? "Salvar" : "Criar empreendimento"}
      </SubmitButton>
    </Stack>
  );
}

export function LoteForm({
  action,
  id,
  valores,
  empreendimentoId,
}: FormProps<Lote> & { empreendimentoId: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <Stack component="form" action={formAction} spacing={2}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="empreendimentoId" value={empreendimentoId} />
      <Stack direction="row" spacing={2}>
        <Field label="Quadra" name="quadra" defaultValue={valores?.quadra} />
        <Field label="Número" name="numero" defaultValue={valores?.numero} />
      </Stack>
      <Field
        label="Área (m²)"
        name="area"
        defaultValue={valores?.area}
        {...numero()}
      />
      <Stack direction="row" spacing={2}>
        <Field
          label="Frente (m)"
          name="frente"
          defaultValue={valores?.frente}
          {...numero()}
        />
        <Field
          label="Fundo (m)"
          name="fundo"
          defaultValue={valores?.fundo}
          {...numero()}
        />
      </Stack>
      <Field
        label="Preço (R$)"
        name="preco"
        defaultValue={valores?.preco}
        {...numero()}
      />
      <Mensagens state={state} salvo={valores && "Lote salvo."} />
      <SubmitButton
        pending={pending}
        icon={valores ? SaveIcon : CropSquareIcon}
      >
        {valores ? "Salvar" : "Cadastrar lote"}
      </SubmitButton>
    </Stack>
  );
}

export function ModeloDeCasaForm({
  action,
  id,
  valores,
  empreendimentoId,
}: FormProps<ModeloDeCasa> & { empreendimentoId: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const contagem = numero("1", "0");
  return (
    <Stack component="form" action={formAction} spacing={2}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="empreendimentoId" value={empreendimentoId} />
      <Field label="Nome" name="nome" defaultValue={valores?.nome} />
      <Field
        label="Área construída (m²)"
        name="areaConstruida"
        defaultValue={valores?.areaConstruida}
        {...numero()}
      />
      <Stack direction="row" spacing={2}>
        <Field
          label="Quartos"
          name="quartos"
          defaultValue={valores?.quartos}
          {...contagem}
        />
        <Field
          label="Suítes"
          name="suites"
          defaultValue={valores?.suites}
          {...contagem}
        />
      </Stack>
      <Stack direction="row" spacing={2}>
        <Field
          label="Banheiros"
          name="banheiros"
          defaultValue={valores?.banheiros}
          {...contagem}
        />
        <Field
          label="Vagas"
          name="vagas"
          defaultValue={valores?.vagas}
          {...contagem}
        />
      </Stack>
      <Field
        label="Preço (R$)"
        name="preco"
        defaultValue={valores?.preco}
        {...numero()}
      />
      <Mensagens state={state} salvo={valores && "Modelo de casa salvo."} />
      <SubmitButton pending={pending} icon={valores ? SaveIcon : AddHomeIcon}>
        {valores ? "Salvar" : "Cadastrar modelo de casa"}
      </SubmitButton>
    </Stack>
  );
}
