import CancelIcon from "@mui/icons-material/Cancel";
import PaidIcon from "@mui/icons-material/Paid";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import VerifiedIcon from "@mui/icons-material/Verified";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Fechamento } from "@/data/assinatura-e-pagamento";
import { formatoDataHora } from "../etapas";
import { AcaoDoFechamentoForm } from "../fechamento-forms";

// Ticket 18: proposta assinada e comprovantes (destino dos links das
// pendências "confirmar assinatura" e "confirmar pagamento"). As URLs são
// assinadas e curtas: recarregue a página se expirarem.
export function FechamentoDoNegocio({
  negocioId,
  fechamento,
}: {
  negocioId: string;
  fechamento: Fechamento;
}) {
  const { etapa, propostaAssinada, comprovantes } = fechamento;
  const aguardandoAssinatura = etapa === "aguardando_assinatura";
  return (
    <Stack spacing={2}>
      {propostaAssinada ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Typography>Proposta assinada pelo cliente</Typography>
            <Typography variant="body2" color="text.secondary">
              Recebida em {formatoDataHora.format(propostaAssinada.recebidoEm)}
            </Typography>
            {propostaAssinada.aceito && (
              <Chip
                label="Assinatura confirmada"
                color="success"
                sx={{ alignSelf: "flex-start" }}
              />
            )}
            <Button
              href={propostaAssinada.url}
              target="_blank"
              rel="noopener"
              variant="outlined"
              startIcon={<PictureAsPdfIcon aria-hidden fontSize="small" />}
              sx={{ alignSelf: "flex-start" }}
            >
              Ver PDF assinado
            </Button>
          </Stack>
        </Paper>
      ) : (
        aguardandoAssinatura && (
          <Typography color="text.secondary">
            Aguardando o cliente devolver a proposta assinada no gov.br. O
            assistente lembra o cliente a cada 2 dias.
          </Typography>
        )
      )}

      {aguardandoAssinatura && propostaAssinada && !propostaAssinada.aceito && (
        <>
          <Typography variant="body2" color="text.secondary">
            Confira a assinatura do gov.br no PDF. Ao confirmar, o negócio vai
            para Aguardando pagamento e o assistente envia ao cliente as
            instruções de pagamento da entrada.
          </Typography>
          <AcaoDoFechamentoForm
            negocioId={negocioId}
            acao="confirmar_assinatura"
            rotulo="Confirmar assinatura"
            icone={VerifiedIcon}
          />
          <AcaoDoFechamentoForm
            negocioId={negocioId}
            acao="rejeitar_assinatura"
            rotulo="Rejeitar e pedir reenvio"
            icone={CancelIcon}
            variante="outlined"
            cor="error"
          />
        </>
      )}

      {comprovantes.map((c) => (
        <Paper key={c.id} variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Typography>Comprovante de pagamento</Typography>
            <Typography variant="body2" color="text.secondary">
              Recebido em {formatoDataHora.format(c.recebidoEm)}
            </Typography>
            <Button
              href={c.url}
              target="_blank"
              rel="noopener"
              variant="outlined"
              startIcon={<ReceiptLongIcon aria-hidden fontSize="small" />}
              sx={{ alignSelf: "flex-start" }}
            >
              Ver comprovante
            </Button>
          </Stack>
        </Paper>
      ))}

      {etapa === "aguardando_pagamento" && (
        <>
          {comprovantes.length === 0 && (
            <Typography color="text.secondary">
              Aguardando o comprovante da entrada. O assistente lembra o cliente
              a cada 2 dias.
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            O sistema não processa pagamentos: confira o recebimento antes de
            confirmar. O negócio vai para Ganho e o lote fica vendido.
          </Typography>
          <AcaoDoFechamentoForm
            negocioId={negocioId}
            acao="confirmar_pagamento"
            rotulo="Confirmar pagamento"
            icone={PaidIcon}
          />
        </>
      )}

      {etapa === "ganho" && (
        <Alert severity="success">
          Pagamento confirmado: venda concluída e lote vendido.
        </Alert>
      )}
    </Stack>
  );
}
