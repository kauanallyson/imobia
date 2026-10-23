CREATE TABLE "empreendimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"imobiliaria_id" uuid NOT NULL,
	"incorporadora_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cidade" text NOT NULL,
	"endereco" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incorporadoras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"imobiliaria_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"empreendimento_id" uuid NOT NULL,
	"quadra" text NOT NULL,
	"numero" text NOT NULL,
	"area" numeric(12,2) NOT NULL,
	"frente" numeric(12,2) NOT NULL,
	"fundo" numeric(12,2) NOT NULL,
	"preco" numeric(14,2) NOT NULL,
	"status" text DEFAULT 'disponivel' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lotes_empreendimento_quadra_numero" UNIQUE("empreendimento_id","quadra","numero")
);
--> statement-breakpoint
CREATE TABLE "modelos_de_casa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"empreendimento_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"area_construida" numeric(12,2) NOT NULL,
	"quartos" integer NOT NULL,
	"banheiros" integer NOT NULL,
	"suites" integer NOT NULL,
	"vagas" integer NOT NULL,
	"preco" numeric(14,2) NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "empreendimentos_imobiliaria_id_idx" ON "empreendimentos" ("imobiliaria_id");--> statement-breakpoint
CREATE INDEX "empreendimentos_incorporadora_id_idx" ON "empreendimentos" ("incorporadora_id");--> statement-breakpoint
CREATE INDEX "incorporadoras_imobiliaria_id_idx" ON "incorporadoras" ("imobiliaria_id");--> statement-breakpoint
CREATE INDEX "modelos_de_casa_empreendimento_id_idx" ON "modelos_de_casa" ("empreendimento_id");--> statement-breakpoint
ALTER TABLE "empreendimentos" ADD CONSTRAINT "empreendimentos_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");--> statement-breakpoint
ALTER TABLE "empreendimentos" ADD CONSTRAINT "empreendimentos_incorporadora_id_incorporadoras_id_fkey" FOREIGN KEY ("incorporadora_id") REFERENCES "incorporadoras"("id");--> statement-breakpoint
ALTER TABLE "incorporadoras" ADD CONSTRAINT "incorporadoras_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_empreendimento_id_empreendimentos_id_fkey" FOREIGN KEY ("empreendimento_id") REFERENCES "empreendimentos"("id");--> statement-breakpoint
ALTER TABLE "modelos_de_casa" ADD CONSTRAINT "modelos_de_casa_empreendimento_id_empreendimentos_id_fkey" FOREIGN KEY ("empreendimento_id") REFERENCES "empreendimentos"("id");