CREATE TABLE "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"negocio_id" uuid NOT NULL,
	"ultima_mensagem_do_cliente_em" timestamp with time zone NOT NULL,
	"sequencia" integer NOT NULL,
	"destino" text NOT NULL,
	"devido_em" timestamp with time zone NOT NULL,
	"enviado_em" timestamp with time zone NOT NULL,
	CONSTRAINT "follow_ups_negocio_mensagem_sequencia" UNIQUE("negocio_id","ultima_mensagem_do_cliente_em","sequencia")
);
--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_negocio_id_negocios_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;