import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { buscarEmpreendimento } from "@/data/empreendimentos";
import { buscarModeloDeCasa } from "@/data/modelos-de-casa";
import { verificarCorretor } from "@/data/session";
import { editarModeloDeCasaAction } from "../../actions";
import { ModeloDeCasaForm } from "../../forms";

export default function ModeloDeCasaPage({
  params,
}: PageProps<"/painel/catalogo/modelos/[id]">) {
  return (
    <Stack spacing={2}>
      <Suspense fallback={<Typography>Carregando…</Typography>}>
        <ModeloDeCasa params={params} />
      </Suspense>
    </Stack>
  );
}

async function ModeloDeCasa({ params }: { params: Promise<{ id: string }> }) {
  const session = await verificarCorretor();
  const { id } = await params;
  const modelo = await buscarModeloDeCasa(session, id);
  if (!modelo) notFound();
  const empreendimento = await buscarEmpreendimento(
    session,
    modelo.empreendimentoId,
  );

  return (
    <>
      <Typography
        component={Link}
        href={`/painel/catalogo/empreendimentos/${modelo.empreendimentoId}`}
        variant="body2"
        color="primary"
      >
        {empreendimento?.nome}
      </Typography>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
        {modelo.nome}
      </Typography>
      <ModeloDeCasaForm
        action={editarModeloDeCasaAction}
        id={modelo.id}
        empreendimentoId={modelo.empreendimentoId}
        valores={modelo}
      />
    </>
  );
}
