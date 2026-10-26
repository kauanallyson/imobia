import { strFromU8, unzipSync } from "fflate";
// Preenchimento e leitura de campos são puros: o falso reaproveita os reais;
// só a conversão para PDF (LibreOffice) é falsa.
import {
  lerCampos,
  ModeloInvalidoError,
  preencherModelo,
} from "@/lib/documentos";

// Falso de src/lib/documentos.ts: mesma superfície, mais `gerados` para
// inspeção. Trocado pelo preload (src/test/fakes/preload.ts).

export { lerCampos, ModeloInvalidoError, preencherModelo };

// Cada PDF gerado: os campos pedidos e o texto do DOCX já preenchido.
export const gerados: Array<{ campos: Record<string, string>; texto: string }> =
  [];

export function limpar() {
  gerados.length = 0;
}

export async function gerarPdf(
  docx: Uint8Array,
  campos: Record<string, string>,
): Promise<Uint8Array> {
  const preenchido = preencherModelo(docx, campos);
  const xml = unzipSync(preenchido)["word/document.xml"];
  const texto = xml ? strFromU8(xml).replace(/<[^>]+>/g, "") : "";
  gerados.push({ campos: { ...campos }, texto });
  return new TextEncoder().encode(`%PDF-1.7 falso\n${texto}`);
}
