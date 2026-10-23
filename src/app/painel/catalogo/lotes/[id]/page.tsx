import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { buscarEmpreendimento } from "@/data/empreendimentos";
import { buscarLote } from "@/data/lotes";
import { verificarCorretor } from "@/data/session";
import { statusDeLote } from "@/lib/db/schema";
import { alterarStatusDoLoteAction, editarLoteAction } from "../../actions";
import { corDoStatus, rotuloDoStatus } from "../../formatos";
import { LoteForm } from "../../forms";
import { iconeDoStatus } from "./icones";

export default function LotePage({
  params,
}: PageProps<"/painel/catalogo/lotes/[id]">) {
  return (
    <Stack spacing={4}>
      <Suspense fallback={<Typography>Carregando…</Typography>}>
        <Lote params={params} />
      </Suspense>
    </Stack>
  );
}

async function Lote({ params }: { params: Promise<{ id: string }> }) {
  const session = await verificarCorretor();
  const { id } = await params;
  const lote = await buscarLote(session, id);
  if (!lote) notFound();
  const empreendimento = await buscarEmpreendimento(
    session,
    lote.empreendimentoId,
  );

  return (
    <>
      <Stack component="section" spacing={1}>
        <Typography
          component={Link}
          href={`/painel/catalogo/empreendimentos/${lote.empreendimentoId}`}
          variant="body2"
          color="primary"
        >
          {empreendimento?.nome}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Quadra {lote.quadra} · Lote {lote.numero}
          </Typography>
          <Chip
            label={rotuloDoStatus[lote.status]}
            color={corDoStatus[lote.status]}
            size="small"
          />
        </Stack>
      </Stack>

      <Stack component="section" spacing={2}>
        <Typography variant="h6" component="h2">
          Status
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          {statusDeLote.map((status) => {
            const Icon = iconeDoStatus[status];
            return (
              <form key={status} action={alterarStatusDoLoteAction}>
                <input type="hidden" name="loteId" value={lote.id} />
                <input type="hidden" name="status" value={status} />
                <Button
                  type="submit"
                  variant={lote.status === status ? "contained" : "outlined"}
                  color={
                    corDoStatus[status] === "default"
                      ? "inherit"
                      : corDoStatus[status]
                  }
                  disabled={lote.status === status}
                  disableElevation
                  startIcon={<Icon aria-hidden fontSize="small" />}
                >
                  {rotuloDoStatus[status]}
                </Button>
              </form>
            );
          })}
        </Stack>
      </Stack>

      <Stack component="section" spacing={2}>
        <Typography variant="h6" component="h2">
          Dados do lote
        </Typography>
        <LoteForm
          action={editarLoteAction}
          id={lote.id}
          empreendimentoId={lote.empreendimentoId}
          valores={lote}
        />
      </Stack>
    </>
  );
}
