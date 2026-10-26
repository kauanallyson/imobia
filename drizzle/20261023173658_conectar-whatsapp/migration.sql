CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"imobiliaria_id" uuid NOT NULL,
	"corretor_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"telefone" text NOT NULL,
	"email" text,
	"cpf" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clientes_corretor_telefone" UNIQUE("corretor_id","telefone")
);
--> statement-breakpoint
CREATE TABLE "conversas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"imobiliaria_id" uuid NOT NULL,
	"corretor_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"assistente" text DEFAULT 'ativo' NOT NULL,
	"ultima_mensagem_corretor_em" timestamp with time zone,
	"opt_out" boolean DEFAULT false NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversas_corretor_cliente" UNIQUE("corretor_id","cliente_id")
);
--> statement-breakpoint
CREATE TABLE "mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"conversa_id" uuid NOT NULL,
	"evolution_id" text NOT NULL,
	"autor" text NOT NULL,
	"texto" text,
	"midia" jsonb,
	"transcricao" text,
	"from_me" boolean DEFAULT false NOT NULL,
	"enviada_em" timestamp with time zone NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mensagens_conversa_evolution_id" UNIQUE("conversa_id","evolution_id")
);
--> statement-breakpoint
CREATE TABLE "negocio_etapas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"negocio_id" uuid NOT NULL,
	"de" text,
	"para" text NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "negocios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"imobiliaria_id" uuid NOT NULL,
	"corretor_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"etapa" text DEFAULT 'novo' NOT NULL,
	"motivo_perda" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conexoes" (
	"corretor_id" uuid PRIMARY KEY,
	"imobiliaria_id" uuid NOT NULL,
	"aceite_em" timestamp with time zone NOT NULL,
	"instancia" text UNIQUE,
	"estado" text DEFAULT 'desconectado' NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "clientes_corretor_id_idx" ON "clientes" ("corretor_id");--> statement-breakpoint
CREATE INDEX "conversas_corretor_id_idx" ON "conversas" ("corretor_id");--> statement-breakpoint
CREATE INDEX "mensagens_conversa_id_idx" ON "mensagens" ("conversa_id");--> statement-breakpoint
CREATE INDEX "negocio_etapas_negocio_id_idx" ON "negocio_etapas" ("negocio_id");--> statement-breakpoint
CREATE INDEX "negocios_corretor_id_idx" ON "negocios" ("corretor_id");--> statement-breakpoint
CREATE INDEX "negocios_cliente_id_idx" ON "negocios" ("cliente_id");--> statement-breakpoint
CREATE INDEX "whatsapp_conexoes_imobiliaria_id_idx" ON "whatsapp_conexoes" ("imobiliaria_id");--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_corretor_id_users_id_fkey" FOREIGN KEY ("corretor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_corretor_id_users_id_fkey" FOREIGN KEY ("corretor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_cliente_id_clientes_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id");--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conversa_id_conversas_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "negocio_etapas" ADD CONSTRAINT "negocio_etapas_negocio_id_negocios_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");--> statement-breakpoint
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_corretor_id_users_id_fkey" FOREIGN KEY ("corretor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_cliente_id_clientes_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id");--> statement-breakpoint
ALTER TABLE "whatsapp_conexoes" ADD CONSTRAINT "whatsapp_conexoes_corretor_id_users_id_fkey" FOREIGN KEY ("corretor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "whatsapp_conexoes" ADD CONSTRAINT "whatsapp_conexoes_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");