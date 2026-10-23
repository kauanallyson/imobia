import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buscarIncorporadora } from "@/data/incorporadoras";
import { verificarCorretor } from "@/data/session";
import { editarIncorporadoraAction } from "../../actions";
import { IncorporadoraForm } from "../../forms";

export default function IncorporadoraPage({
  params,
}: PageProps<"/painel/catalogo/incorporadoras/[id]">) {
  return (
    <Stack spacing={2}>
      <Suspense fallback={<Typography>Carregando…</Typography>}>
        <Incorporadora params={params} />
      </Suspense>
    </Stack>
  );
}

async function Incorporadora({ params }: { params: Promise<{ id: string }> }) {
  const session = await verificarCorretor();
  const { id } = await params;
  const incorporadora = await buscarIncorporadora(session, id);
  if (!incorporadora) notFound();

  return (
    <>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
        {incorporadora.nome}
      </Typography>
      <IncorporadoraForm
        action={editarIncorporadoraAction}
        id={incorporadora.id}
        valores={incorporadora}
      />
    </>
  );
}
