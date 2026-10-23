import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import SyncIcon from "@mui/icons-material/Sync";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "@/app/components/link";
import { verificarCorretor } from "@/data/session";
import { buscarConexaoDoWhatsapp, gerarQrCode } from "@/data/whatsapp";
import type { EstadoDaConexao } from "@/lib/db/schema";
import { aceitarRiscoAction, gerarQrCodeAction } from "./actions";

export const metadata: Metadata = { title: "WhatsApp" };

export default function WhatsappPage() {
  return (
    <Container component="main" maxWidth="sm" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Button
          component={Link}
          href="/painel"
          startIcon={<ArrowBackIcon aria-hidden fontSize="small" />}
          sx={{ alignSelf: "flex-start" }}
        >
          Painel
        </Button>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          WhatsApp
        </Typography>
        <Suspense fallback={<Typography>Carregando…</Typography>}>
          <Conexao />
        </Suspense>
      </Stack>
    </Container>
  );
}

const rotulo: Record<
  EstadoDaConexao,
  { label: string; color: "success" | "warning" | "error" }
> = {
  conectado: { label: "Conectado", color: "success" },
  conectando: { label: "Aguardando leitura do QR code", color: "warning" },
  desconectado: { label: "Desconectado", color: "error" },
};

async function Conexao() {
  const session = await verificarCorretor();
  const conexao = await buscarConexaoDoWhatsapp(session);
  if (!conexao) return <AceiteDeRisco />;

  // Com instância e sem pareamento, o QR é pedido a cada visita: a Evolution
  // o renova sozinha e o estado real vem junto.
  const qr =
    conexao.instancia && conexao.estado !== "conectado"
      ? await gerarQrCode(session)
      : null;
  const estado = qr?.estado ?? conexao.estado;

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Typography>Estado:</Typography>
        <Chip {...rotulo[estado]} />
      </Stack>

      {estado === "conectado" && (
        <Typography color="text.secondary">
          Seu número está pareado. Continue usando o WhatsApp no celular
          normalmente; o assistente atende números novos por aqui.
        </Typography>
      )}

      {estado === "desconectado" && conexao.instancia && (
        <Alert severity="warning">
          A conexão caiu. Gere um QR code novo e leia com o celular para
          reconectar.
        </Alert>
      )}

      {qr?.base64 && (
        <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
          <Typography sx={{ mb: 2 }}>
            No celular, abra WhatsApp → Dispositivos conectados → Conectar
            dispositivo e leia o código.
          </Typography>
          {/* biome-ignore lint/performance/noImgElement: imagem data: gerada pela Evolution */}
          <img
            src={qr.base64}
            alt="QR code para conectar o WhatsApp"
            width={264}
            height={264}
            style={{ maxWidth: "100%", height: "auto" }}
          />
          {qr.pairingCode && (
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Código de pareamento: {qr.pairingCode}
            </Typography>
          )}
        </Paper>
      )}

      {estado !== "conectado" && (
        <form action={gerarQrCodeAction}>
          <Button
            type="submit"
            variant="contained"
            size="large"
            disableElevation
            fullWidth
            startIcon={
              conexao.instancia ? (
                <SyncIcon aria-hidden fontSize="small" />
              ) : (
                <QrCode2Icon aria-hidden fontSize="small" />
              )
            }
          >
            {conexao.instancia ? "Gerar novo QR code" : "Conectar WhatsApp"}
          </Button>
        </form>
      )}
    </Stack>
  );
}

// Sem o aceite registrado não existe conexão (ADR-0004).
function AceiteDeRisco() {
  return (
    <Stack spacing={3}>
      <Alert severity="warning">
        <AlertTitle>Leia antes de conectar</AlertTitle>A conexão usa o WhatsApp
        Web por meio de uma API não oficial. Isso viola os Termos de Serviço do
        WhatsApp e o seu número pode ser banido, levando junto o histórico de
        conversas com os clientes. Ao aceitar, você assume esse risco e autoriza
        o assistente a responder, pelo seu número, às pessoas que entrarem em
        contato pela primeira vez.
      </Alert>
      <form action={aceitarRiscoAction}>
        <Button
          type="submit"
          variant="contained"
          size="large"
          disableElevation
          fullWidth
          startIcon={<VerifiedUserIcon aria-hidden fontSize="small" />}
        >
          Li e aceito o risco
        </Button>
      </form>
    </Stack>
  );
}
