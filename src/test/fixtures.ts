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
