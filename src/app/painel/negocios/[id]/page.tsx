import AddBusinessIcon from "@mui/icons-material/AddBusiness";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import ReplayIcon from "@mui/icons-material/Replay";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { buscarNegocio, type NegocioDetalhado } from "@/data/negocios";
import { verificarCorretor } from "@/data/session";
import {
  assistenteDaConversaAction,
  criarNegocioAction,
  reabrirAction,
} from "../actions";
import { formatarTelefone, formatoDataHora, rotuloDaEtapa } from "../etapas";
import { MarcarPerdidoForm, MudarEtapaForm } from "../forms";

export const metadata: Metadata = { title: "Negócio" };

export default function NegocioPage({
  params,
}: PageProps<"/painel/negocios/[id]">) {
  return (
    <Container component="main" maxWidth="sm" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Button
          component={Link}
          href="/painel"
          startIcon={<ArrowBackIcon aria-hidden fontSize="small" />}
          sx={{ alignSelf: "flex-start" }}
        >
          Quadro
        </Button>
        <Suspense fallback={<Typography>Carregando…</Typography>}>
          <Negocio params={params} />
        </Suspense>
      </Stack>
    </Container>
  );
}

async function Negocio({ params }: { params: Promise<{ id: string }> }) {
  const session = await verificarCorretor();
  const { id } = await params;
  const negocio = await buscarNegocio(session, id);
  if (!negocio) notFound();
  const { cliente, conversa, historico, lote } = negocio;

  return (
    <>
      <Stack component="header" spacing={1}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {cliente.nome}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Chip
            label={rotuloDaEtapa[negocio.etapa]}
            color={
              negocio.etapa === "ganho"
                ? "success"
                : negocio.etapa === "perdido"
                  ? "error"
                  : "primary"
            }
          />
          <Typography variant="body2" color="text.secondary">
            desde {formatoDataHora.format(negocio.atualizadoEm)}
          </Typography>
        </Stack>
        {negocio.etapa === "perdido" && (
          <Alert severity="warning">
            Motivo da perda: {negocio.motivoPerda}
          </Alert>
        )}
      </Stack>

      <Secao titulo="Etapa">
        {negocio.etapa === "perdido" ? (
          <form action={reabrirAction}>
            <input type="hidden" name="negocioId" value={negocio.id} />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disableElevation
              fullWidth
              startIcon={<ReplayIcon aria-hidden fontSize="small" />}
            >
              Reabrir negócio
            </Button>
          </form>
        ) : (
          <Stack spacing={3}>
            <MudarEtapaForm negocioId={negocio.id} etapa={negocio.etapa} />
            <Divider />
            <MarcarPerdidoForm negocioId={negocio.id} />
          </Stack>
        )}
      </Secao>

      <Secao titulo="Cliente">
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={0.5}>
            <Typography>{cliente.nome}</Typography>
            <Typography color="text.secondary">
              {formatarTelefone(cliente.telefone)}
            </Typography>
            {cliente.email && (
              <Typography color="text.secondary">{cliente.email}</Typography>
            )}
            {cliente.cpf && (
              <Typography color="text.secondary">CPF {cliente.cpf}</Typography>
            )}
          </Stack>
        </Paper>
        <form action={criarNegocioAction}>
          <input type="hidden" name="clienteId" value={cliente.id} />
          <input type="hidden" name="negocioId" value={crypto.randomUUID()} />
          <Button
            type="submit"
            variant="outlined"
            startIcon={<AddBusinessIcon aria-hidden fontSize="small" />}
          >
            Novo negócio para este cliente
          </Button>
        </form>
      </Secao>

      <Secao titulo="Lote de interesse">
        {lote ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography>
              Quadra {lote.quadra}, lote {lote.numero}
            </Typography>
            <Typography color="text.secondary">
              {lote.empreendimentoNome} · {rotuloDoStatus[lote.status]}
            </Typography>
          </Paper>
        ) : (
          <Typography color="text.secondary">
            Nenhum lote escolhido ainda.
          </Typography>
        )}
      </Secao>

      <Secao titulo="Conversa">
        {conversa && <Assistente negocioId={negocio.id} conversa={conversa} />}
        {!conversa ? (
          <Typography color="text.secondary">
            Sem conversa no WhatsApp: este cliente foi cadastrado à mão.
          </Typography>
        ) : conversa.mensagens.length === 0 ? (
          <Typography color="text.secondary">
            Nenhuma mensagem ainda.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {conversa.mensagens.map((m) => (
              <Mensagem key={m.id} mensagem={m} />
            ))}
          </Stack>
        )}
      </Secao>

      <Secao titulo="Histórico de etapas">
        <Stack spacing={1}>
          {historico.map((h) => (
            <Typography key={`${h.em.toISOString()}-${h.para}`} variant="body2">
              <Box component="span" sx={{ color: "text.secondary" }}>
                {formatoDataHora.format(h.em)} ·{" "}
              </Box>
              {h.de ? `${rotuloDaEtapa[h.de]} → ` : ""}
              <Box component="span" sx={{ fontWeight: 700 }}>
                {rotuloDaEtapa[h.para]}
              </Box>
              <Box component="span" sx={{ color: "text.secondary" }}>
                {" "}
                ({autorRotulo[h.autor]})
              </Box>
            </Typography>
          ))}
        </Stack>
      </Secao>
    </>
  );
}

const rotuloDoAssistente = {
  ativo: "Assistente ativo",
  pausado: "Assistente pausado: você assumiu",
  desligado: "Assistente desligado",
} as const;

// Ticket 10: estado do assistente nesta conversa e os botões de controle.
// Com opt-out do cliente não há botão: ninguém religa.
function Assistente({
  negocioId,
  conversa,
}: {
  negocioId: string;
  conversa: Pick<
    NonNullable<NegocioDetalhado["conversa"]>,
    "id" | "assistente" | "optOut"
  >;
}) {
  if (conversa.optOut) {
    return (
      <Alert severity="info">
        O cliente pediu para não receber mais mensagens. O assistente está
        desligado em definitivo nesta conversa.
      </Alert>
    );
  }
  const botao = (
    acao: "devolver" | "ligar" | "desligar",
    rotulo: string,
    icone: React.ReactNode,
    variant: "contained" | "outlined",
  ) => (
    <form action={assistenteDaConversaAction}>
      <input type="hidden" name="negocioId" value={negocioId} />
      <input type="hidden" name="conversaId" value={conversa.id} />
      <input type="hidden" name="acao" value={acao} />
      <Button
        type="submit"
        variant={variant}
        size="large"
        disableElevation
        fullWidth
        startIcon={icone}
      >
        {rotulo}
      </Button>
    </form>
  );
  return (
    <Stack spacing={2}>
      <Chip
        label={rotuloDoAssistente[conversa.assistente]}
        color={
          conversa.assistente === "ativo"
            ? "success"
            : conversa.assistente === "pausado"
              ? "warning"
              : "default"
        }
        sx={{ alignSelf: "flex-start" }}
      />
      {conversa.assistente === "pausado" &&
        botao(
          "devolver",
          "Devolver ao assistente",
          <SmartToyIcon aria-hidden fontSize="small" />,
          "contained",
        )}
      {conversa.assistente === "desligado"
        ? botao(
            "ligar",
            "Ligar assistente",
            <PowerSettingsNewIcon aria-hidden fontSize="small" />,
            "contained",
          )
        : botao(
            "desligar",
            "Desligar assistente",
            <PowerSettingsNewIcon aria-hidden fontSize="small" />,
            "outlined",
          )}
    </Stack>
  );
}

const rotuloDoStatus = {
  disponivel: "disponível",
  reservado: "reservado",
  vendido: "vendido",
} as const;

const autorRotulo = {
  corretor: "você",
  assistente: "assistente",
  sistema: "sistema",
} as const;

function Secao({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <Stack component="section" spacing={2}>
      <Typography variant="h6" component="h2">
        {titulo}
      </Typography>
      {children}
    </Stack>
  );
}

type MensagemDaConversa = NonNullable<
  NegocioDetalhado["conversa"]
>["mensagens"][number];

const rotuloDaMidia = {
  imagem: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  documento: "Documento",
  figurinha: "Figurinha",
} as const;

// Balões: cliente à esquerda; corretor e assistente à direita.
function Mensagem({ mensagem: m }: { mensagem: MensagemDaConversa }) {
  const doCliente = m.autor === "cliente";
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        maxWidth: "85%",
        alignSelf: doCliente ? "flex-start" : "flex-end",
        bgcolor: doCliente ? "background.paper" : "action.hover",
      }}
    >
      {m.midia && (
        <Typography variant="body2" color="text.secondary">
          {rotuloDaMidia[m.midia.tipo]}
          {m.midia.nomeDoArquivo ? ` · ${m.midia.nomeDoArquivo}` : ""}
        </Typography>
      )}
      {m.texto && (
        <Typography sx={{ whiteSpace: "pre-wrap" }}>{m.texto}</Typography>
      )}
      {m.transcricao && (
        <Typography sx={{ whiteSpace: "pre-wrap", fontStyle: "italic" }}>
          Transcrição: {m.transcricao}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary">
        {m.autor === "cliente"
          ? "Cliente"
          : m.autor === "assistente"
            ? "Assistente"
            : "Você"}{" "}
        · {formatoDataHora.format(m.enviadaEm)}
      </Typography>
    </Paper>
  );
}
