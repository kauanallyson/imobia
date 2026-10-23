CREATE TABLE "materiais_de_marketing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"empreendimento_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"tipo_de_arquivo" text NOT NULL,
	"destino" text NOT NULL,
	"chave" text NOT NULL UNIQUE,
	"content_type" text NOT NULL,
	"tamanho" integer NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planos_de_pagamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"empreendimento_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"percentual_de_entrada" numeric(5,2) NOT NULL,
	"numero_de_parcelas" integer NOT NULL,
	"condicoes" text DEFAULT '' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planos_de_pagamento_percentual" CHECK ("percentual_de_entrada" >= 0 and "percentual_de_entrada" <= 100),
	CONSTRAINT "planos_de_pagamento_parcelas" CHECK ("numero_de_parcelas" >= 1)
);
--> statement-breakpoint
CREATE INDEX "materiais_de_marketing_empreendimento_id_idx" ON "materiais_de_marketing" ("empreendimento_id");--> statement-breakpoint
CREATE INDEX "planos_de_pagamento_empreendimento_id_idx" ON "planos_de_pagamento" ("empreendimento_id");--> statement-breakpoint
ALTER TABLE "materiais_de_marketing" ADD CONSTRAINT "materiais_de_marketing_7cLOsXr6MB4P_fkey" FOREIGN KEY ("empreendimento_id") REFERENCES "empreendimentos"("id");--> statement-breakpoint
ALTER TABLE "planos_de_pagamento" ADD CONSTRAINT "planos_de_pagamento_empreendimento_id_empreendimentos_id_fkey" FOREIGN KEY ("empreendimento_id") REFERENCES "empreendimentos"("id");