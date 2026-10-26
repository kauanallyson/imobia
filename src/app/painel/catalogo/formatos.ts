import type { StatusDeLote } from "@/lib/db/schema";

export const rotuloDoStatus: Record<StatusDeLote, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
};

export const corDoStatus: Record<
  StatusDeLote,
  "success" | "warning" | "default"
> = {
  disponivel: "success",
  reservado: "warning",
  vendido: "default",
};

const reais = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const metros = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export const formatarReais = (valor: number) => reais.format(valor);
export const formatarM2 = (valor: number) => `${metros.format(valor)} m²`;
export const formatarM = (valor: number) => `${metros.format(valor)} m`;
