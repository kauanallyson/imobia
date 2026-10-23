import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { buscarBaseDeConhecimento } from "@/data/base-de-conhecimento";
import { buscarEmpreendimento } from "@/data/empreendimentos";
import { verificarCorretor } from "@/data/session";
import { BaseDeConhecimentoForm, TestarPerguntaForm } from "./forms";

export const metadata: Metadata = { title: "Base de conhecimento" };

export default function ConhecimentoPage({
  params,
}: PageProps<"/painel/catalogo/empreendimentos/[id]/conhecimento">) {
  return (
    <Stack spacing={4}>
      <Suspense fallback={<Typography>Carregando…</Typography>}>
        <Conhecimento params={params} />
      </Suspense>
    </Stack>
  );
}

async function Conhecimento({ params }: { params: Promise<{ id: string }> }) {
  const session = await verificarCorretor();
  const { id } = await params;
  const empreendimento = await buscarEmpreendimento(session, id);
  if (!empreendimento) notFound();
  const base = await buscarBaseDeConhecimento(session, empreendimento.id);

  return (
    <>
      <Stack component="section" spacing={1}>
        <Typography
          component={Link}
          href={`/painel/catalogo/empreendimentos/${empreendimento.id}`}
          variant="body2"
          color="primary"
        >
          {empreendimento.nome}
        </Typography>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Base de conhecimento
        </Typography>
        <Typography color="text.secondary">
          O que o assistente pode dizer sobre este empreendimento. Fora daqui,
          ele não inventa: cria uma pendência para você.
        </Typography>
      </Stack>

      <Stack component="section" spacing={2}>
        <BaseDeConhecimentoForm
          empreendimentoId={empreendimento.id}
          texto={base?.texto ?? ""}
        />
      </Stack>

      <Stack component="section" spacing={2}>
        <Typography variant="h6" component="h2">
          Testar uma pergunta
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Veja quais trechos o assistente encontraria para uma pergunta (
          {base?.trechos ?? 0} indexados).
        </Typography>
        <TestarPerguntaForm empreendimentoId={empreendimento.id} />
      </Stack>
    </>
  );
}
