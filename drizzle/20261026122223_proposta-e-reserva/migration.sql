CREATE TABLE "modelos_de_proposta" (
	"incorporadora_id" uuid PRIMARY KEY,
	"imobiliaria_id" uuid NOT NULL,
	"chave" text NOT NULL UNIQUE,
	"nome_do_arquivo" text NOT NULL,
	"campos" jsonb DEFAULT '[]' NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "propostas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"imobiliaria_id" uuid NOT NULL,
	"corretor_id" uuid NOT NULL,
	"negocio_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"modelo_de_casa_id" uuid,
	"plano_id" uuid NOT NULL,
	"dia_de_pagamento" integer NOT NULL,
	"primeira_parcela" date NOT NULL,
	"chave_pdf" text NOT NULL UNIQUE,
	"chave_pdf_assinado" text,
	"estado" text DEFAULT 'em_revisao' NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"enviada_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reservas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"imobiliaria_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"proposta_id" uuid NOT NULL UNIQUE,
	"estado" text DEFAULT 'ativa' NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "propostas_corretor_id_idx" ON "propostas" ("corretor_id");--> statement-breakpoint
CREATE INDEX "propostas_lote_id_idx" ON "propostas" ("lote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "propostas_negocio_viva" ON "propostas" ("negocio_id") WHERE "estado" <> 'expirada';--> statement-breakpoint
CREATE UNIQUE INDEX "reservas_lote_ativa" ON "reservas" ("lote_id") WHERE "estado" = 'ativa';--> statement-breakpoint
CREATE INDEX "reservas_expira_em_idx" ON "reservas" ("expira_em");--> statement-breakpoint
ALTER TABLE "modelos_de_proposta" ADD CONSTRAINT "modelos_de_proposta_incorporadora_id_incorporadoras_id_fkey" FOREIGN KEY ("incorporadora_id") REFERENCES "incorporadoras"("id");--> statement-breakpoint
ALTER TABLE "modelos_de_proposta" ADD CONSTRAINT "modelos_de_proposta_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");--> statement-breakpoint
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");--> statement-breakpoint
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_corretor_id_users_id_fkey" FOREIGN KEY ("corretor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_negocio_id_negocios_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_lote_id_lotes_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id");--> statement-breakpoint
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_modelo_de_casa_id_modelos_de_casa_id_fkey" FOREIGN KEY ("modelo_de_casa_id") REFERENCES "modelos_de_casa"("id");--> statement-breakpoint
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_plano_id_planos_de_pagamento_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos_de_pagamento"("id");--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_lote_id_lotes_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id");--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_proposta_id_propostas_id_fkey" FOREIGN KEY ("proposta_id") REFERENCES "propostas"("id") ON DELETE CASCADE;