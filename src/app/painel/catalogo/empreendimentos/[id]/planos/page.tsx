import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { buscarEmpreendimento } from "@/data/empreendimentos";
import { listarLotes } from "@/data/lotes";
import { listarModelosDeCasa } from "@/data/modelos-de-casa";
import {
  calcularPlanoParaLote,
  listarPlanosDePagamento,
} from "@/data/planos-de-pagamento";
import { verificarCorretor } from "@/data/session";
import { formatarReais } from "../../../formatos";
import { criarPlanoAction } from "./actions";
import { PlanoForm, SimuladorForm } from "./forms";

type Props = PageProps<"/painel/catalogo/empreendimentos/[id]/planos">;

export default function PlanosPage({ params, searchParams }: Props) {
  return (
    <Stack spacing={4}>
      <Suspense fallback={<Typography>Carregando…</Typography>}>
        <Planos params={params} searchParams={searchParams} />
      </Suspense>
    </Stack>
  );
}

const uuid = (v: string | string[] | undefined) =>
  typeof v === "string" && v ? v : undefined;

async function Planos({ params, searchParams }: Props) {
  const session = await verificarCorretor();
  const [{ id }, busca] = await Promise.all([params, searchParams]);
  const empreendimento = await buscarEmpreendimento(session, id);
  if (!empreendimento) notFound();
  const [planos, lotes, modelos] = await Promise.all([
    listarPlanosDePagamento(session, empreendimento.id),
    listarLotes(session, empreendimento.id),
    listarModelosDeCasa(session, empreendimento.id),
  ]);

  const loteId = uuid(busca.loteId) ?? lotes[0]?.id;
  const modeloDeCasaId = uuid(busca.modeloDeCasaId);
  const simulacoes = loteId
    ? await Promise.all(
        planos.map(async (plano) => ({
          plano,
          resultado: await calcularPlanoParaLote(session, {
            loteId,
            modeloDeCasaId,
            planoId: plano.id,
          }),
        })),
      )
    : [];

  return (
    <>
      <Stack component="section" spacing={0.5}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Planos de pagamento
        </Typography>
        <Typography color="text.secondary">
          <Link href={`/painel/catalogo/empreendimentos/${empreendimento.id}`}>
            {empreendimento.nome}
          </Link>
        </Typography>
      </Stack>

      <Stack component="section" spacing={2}>
        <Typography variant="h6" component="h2">
          Simulação
        </Typography>
        {lotes.length === 0 ? (
          <Typography color="text.secondary">
            Cadastre um lote para simular os planos.
          </Typography>
        ) : (
          <>
            <SimuladorForm
              lotes={lotes}
              modelos={modelos}
              loteId={loteId}
              modeloDeCasaId={modeloDeCasaId}
            />
            {simulacoes.length === 0 ? (
              <Typography color="text.secondary">
                Nenhum plano ainda.
              </Typography>
            ) : (
              <Paper variant="outlined">
                <List disablePadding>
                  {simulacoes.map(({ plano, resultado }) => (
                    <ListItemText
                      key={plano.id}
                      sx={{ px: 2, py: 1.5 }}
                      primary={plano.nome}
                      secondary={
                        resultado
                          ? `Total ${formatarReais(resultado.precoTotal)} · entrada ${formatarReais(resultado.entrada)} · ${resultado.parcelas}x de ${formatarReais(resultado.parcela)}`
                          : "Não foi possível calcular."
                      }
                    />
                  ))}
                </List>
              </Paper>
            )}
          </>
        )}
      </Stack>

      <Stack component="section" spacing={2}>
        <Typography variant="h6" component="h2">
          Planos cadastrados
        </Typography>
        {planos.length === 0 ? (
          <Typography color="text.secondary">Nenhum plano ainda.</Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {planos.map((plano) => (
                <ListItemButton
                  key={plano.id}
                  component={Link}
                  href={`/painel/catalogo/empreendimentos/${empreendimento.id}/planos/${plano.id}`}
                  divider
                >
                  <ListItemText
                    primary={plano.nome}
                    secondary={`Entrada ${plano.percentualDeEntrada}% · ${plano.numeroDeParcelas} parcelas${plano.condicoes ? ` · ${plano.condicoes}` : ""}`}
                  />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        )}
        <Typography variant="subtitle1" component="h3">
          Novo plano
        </Typography>
        <PlanoForm
          action={criarPlanoAction}
          id={crypto.randomUUID()}
          empreendimentoId={empreendimento.id}
        />
      </Stack>
    </>
  );
}
