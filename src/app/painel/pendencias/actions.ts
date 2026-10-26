"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolverPendencia } from "@/data/pendencias";
import { verificarCorretor } from "@/data/session";

// "Levar a resolvida": repetir o clique não muda nada.
export async function resolverPendenciaAction(formData: FormData) {
  const session = await verificarCorretor();
  const id = z.uuid().safeParse(formData.get("pendenciaId"));
  if (!id.success) return;

  await resolverPendencia(session, id.data);
  revalidatePath("/painel/pendencias");
  revalidatePath("/painel/pendencias/[id]", "page");
}
