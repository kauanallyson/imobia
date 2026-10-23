CREATE TABLE "pendencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"imobiliaria_id" uuid NOT NULL,
	"corretor_id" uuid NOT NULL,
	"negocio_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text NOT NULL,
	"estado" text DEFAULT 'aberta' NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvida_em" timestamp with time zone,
	"aviso_enviado_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telefone" text;--> statement-breakpoint
CREATE INDEX "pendencias_corretor_id_idx" ON "pendencias" ("corretor_id");--> statement-breakpoint
CREATE INDEX "pendencias_negocio_id_idx" ON "pendencias" ("negocio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pendencias_aberta_unica" ON "pendencias" ("negocio_id","tipo","descricao") WHERE "estado" = 'aberta';--> statement-breakpoint
ALTER TABLE "pendencias" ADD CONSTRAINT "pendencias_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");--> statement-breakpoint
ALTER TABLE "pendencias" ADD CONSTRAINT "pendencias_corretor_id_users_id_fkey" FOREIGN KEY ("corretor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "pendencias" ADD CONSTRAINT "pendencias_negocio_id_negocios_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;