CREATE TABLE "contatos_conhecidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"imobiliaria_id" uuid NOT NULL,
	"corretor_id" uuid NOT NULL,
	"telefone" text NOT NULL,
	"motivo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contatos_conhecidos_corretor_telefone" UNIQUE("corretor_id","telefone")
);
--> statement-breakpoint
ALTER TABLE "contatos_conhecidos" ADD CONSTRAINT "contatos_conhecidos_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");--> statement-breakpoint
ALTER TABLE "contatos_conhecidos" ADD CONSTRAINT "contatos_conhecidos_corretor_id_users_id_fkey" FOREIGN KEY ("corretor_id") REFERENCES "users"("id");