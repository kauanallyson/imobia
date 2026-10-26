import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  type buscarColeta,
  type DocumentoDoCliente,
  rotuloDoItem,
} from "@/data/coleta-de-dados";
import type { TipoDeDocumento } from "@/lib/db/schema";
import { avaliarDocumentoAction } from "../coleta-actions";
import { ApagarDadosDoClienteForm } from "../coleta-forms";
import { formatarTelefone, formatoDataHora } from "../etapas";

type Coleta = NonNullable<Awaited<ReturnType<typeof buscarColeta>>>;

const rotuloDoDocumento: Record<TipoDeDocumento, string> = {
  cpf: "CPF",
  rg: "RG",
  comprovante_endereco: "Comprovante de endereço",
};

const rotuloDaForma = { cartao: "Cartão", pix: "Pix" } as const;

const formatoData = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "UTC",
});

// Ticket 16: o que o assistente coletou do cliente, os documentos (URL
// assinada de curta duração) com aceitar/rejeitar e a exclusão LGPD.
export function ColetaDeDados({
  negocioId,
  coleta,
  emColeta,
}: {
  negocioId: string;
  coleta: Coleta;
  // Em Coletando dados mostra o que falta.
  emColeta: boolean;
}) {
  const { cliente, documentos, faltando } = coleta;
  if (cliente.anonimizado) {
    return (
      <Alert severity="info">
        Os dados pessoais e os documentos deste cliente foram apagados a pedido
        dele (LGPD). O negócio segue no histórico, anonimizado.
      </Alert>
    );
  }
  return (
    <Stack spacing={2}>
      {!emColeta ? null : faltando.length > 0 ? (
        <Alert severity="warning">
          Falta: {faltando.map((i) => rotuloDoItem[i]).join("; ")}.
        </Alert>
      ) : (
        <Alert severity="success">Coleta completa.</Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={0.5}>
          <Typography>E-mail: {cliente.email ?? "—"}</Typography>
          <Typography>CPF: {cliente.cpf ?? "—"}</Typography>
          {cliente.contatosExtras.length > 0 && (
            <Typography>
              Outros contatos: {cliente.contatosExtras.join(", ")}
            </Typography>
          )}
          <Typography>
            Pagamento:{" "}
            {cliente.formaDePagamento
              ? rotuloDaForma[cliente.formaDePagamento]
              : "—"}
            {cliente.diaDePagamento
              ? `, todo dia ${cliente.diaDePagamento}`
              : ""}
          </Typography>
          {cliente.primeiraParcela && (
            <Typography color="text.secondary">
              Primeira parcela em{" "}
              {formatoData.format(new Date(cliente.primeiraParcela))}
            </Typography>
          )}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={0.5}>
          <Typography sx={{ fontWeight: 700 }}>Referências</Typography>
          {cliente.referencias.length === 0 ? (
            <Typography color="text.secondary">Nenhuma ainda.</Typography>
          ) : (
            cliente.referencias.map((r) => (
              <Typography key={r.telefone}>
                {r.nome} · {formatarTelefone(r.telefone)}
              </Typography>
            ))
          )}
        </Stack>
      </Paper>

      <Typography sx={{ fontWeight: 700 }}>Documentos</Typography>
      {documentos.length === 0 ? (
        <Typography color="text.secondary">
          Nenhum documento recebido ainda.
        </Typography>
      ) : (
        documentos.map((d) => (
          <Documento key={d.id} negocioId={negocioId} documento={d} />
        ))
      )}

      <ApagarDadosDoClienteForm negocioId={negocioId} clienteId={cliente.id} />
    </Stack>
  );
}

function Documento({
  negocioId,
  documento: d,
}: {
  negocioId: string;
  documento: DocumentoDoCliente & { url: string };
}) {
  const botao = (aceito: "sim" | "nao") => (
    <form action={avaliarDocumentoAction}>
      <input type="hidden" name="negocioId" value={negocioId} />
      <input type="hidden" name="documentoId" value={d.id} />
      <input type="hidden" name="aceito" value={aceito} />
      <Button
        type="submit"
        size="large"
        variant={aceito === "sim" ? "contained" : "outlined"}
        color={aceito === "sim" ? "success" : "error"}
        disableElevation
        startIcon={
          aceito === "sim" ? (
            <CheckIcon aria-hidden fontSize="small" />
          ) : (
            <CloseIcon aria-hidden fontSize="small" />
          )
        }
      >
        {aceito === "sim" ? "Aceitar" : "Rejeitar"}
      </Button>
    </form>
  );
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1}>
        <Stack
          direction="row"
          sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
        >
          <Typography sx={{ fontWeight: 700 }}>
            {rotuloDoDocumento[d.tipo]}
          </Typography>
          {d.legivel === false && (
            <Chip label="IA: possivelmente ilegível" color="warning" />
          )}
          {d.legivel === null && <Chip label="IA: não avaliado" />}
          {d.aceito === true && <Chip label="Aceito" color="success" />}
          {d.aceito === false && <Chip label="Rejeitado" color="error" />}
        </Stack>
        {d.legivel === false && d.motivo && (
          <Typography variant="body2" color="text.secondary">
            {d.motivo}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          Recebido em {formatoDataHora.format(d.recebidoEm)}
        </Typography>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
          <Button
            href={d.url}
            target="_blank"
            rel="noopener noreferrer"
            size="large"
            startIcon={<OpenInNewIcon aria-hidden fontSize="small" />}
          >
            Ver
          </Button>
          {d.aceito !== true && botao("sim")}
          {d.aceito !== false && botao("nao")}
        </Stack>
      </Stack>
    </Paper>
  );
}
