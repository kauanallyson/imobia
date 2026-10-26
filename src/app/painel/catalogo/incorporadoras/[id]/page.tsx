import DownloadIcon from "@mui/icons-material/Download";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buscarIncorporadora } from "@/data/incorporadoras";
import { buscarModeloDeProposta, camposDaProposta } from "@/data/propostas";
import { verificarCorretor } from "@/data/session";
import { editarIncorporadoraAction } from "../../actions";
import { IncorporadoraForm } from "../../forms";
import { ModeloDePropostaForm } from "./forms";

const formatoData = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

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
  const modelo = await buscarModeloDeProposta(session, incorporadora.id);

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

      <Stack component="section" spacing={2} sx={{ pt: 2 }}>
        <Typography variant="h6" component="h2">
          Modelo de proposta
        </Typography>
        {modelo ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Typography>{modelo.nomeDoArquivo}</Typography>
              <Typography variant="body2" color="text.secondary">
                Enviado em {formatoData.format(modelo.enviadoEm)} ·{" "}
                {modelo.campos.length} campo(s) encontrado(s)
              </Typography>
              {modelo.desconhecidos.length > 0 && (
                <Alert severity="warning">
                  Campos que o sistema não conhece (ficam como estão no PDF):{" "}
                  {modelo.desconhecidos.map((c) => `{${c}}`).join(", ")}
                </Alert>
              )}
              <Button
                href={modelo.url}
                target="_blank"
                rel="noopener"
                variant="outlined"
                startIcon={<DownloadIcon aria-hidden fontSize="small" />}
                sx={{ alignSelf: "flex-start" }}
              >
                Baixar modelo
              </Button>
            </Stack>
          </Paper>
        ) : (
          <Typography color="text.secondary">
            Nenhum modelo enviado: as propostas desta incorporadora ainda não
            podem ser geradas.
          </Typography>
        )}
        <ModeloDePropostaForm
          incorporadoraId={incorporadora.id}
          substituir={Boolean(modelo)}
        />
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
            Campos que você pode usar no DOCX
          </Typography>
          <Stack component="dl" spacing={0.5} sx={{ m: 0 }}>
            {Object.entries(camposDaProposta).map(([campo, descricao]) => (
              <Box key={campo}>
                <Typography
                  component="dt"
                  sx={{ fontFamily: "monospace", fontWeight: 700 }}
                >
                  {`{${campo}}`}
                </Typography>
                <Typography
                  component="dd"
                  variant="body2"
                  color="text.secondary"
                  sx={{ m: 0 }}
                >
                  {descricao}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      </Stack>
    </>
  );
}
