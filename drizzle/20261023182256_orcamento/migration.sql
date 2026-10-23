ALTER TABLE "negocios" ADD COLUMN "orcamento_entrada" integer;--> statement-breakpoint
ALTER TABLE "negocios" ADD COLUMN "orcamento_parcela_maxima" integer;--> statement-breakpoint
ALTER TABLE "negocios" ADD COLUMN "fora_do_orcamento" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "negocios" ADD COLUMN "plano_escolhido_id" uuid;--> statement-breakpoint
ALTER TABLE "negocios" ADD COLUMN "modelo_de_casa_escolhido_id" uuid;--> statement-breakpoint
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_plano_escolhido_id_planos_de_pagamento_id_fkey" FOREIGN KEY ("plano_escolhido_id") REFERENCES "planos_de_pagamento"("id");--> statement-breakpoint
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_modelo_de_casa_escolhido_id_modelos_de_casa_id_fkey" FOREIGN KEY ("modelo_de_casa_escolhido_id") REFERENCES "modelos_de_casa"("id");