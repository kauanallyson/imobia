import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { env } from "@/lib/env";

// Único módulo que conhece o formato DOCX e o LibreOffice (spec → Modelo de
// proposta: DOCX com placeholders nomeados → PDF). Placeholders são
// `{nome_do_campo}` (letras minúsculas, dígitos e `_`). O preenchimento é
// puro (zip + XML) e trata placeholders que o Word quebra em vários runs; a
// conversão chama `soffice --headless --convert-to pdf` (instalado na imagem
// `app`, ver Containerfile e docs/deploy.md). Em testes o módulo é trocado
// por src/test/fakes/documentos.ts, que reaproveita o preenchimento real.

export class ModeloInvalidoError extends Error {
  override name = "ModeloInvalidoError";
}

const PLACEHOLDER = /\{([a-z0-9_]+)\}/g;

// Partes do DOCX que podem ter texto com placeholders.
const PARTE_DE_TEXTO = /^word\/(document|header\d*|footer\d*)\.xml$/;

function abrir(docx: Uint8Array): Record<string, Uint8Array> {
  let partes: Record<string, Uint8Array>;
  try {
    partes = unzipSync(docx);
  } catch {
    throw new ModeloInvalidoError("O arquivo não é um DOCX válido");
  }
  if (!partes["word/document.xml"]) {
    throw new ModeloInvalidoError("O arquivo não é um DOCX válido");
  }
  return partes;
}

const decodificar = (texto: string) =>
  texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const codificar = (texto: string) =>
  texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Nós <w:t> de um parágrafo, com a posição no XML e o texto decodificado.
type NoDeTexto = { inicio: number; fim: number; texto: string };

function nosDeTexto(xml: string, base: number): NoDeTexto[] {
  const nos: NoDeTexto[] = [];
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)) {
    const inicio = base + (m.index ?? 0);
    nos.push({
      inicio,
      fim: inicio + m[0].length,
      texto: decodificar(m[1] ?? ""),
    });
  }
  return nos;
}

// Substitui num parágrafo: junta o texto dos runs, acha os placeholders e
// devolve o texto de cada nó (o valor fica no nó onde o placeholder começa).
function preencherParagrafo(
  nos: NoDeTexto[],
  campos: Record<string, string>,
): string[] {
  const textos = nos.map((n) => n.texto);
  const completo = textos.join("");
  const ocorrencias = [...completo.matchAll(PLACEHOLDER)].filter(
    (m) => m[1] !== undefined && campos[m[1]] !== undefined,
  );
  // Do fim para o começo: as posições anteriores continuam válidas.
  for (const m of ocorrencias.reverse()) {
    const valor = campos[m[1] as string] as string;
    const inicio = m.index ?? 0;
    const fim = inicio + m[0].length;
    let offset = 0;
    let primeiro = true;
    for (let i = 0; i < textos.length; i++) {
      const texto = textos[i] as string;
      const deste = offset;
      offset += texto.length;
      if (offset <= inicio || deste >= fim) continue;
      const a = Math.max(inicio, deste) - deste;
      const b = Math.min(fim, offset) - deste;
      textos[i] = texto.slice(0, a) + (primeiro ? valor : "") + texto.slice(b);
      primeiro = false;
    }
  }
  return textos;
}

function preencherXml(xml: string, campos: Record<string, string>): string {
  const trocas: Array<{ inicio: number; fim: number; novo: string }> = [];
  for (const p of xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    const nos = nosDeTexto(p[0], p.index ?? 0);
    if (nos.length === 0) continue;
    const textos = preencherParagrafo(nos, campos);
    nos.forEach((no, i) => {
      if (textos[i] === no.texto) return;
      trocas.push({
        inicio: no.inicio,
        fim: no.fim,
        novo: `<w:t xml:space="preserve">${codificar(textos[i] ?? "")}</w:t>`,
      });
    });
  }
  let resultado = xml;
  for (const t of trocas.reverse()) {
    resultado = resultado.slice(0, t.inicio) + t.novo + resultado.slice(t.fim);
  }
  return resultado;
}

// Placeholders presentes no modelo (sem repetir, na ordem em que aparecem).
// Arquivo que não é DOCX → ModeloInvalidoError.
export function lerCampos(docx: Uint8Array): string[] {
  const partes = abrir(docx);
  const campos = new Set<string>();
  for (const [nome, conteudo] of Object.entries(partes)) {
    if (!PARTE_DE_TEXTO.test(nome)) continue;
    const xml = strFromU8(conteudo);
    for (const p of xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
      const texto = nosDeTexto(p[0], 0)
        .map((n) => n.texto)
        .join("");
      for (const m of texto.matchAll(PLACEHOLDER)) campos.add(m[1] as string);
    }
  }
  return [...campos];
}

// DOCX com os placeholders conhecidos substituídos; os sem valor ficam como
// estão (o corretor vê na revisão).
export function preencherModelo(
  docx: Uint8Array,
  campos: Record<string, string>,
): Uint8Array {
  const partes = abrir(docx);
  const saida: Record<string, Uint8Array> = {};
  for (const [nome, conteudo] of Object.entries(partes)) {
    saida[nome] = PARTE_DE_TEXTO.test(nome)
      ? strToU8(preencherXml(strFromU8(conteudo), campos))
      : conteudo;
  }
  return zipSync(saida);
}

const TEMPO_MAXIMO_DA_CONVERSAO_MS = 60_000;

// Preenche o modelo e converte para PDF com o LibreOffice. Cada conversão usa
// um diretório e um perfil próprios (conversões simultâneas não colidem).
export async function gerarPdf(
  docx: Uint8Array,
  campos: Record<string, string>,
): Promise<Uint8Array> {
  const preenchido = preencherModelo(docx, campos);
  const dir = await mkdtemp(join(tmpdir(), "loteai-proposta-"));
  try {
    const entrada = join(dir, "proposta.docx");
    await writeFile(entrada, preenchido);
    const processo = Bun.spawn(
      [
        env.SOFFICE_PATH,
        `-env:UserInstallation=file://${join(dir, "perfil")}`,
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        dir,
        entrada,
      ],
      { stdout: "pipe", stderr: "pipe", timeout: TEMPO_MAXIMO_DA_CONVERSAO_MS },
    );
    const codigo = await processo.exited;
    if (codigo !== 0) {
      const erro = await new Response(processo.stderr).text();
      throw new Error(`soffice terminou com código ${codigo}: ${erro}`);
    }
    try {
      return new Uint8Array(await readFile(join(dir, "proposta.pdf")));
    } catch {
      const saida = await new Response(processo.stdout).text();
      throw new Error(`soffice não gerou o PDF: ${saida}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
