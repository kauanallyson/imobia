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
