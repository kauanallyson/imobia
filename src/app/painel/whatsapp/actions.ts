"use server";

import { revalidatePath } from "next/cache";
import { verificarCorretor } from "@/data/session";
import { aceitarRiscoDoWhatsapp, gerarQrCode } from "@/data/whatsapp";

export async function aceitarRiscoAction() {
  const session = await verificarCorretor();
  await aceitarRiscoDoWhatsapp(session);
  revalidatePath("/painel/whatsapp");
}

// Primeira conexão e reconexão são a mesma coisa: pedir um QR novo.
export async function gerarQrCodeAction() {
  const session = await verificarCorretor();
  await gerarQrCode(session);
  revalidatePath("/painel/whatsapp");
}
