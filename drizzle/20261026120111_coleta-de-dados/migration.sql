CREATE TABLE "documentos_do_cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"imobiliaria_id" uuid NOT NULL,
	"corretor_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"negocio_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"chave" text NOT NULL UNIQUE,
	"mime_type" text NOT NULL,
	"legivel" boolean,
	"motivo" text,
	"aceito" boolean,
	"mensagem_id" uuid NOT NULL UNIQUE,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lembretes_de_coleta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"negocio_id" uuid NOT NULL,
	"data" date NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lembretes_de_coleta_negocio_data" UNIQUE("negocio_id","data")
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "contatos_extras" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "referencias" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "forma_de_pagamento" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "dia_de_pagamento" integer;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "primeira_parcela" date;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "anonimizado_em" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "documentos_do_cliente_negocio_id_idx" ON "documentos_do_cliente" ("negocio_id");--> statement-breakpoint
CREATE INDEX "documentos_do_cliente_corretor_id_idx" ON "documentos_do_cliente" ("corretor_id");--> statement-breakpoint
ALTER TABLE "documentos_do_cliente" ADD CONSTRAINT "documentos_do_cliente_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");--> statement-breakpoint
ALTER TABLE "documentos_do_cliente" ADD CONSTRAINT "documentos_do_cliente_corretor_id_users_id_fkey" FOREIGN KEY ("corretor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "documentos_do_cliente" ADD CONSTRAINT "documentos_do_cliente_cliente_id_clientes_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "documentos_do_cliente" ADD CONSTRAINT "documentos_do_cliente_negocio_id_negocios_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "documentos_do_cliente" ADD CONSTRAINT "documentos_do_cliente_mensagem_id_mensagens_id_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "mensagens"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lembretes_de_coleta" ADD CONSTRAINT "lembretes_de_coleta_negocio_id_negocios_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_dia_de_pagamento" CHECK ("dia_de_pagamento" between 1 and 28);