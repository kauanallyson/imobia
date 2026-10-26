import { strToU8, zipSync } from "fflate";
import { criarCliente } from "@/data/clientes";
import { criarCorretor } from "@/data/corretores";
import { criarImobiliaria } from "@/data/imobiliarias";
import { criarNegocio } from "@/data/negocios";
import type { Session } from "@/data/session";
import {
  aceitarRiscoDoWhatsapp,
  atualizarEstadoDaConexao,
  gerarQrCode,
} from "@/data/whatsapp";
import { simularEstado } from "@/test/fakes/whatsapp";

export const administrador: Session = { role: "administrador" };

// Imobiliária "Fiel Imóveis" com a corretora Ana (senha-forte-123).
export async function criarAna() {
  const imobiliaria = await criarImobiliaria(administrador, {
    nome: "Fiel Imóveis",
  });
  const corretor = await criarCorretor(administrador, {
    imobiliariaId: imobiliaria.id,
    nome: "Ana Souza",
    email: "ana@fiel.com.br",
    senha: "senha-forte-123",
  });
  if (!corretor) throw new Error("criarAna: imobiliária não encontrada");
  return { imobiliaria, corretor };
}

export function sessaoDe(
  corretor: { id: string },
  imobiliaria: { id: string },
): Session {
  return {
    role: "corretor",
    corretorId: corretor.id,
    imobiliariaId: imobiliaria.id,
  };
}

// Ana com o aviso de risco aceito e o WhatsApp pareado (instância "conectada"
// no falso). Devolve a sessão e o nome da instância.
export async function conectarWhatsappDaAna() {
  const { imobiliaria, corretor } = await criarAna();
  const session = sessaoDe(corretor, imobiliaria);
  await aceitarRiscoDoWhatsapp(session);
  const qr = await gerarQrCode(session);
  if (!qr) throw new Error("conectarWhatsappDaAna: sem instância");
  simularEstado(qr.instancia, "open");
  await atualizarEstadoDaConexao(qr.instancia, "open");
  return { imobiliaria, corretor, session, instancia: qr.instancia };
}

// Ana com o cliente Carlos Lima cadastrado à mão e um negócio em Novo.
export async function criarNegocioDaAna() {
  const { imobiliaria, corretor } = await criarAna();
  const session = sessaoDe(corretor, imobiliaria);
  const cliente = await criarCliente(session, {
    nome: "Carlos Lima",
    telefone: "5588999990000",
  });
  const negocio = await criarNegocio(session, { clienteId: cliente.id });
  if (!negocio) throw new Error("criarNegocioDaAna: negócio não criado");
  return { imobiliaria, corretor, session, cliente, negocio };
}

// Segundo corretor da mesma imobiliária da Ana (catálogo compartilhado).
export async function criarBruno(imobiliaria: { id: string }) {
  const corretor = await criarCorretor(administrador, {
    imobiliariaId: imobiliaria.id,
    nome: "Bruno Lima",
    email: "bruno@fiel.com.br",
    senha: "senha-forte-123",
  });
  if (!corretor) throw new Error("criarBruno: imobiliária não encontrada");
  return corretor;
}

// Outra imobiliária, "Concorrente", com a corretora Carla: nada dela pode
// aparecer para a Fiel Imóveis.
export async function criarConcorrente() {
  const imobiliaria = await criarImobiliaria(administrador, {
    nome: "Concorrente",
  });
  const corretor = await criarCorretor(administrador, {
    imobiliariaId: imobiliaria.id,
    nome: "Carla Dias",
    email: "carla@concorrente.com.br",
    senha: "senha-forte-123",
  });
  if (!corretor)
    throw new Error("criarConcorrente: imobiliária não encontrada");
  return { imobiliaria, corretor, session: sessaoDe(corretor, imobiliaria) };
}

// Para testes que esperam o registro: falha cedo se a DAL devolveu null.
export function ok<T>(value: T | null | undefined, what = "registro"): T {
  if (value == null) throw new Error(`esperava ${what}, veio ${value}`);
  return value;
}

// Incorporadora "Terra Nova" e empreendimento "Jardim das Flores" da Fiel
// Imóveis, cadastrados pela sessão informada (a da Ana, por padrão).
export async function criarEmpreendimentoDaAna(session: Session) {
  const { criarIncorporadora } = await import("@/data/incorporadoras");
  const { criarEmpreendimento } = await import("@/data/empreendimentos");
  const incorporadora = ok(
    await criarIncorporadora(session, { nome: "Terra Nova" }),
  );
  const empreendimento = ok(
    await criarEmpreendimento(session, {
      incorporadoraId: incorporadora.id,
      nome: "Jardim das Flores",
      cidade: "Sobral",
      endereco: "Rod. CE-178, km 2",
    }),
  );
  return { incorporadora, empreendimento };
}

// Lote A-1 (R$ 85.000) e modelo "Casa 2 quartos" (R$ 150.000) no
// empreendimento da Ana.
export async function criarLoteECasaDaAna(session: Session) {
  const { criarLote } = await import("@/data/lotes");
  const { criarModeloDeCasa } = await import("@/data/modelos-de-casa");
  const { incorporadora, empreendimento } =
    await criarEmpreendimentoDaAna(session);
  const lote = ok(
    await criarLote(session, {
      empreendimentoId: empreendimento.id,
      quadra: "A",
      numero: "1",
      area: 360,
      frente: 12,
      fundo: 30,
      preco: 85000,
    }),
  );
  const modelo = ok(
    await criarModeloDeCasa(session, {
      empreendimentoId: empreendimento.id,
      nome: "Casa 2 quartos",
      areaConstruida: 70,
      quartos: 2,
      banheiros: 1,
      suites: 0,
      vagas: 1,
      preco: 150000,
    }),
  );
  return { incorporadora, empreendimento, lote, modelo };
}

// Ticket 13: Ana com WhatsApp conectado, o cliente Carlos Lima (que chegou
// pelo WhatsApp e já foi atendido, negócio em Em atendimento) interessado no
// Jardim das Flores (com coordenadas) e disponibilidade de segunda a sexta,
// 09:00–12:00. Limpa os envios e pedidos ao modelo que a chegada gerou.
export async function criarCenarioDeVisitaDaAna() {
  const { criarJanela } = await import("@/data/disponibilidade");
  const { editarEmpreendimento } = await import("@/data/empreendimentos");
  const { registrarInteresse, listarNegocios } = await import(
    "@/data/negocios"
  );
  const { receberMensagem } = await import("@/data/conversas");
  const { listarClientes } = await import("@/data/clientes");
  const llm = await import("@/test/fakes/llm");
  const whatsapp = await import("@/test/fakes/whatsapp");

  const conexao = await conectarWhatsappDaAna();
  const { session, instancia } = conexao;
  const { incorporadora, empreendimento: base } =
    await criarEmpreendimentoDaAna(session);
  const empreendimento = ok(
    await editarEmpreendimento(session, base.id, {
      incorporadoraId: incorporadora.id,
      nome: base.nome,
      cidade: base.cidade,
      endereco: base.endereco,
      latitude: -3.6891,
      longitude: -40.3482,
    }),
  );

  llm.roteirizar({ tipo: "texto", texto: "Olá! Sou a assistente da Ana." });
  await receberMensagem(
    whatsapp.mensagemRecebida({
      instancia,
      telefone: "5588999990000",
      nomeDoContato: "Carlos Lima",
      texto: "Oi, vi o anúncio",
    }),
  );
  llm.limpar();
  whatsapp.enviados.length = 0;

  const [cliente] = await listarClientes(session);
  const [criado] = await listarNegocios(session);
  if (!cliente || !criado) throw new Error("cenário de visita: sem negócio");
  const negocio = ok(
    await registrarInteresse(session, criado.id, {
      interesse: "lote",
      empreendimentoId: empreendimento.id,
    }),
  );
  for (const diaDaSemana of [1, 2, 3, 4, 5]) {
    await criarJanela(session, { diaDaSemana, inicio: "09:00", fim: "12:00" });
  }
  return { ...conexao, empreendimento, cliente, negocio };
}

// Ana com o WhatsApp pareado e a primeira conversa aberta: o cliente
// 5588999990000 mandou "Oi, vi o anúncio" e o assistente respondeu (fake do
// LLM roteirizado). Devolve a conversa e o id Evolution da resposta do
// assistente (para simular o eco `fromMe`). Zera `enviados`/`pedidos` dos
// fakes para o teste observar só o que vem depois.
export async function iniciarConversaDaAna() {
  const { receberMensagem } = await import("@/data/conversas");
  const { roteirizar, pedidos } = await import("@/test/fakes/llm");
  const { enviados, mensagemRecebida } = await import("@/test/fakes/whatsapp");
  const { listarMensagens } = await import("@/data/conversas");
  const conectado = await conectarWhatsappDaAna();
  const telefone = "5588999990000";
  roteirizar({
    tipo: "texto",
    texto: "Olá! Sou a assistente virtual da Ana Souza.",
  });
  const result = await receberMensagem(
    mensagemRecebida({
      instancia: conectado.instancia,
      telefone,
      texto: "Oi, vi o anúncio",
    }),
  );
  const conversaId = ok(result?.conversaId, "conversa");
  const mensagens = await listarMensagens(conectado.session, conversaId);
  const resposta = ok(
    mensagens.find((m) => m.autor === "assistente"),
    "resposta do assistente",
  );
  enviados.length = 0;
  pedidos.length = 0;
  return {
    ...conectado,
    telefone,
    conversaId,
    idDaResposta: ok(resposta.evolutionId, "id da resposta"),
  };
}

// Ana com WhatsApp para receber os avisos do número de sistema (ticket 11).
export async function darTelefoneAAna(
  corretor: { id: string },
  telefone = "5588988880000",
) {
  const { definirTelefoneDoCorretor } = await import("@/data/corretores");
  return ok(
    await definirTelefoneDoCorretor(administrador, corretor.id, telefone),
  );
}

// Lotes A-1 (R$ 60 mil), A-2 (R$ 85 mil) e A-3 (R$ 120 mil) e os planos
// "60x" (20% de entrada) e "120x" (10% de entrada) no empreendimento da Ana
// (ticket 12).
export async function criarLotesEPlanosDaAna(session: Session) {
  const { criarLote } = await import("@/data/lotes");
  const { criarPlanoDePagamento } = await import("@/data/planos-de-pagamento");
  const { incorporadora, empreendimento } =
    await criarEmpreendimentoDaAna(session);
  const lotes = [];
  for (const [numero, preco] of [
    ["1", 60000],
    ["2", 85000],
    ["3", 120000],
  ] as const) {
    lotes.push(
      ok(
        await criarLote(session, {
          empreendimentoId: empreendimento.id,
          quadra: "A",
          numero,
          area: 360,
          frente: 12,
          fundo: 30,
          preco,
        }),
      ),
    );
  }
  const plano60 = ok(
    await criarPlanoDePagamento(session, {
      empreendimentoId: empreendimento.id,
      nome: "60x",
      percentualDeEntrada: 20,
      numeroDeParcelas: 60,
      condicoes: "",
    }),
  );
  const plano120 = ok(
    await criarPlanoDePagamento(session, {
      empreendimentoId: empreendimento.id,
      nome: "120x",
      percentualDeEntrada: 10,
      numeroDeParcelas: 120,
      condicoes: "",
    }),
  );
  return { incorporadora, empreendimento, lotes, plano60, plano120 };
}

// Ticket 14: conecta o Google Calendar do corretor da sessão pelo fluxo
// OAuth (Calendar falso).
export async function conectarGoogle(session: Session) {
  const { iniciarConexaoGoogle, concluirConexaoGoogle } = await import(
    "@/data/google-calendar"
  );
  const url = await iniciarConexaoGoogle(session);
  const state = ok(new URL(url).searchParams.get("state"), "state");
  if (!(await concluirConexaoGoogle(session, { code: "codigo-valido", state })))
    throw new Error("conectarGoogle: falhou");
}

// Ticket 16: o cenário de visita da Ana com o negócio já em Coletando dados
// (o cliente decidiu fechar), os lotes A-1 (disponível) e A-2 (reservado) no
// Jardim das Flores e o lote B-1 (disponível) em outro empreendimento.
export async function criarCenarioDeColetaDaAna() {
  const { criarLote, alterarStatusDoLote } = await import("@/data/lotes");
  const { criarEmpreendimento } = await import("@/data/empreendimentos");
  const { mudarEtapa } = await import("@/data/negocios");
  const cenario = await criarCenarioDeVisitaDaAna();
  const { session, empreendimento } = cenario;
  const medidas = { area: 360, frente: 12, fundo: 30, preco: 85000 };
  const disponivel = ok(
    await criarLote(session, {
      empreendimentoId: empreendimento.id,
      quadra: "A",
      numero: "1",
      ...medidas,
    }),
  );
  const reservado = ok(
    await alterarStatusDoLote(
      session,
      ok(
        await criarLote(session, {
          empreendimentoId: empreendimento.id,
          quadra: "A",
          numero: "2",
          ...medidas,
        }),
      ).id,
      "reservado",
    ),
  );
  const outro = ok(
    await criarEmpreendimento(session, {
      incorporadoraId: empreendimento.incorporadoraId,
      nome: "Morada do Sol",
      cidade: "Sobral",
      endereco: "Av. do Sol, 100",
    }),
  );
  const deOutroEmpreendimento = ok(
    await criarLote(session, {
      empreendimentoId: outro.id,
      quadra: "B",
      numero: "1",
      ...medidas,
    }),
  );
  const negocio = ok(
    await mudarEtapa(session, cenario.negocio.id, "coletando_dados", {
      autor: "assistente",
    }),
  );
  return {
    ...cenario,
    negocio,
    lotes: { disponivel, reservado, deOutroEmpreendimento },
  };
}

// Ticket 17: DOCX mínimo com um parágrafo por item; um item em array vira
// vários runs no mesmo parágrafo (como o Word quebra placeholders).
export function criarDocx(
  paragrafos: Array<string | string[]>,
  opcoes: { cabecalho?: string } = {},
): Uint8Array {
  const escapar = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragrafo = (p: string | string[]) =>
    `<w:p><w:pPr><w:jc w:val="left"/></w:pPr>${(Array.isArray(p) ? p : [p])
      .map((r) => `<w:r><w:rPr><w:b/></w:rPr><w:t>${escapar(r)}</w:t></w:r>`)
      .join("")}</w:p>`;
  const ns =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const arquivos: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document ${ns}><w:body>${paragrafos.map(paragrafo).join("")}</w:body></w:document>`,
    ),
  };
  if (opcoes.cabecalho) {
    arquivos["word/header1.xml"] = strToU8(
      `<?xml version="1.0"?><w:hdr ${ns}>${paragrafo(opcoes.cabecalho)}</w:hdr>`,
    );
  }
  return zipSync(arquivos);
}

// Ticket 17: completa a coleta de um negócio da Ana em Coletando dados — o
// cliente `telefone` manda as três fotos de documento, e-mail, CPF, duas
// referências, Pix no dia 10, o lote e o plano escolhidos.
export async function completarColetaDaAna(
  session: Session,
  input: {
    instancia: string;
    telefone: string;
    negocioId: string;
    loteId: string;
    planoId: string;
    cpf?: string;
  },
) {
  const coleta = await import("@/data/coleta-de-dados");
  const { escolherPlano } = await import("@/data/negocios");
  const { receberMensagem } = await import("@/data/conversas");
  const llm = await import("@/test/fakes/llm");
  const whatsapp = await import("@/test/fakes/whatsapp");
  for (const tipo of ["cpf", "rg", "comprovante_endereco"] as const) {
    const idMensagem = `FOTO-${input.telefone}-${tipo}`;
    whatsapp.simularMidia(idMensagem, {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/jpeg",
    });
    llm.roteirizar({ tipo: "texto", texto: "Recebi." });
    await receberMensagem(
      whatsapp.mensagemRecebida({
        instancia: input.instancia,
        telefone: input.telefone,
        idMensagem,
        texto: null,
        midia: {
          tipo: "imagem",
          mimetype: "image/jpeg",
          nomeDoArquivo: null,
          url: null,
        },
      }),
    );
    ok(await coleta.registrarDocumentoRecebido(session, input.negocioId, tipo));
  }
  await coleta.registrarDadosDoCliente(session, input.negocioId, {
    email: "cliente@email.com",
    cpf: input.cpf ?? "12345678909",
  });
  await coleta.registrarReferencia(session, input.negocioId, {
    nome: "Maria Lima",
    telefone: "88999991111",
  });
  await coleta.registrarReferencia(session, input.negocioId, {
    nome: "João Souza",
    telefone: "88999992222",
  });
  await coleta.registrarPagamento(session, input.negocioId, {
    forma: "pix",
    dia: 10,
  });
  ok(await coleta.escolherLote(session, input.negocioId, input.loteId));
  ok(
    await escolherPlano(session, input.negocioId, {
      planoId: input.planoId,
      loteId: input.loteId,
    }),
  );
  llm.limpar();
  whatsapp.enviados.length = 0;
}

// Ticket 17: o cenário de coleta da Ana com o plano "60x" (20% de entrada),
// o modelo de proposta da Terra Nova enviado e a coleta do Carlos completa no
// lote A-1 (R$ 85.000).
export async function criarCenarioDePropostaDaAna(
  modelo: Uint8Array = criarDocx([
    "Proposta para {cliente_nome}, CPF {cliente_cpf}",
    "{empreendimento}: quadra {lote_quadra}, lote {lote_numero}",
    "{plano}: entrada de {entrada} + {parcelas}x de {parcela}",
  ]),
) {
  const { criarPlanoDePagamento } = await import("@/data/planos-de-pagamento");
  const { enviarModeloDeProposta } = await import("@/data/propostas");
  const cenario = await criarCenarioDeColetaDaAna();
  const { session, empreendimento, negocio, lotes } = cenario;
  const plano = ok(
    await criarPlanoDePagamento(session, {
      empreendimentoId: empreendimento.id,
      nome: "60x",
      percentualDeEntrada: 20,
      numeroDeParcelas: 60,
      condicoes: "",
    }),
  );
  ok(
    await enviarModeloDeProposta(session, {
      incorporadoraId: empreendimento.incorporadoraId,
      nomeDoArquivo: "modelo.docx",
      conteudo: modelo,
    }),
  );
  await completarColetaDaAna(session, {
    instancia: cenario.instancia,
    telefone: "5588999990000",
    negocioId: negocio.id,
    loteId: lotes.disponivel.id,
    planoId: plano.id,
  });
  return { ...cenario, plano };
}

// Ticket 17: outro cliente (`telefone`) chega pelo WhatsApp da Ana e fecha o
// mesmo lote: negócio em Coletando dados com a coleta completa.
export async function outroClienteFechaOLote(
  cenario: Awaited<ReturnType<typeof criarCenarioDePropostaDaAna>>,
  telefone = "5588977770000",
) {
  const { receberMensagem } = await import("@/data/conversas");
  const { listarNegocios, mudarEtapa } = await import("@/data/negocios");
  const llm = await import("@/test/fakes/llm");
  const whatsapp = await import("@/test/fakes/whatsapp");
  const { session, instancia } = cenario;
  llm.roteirizar({ tipo: "texto", texto: "Olá!" });
  await receberMensagem(
    whatsapp.mensagemRecebida({ instancia, telefone, texto: "Oi" }),
  );
  const criado = ok(
    (await listarNegocios(session)).find((n) => n.clienteTelefone === telefone),
  );
  const negocio = ok(
    await mudarEtapa(session, criado.id, "coletando_dados", {
      autor: "assistente",
    }),
  );
  await completarColetaDaAna(session, {
    instancia,
    telefone,
    negocioId: negocio.id,
    loteId: cenario.lotes.disponivel.id,
    planoId: cenario.plano.id,
    cpf: "98765432100",
  });
  return negocio;
}

// Ticket 18: o cliente `telefone` manda um arquivo pelo WhatsApp da Ana (o
// assistente responde só com texto). `bytes` é o que a Evolution devolve.
export async function clienteEnviaArquivo(input: {
  instancia: string;
  telefone?: string;
  idMensagem: string;
  tipo?: "imagem" | "documento";
  mimetype?: string;
  nomeDoArquivo?: string | null;
}) {
  const { receberMensagem } = await import("@/data/conversas");
  const llm = await import("@/test/fakes/llm");
  const whatsapp = await import("@/test/fakes/whatsapp");
  const mimetype = input.mimetype ?? "application/pdf";
  whatsapp.simularMidia(input.idMensagem, {
    bytes: new TextEncoder().encode(input.idMensagem),
    mimeType: mimetype,
  });
  llm.roteirizar({ tipo: "texto", texto: "Recebi, obrigado!" });
  await receberMensagem(
    whatsapp.mensagemRecebida({
      instancia: input.instancia,
      telefone: input.telefone ?? "5588999990000",
      idMensagem: input.idMensagem,
      texto: null,
      midia: {
        tipo: input.tipo ?? "documento",
        mimetype,
        nomeDoArquivo:
          input.nomeDoArquivo === undefined
            ? "proposta-assinada.pdf"
            : input.nomeDoArquivo,
        url: null,
      },
    }),
  );
}

// Ticket 18: o cenário de proposta da Ana com a proposta aprovada e enviada
// (negócio em Aguardando assinatura, lote A-1 reservado por 72h) e as
// instruções de pagamento da Terra Nova configuradas.
export async function criarCenarioDeAssinaturaDaAna(
  instrucoes = "Pix para a chave financeiro@terranova.com.br (Terra Nova Urbanismo).",
) {
  const { definirInstrucoesDePagamento } = await import(
    "@/data/incorporadoras"
  );
  const { aprovarProposta, gerarProposta } = await import("@/data/propostas");
  const whatsapp = await import("@/test/fakes/whatsapp");
  const cenario = await criarCenarioDePropostaDaAna();
  const { session, negocio, empreendimento } = cenario;
  ok(
    await definirInstrucoesDePagamento(
      session,
      empreendimento.incorporadoraId,
      instrucoes,
    ),
  );
  const gerada = ok(await gerarProposta(session, negocio.id));
  const proposta = ok(await aprovarProposta(session, gerada.id));
  whatsapp.enviados.length = 0;
  return { ...cenario, proposta };
}
