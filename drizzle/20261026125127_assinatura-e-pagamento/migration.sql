CREATE TABLE "arquivos_do_fechamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"imobiliaria_id" uuid NOT NULL,
	"corretor_id" uuid NOT NULL,
	"negocio_id" uuid NOT NULL,
	"proposta_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"chave" text NOT NULL UNIQUE,
	"mime_type" text NOT NULL,
	"aceito" boolean,
	"mensagem_id" uuid NOT NULL UNIQUE,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lembretes_de_etapas_finais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"negocio_id" uuid NOT NULL,
	"etapa" text NOT NULL,
	"data" date NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lembretes_de_etapas_finais_negocio_data" UNIQUE("negocio_id","data")
);
--> statement-breakpoint
ALTER TABLE "incorporadoras" ADD COLUMN "instrucoes_de_pagamento" text;--> statement-breakpoint
CREATE INDEX "arquivos_do_fechamento_negocio_id_idx" ON "arquivos_do_fechamento" ("negocio_id");--> statement-breakpoint
CREATE INDEX "arquivos_do_fechamento_corretor_id_idx" ON "arquivos_do_fechamento" ("corretor_id");--> statement-breakpoint
ALTER TABLE "arquivos_do_fechamento" ADD CONSTRAINT "arquivos_do_fechamento_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");--> statement-breakpoint
ALTER TABLE "arquivos_do_fechamento" ADD CONSTRAINT "arquivos_do_fechamento_corretor_id_users_id_fkey" FOREIGN KEY ("corretor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "arquivos_do_fechamento" ADD CONSTRAINT "arquivos_do_fechamento_negocio_id_negocios_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "arquivos_do_fechamento" ADD CONSTRAINT "arquivos_do_fechamento_proposta_id_propostas_id_fkey" FOREIGN KEY ("proposta_id") REFERENCES "propostas"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "arquivos_do_fechamento" ADD CONSTRAINT "arquivos_do_fechamento_mensagem_id_mensagens_id_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "mensagens"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lembretes_de_etapas_finais" ADD CONSTRAINT "lembretes_de_etapas_finais_negocio_id_negocios_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;