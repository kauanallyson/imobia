import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { PropostaDoNegocio } from "@/data/propostas";
import type { EstadoDaProposta } from "@/lib/db/schema";
import { formatoDataHora } from "../etapas";
import {
  AprovarPropostaForm,
  GerarPropostaForm,
  ProrrogarReservaForm,
} from "../proposta-forms";

const rotuloDoEstado: Record<EstadoDaProposta, string> = {
  em_revisao: "Em revisão",
  enviada: "Enviada: aguardando assinatura",
  assinada: "Assinada",
  expirada: "Expirada",
};

const HORA_MS = 60 * 60 * 1000;

// Ticket 17: a proposta do negócio (destino do link da pendência "revisar
// proposta"). `novoId` torna o "Gerar" idempotente.
export function PropostaDoNegocioSecao({
  negocioId,
  proposta,
  novoId,
}: {
  negocioId: string;
  proposta: PropostaDoNegocio | null;
  novoId: string;
}) {
  if (!proposta) {
    return (
      <Stack spacing={2}>
        <Typography color="text.secondary">
          Nenhuma proposta ainda. Com a coleta completa, o assistente gera a
          proposta sozinho; você também pode gerar agora.
        </Typography>
        <GerarPropostaForm
          negocioId={negocioId}
          propostaId={novoId}
          rotulo="Gerar proposta"
        />
      </Stack>
    );
  }
  const reserva = proposta.reserva;
  const ativa = reserva?.estado === "ativa" ? reserva : null;
  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Chip
            label={rotuloDoEstado[proposta.estado]}
            color={
              proposta.estado === "em_revisao"
                ? "warning"
                : proposta.estado === "expirada"
                  ? "default"
                  : "success"
            }
            sx={{ alignSelf: "flex-start" }}
          />
          <Typography>
            Quadra {proposta.lote.quadra}, lote {proposta.lote.numero} · plano{" "}
            {proposta.plano}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gerada em {formatoDataHora.format(proposta.criadaEm)}
            {proposta.enviadaEm &&
              ` · enviada em ${formatoDataHora.format(proposta.enviadaEm)}`}
          </Typography>
          <Button
            href={proposta.urlPdf}
            target="_blank"
            rel="noopener"
            variant="outlined"
            startIcon={<PictureAsPdfIcon aria-hidden fontSize="small" />}
            sx={{ alignSelf: "flex-start" }}
          >
            Ver PDF
          </Button>
        </Stack>
      </Paper>

      {proposta.estado === "em_revisao" && (
        <>
          <Typography variant="body2" color="text.secondary">
            Confira o PDF. Ao aprovar, ele vai ao cliente pelo WhatsApp com as
            instruções para assinar no gov.br e o lote fica reservado por 72h.
          </Typography>
          <AprovarPropostaForm negocioId={negocioId} propostaId={proposta.id} />
        </>
      )}

      {ativa && (
        <>
          <Alert severity="info">
            Lote reservado até {formatoDataHora.format(ativa.expiraEm)}.
          </Alert>
          <ProrrogarReservaForm
            negocioId={negocioId}
            reservaId={ativa.id}
            opcoes={[24, 72].map((horas) => ({
              rotulo: `Prorrogar ${horas}h`,
              expiraEm: new Date(
                ativa.expiraEm.getTime() + horas * HORA_MS,
              ).toISOString(),
            }))}
          />
        </>
      )}

      {proposta.estado === "expirada" && (
        <>
          <Alert severity="warning">
            A reserva expirou e o lote voltou a ficar disponível.
          </Alert>
          <GerarPropostaForm
            negocioId={negocioId}
            propostaId={novoId}
            rotulo="Gerar nova proposta"
          />
        </>
      )}
    </Stack>
  );
}
