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
