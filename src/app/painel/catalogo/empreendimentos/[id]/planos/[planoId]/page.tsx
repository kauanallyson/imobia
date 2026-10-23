import DeleteIcon from "@mui/icons-material/Delete";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { buscarPlanoDePagamento } from "@/data/planos-de-pagamento";
import { verificarCorretor } from "@/data/session";
import { editarPlanoAction, removerPlanoAction } from "../actions";
import { PlanoForm } from "../forms";

type Props =
  PageProps<"/painel/catalogo/empreendimentos/[id]/planos/[planoId]">;

export default function PlanoPage({ params }: Props) {
  return (
    <Stack spacing={4}>
      <Suspense fallback={<Typography>Carregando…</Typography>}>
        <Plano params={params} />
      </Suspense>
    </Stack>
  );
}

async function Plano({ params }: Pick<Props, "params">) {
  const session = await verificarCorretor();
  const { id, planoId } = await params;
  const plano = await buscarPlanoDePagamento(session, planoId);
  if (!plano || plano.empreendimentoId !== id) notFound();

  return (
    <>
      <Stack component="section" spacing={0.5}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {plano.nome}
        </Typography>
        <Typography color="text.secondary">
          <Link href={`/painel/catalogo/empreendimentos/${id}/planos`}>
            Planos de pagamento
          </Link>
        </Typography>
      </Stack>
      <PlanoForm
        action={editarPlanoAction}
        id={plano.id}
        empreendimentoId={id}
        valores={plano}
      />
      <Stack component="form" action={removerPlanoAction} spacing={1}>
        <input type="hidden" name="planoId" value={plano.id} />
        <input type="hidden" name="empreendimentoId" value={id} />
        <Button
          type="submit"
          color="error"
          variant="outlined"
          size="large"
          startIcon={<DeleteIcon aria-hidden fontSize="small" />}
        >
          Remover plano
        </Button>
      </Stack>
    </>
  );
}
