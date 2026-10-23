CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "trechos_de_conhecimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"empreendimento_id" uuid NOT NULL,
	"imobiliaria_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"texto" text NOT NULL,
	"embedding" vector(1536) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "empreendimentos" ADD COLUMN "base_de_conhecimento" text;--> statement-breakpoint
CREATE INDEX "trechos_de_conhecimento_empreendimento_id_idx" ON "trechos_de_conhecimento" ("empreendimento_id");--> statement-breakpoint
CREATE INDEX "trechos_de_conhecimento_imobiliaria_id_idx" ON "trechos_de_conhecimento" ("imobiliaria_id");--> statement-breakpoint
CREATE INDEX "trechos_de_conhecimento_embedding_idx" ON "trechos_de_conhecimento" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
ALTER TABLE "trechos_de_conhecimento" ADD CONSTRAINT "trechos_de_conhecimento_qWNqzKmpC40e_fkey" FOREIGN KEY ("empreendimento_id") REFERENCES "empreendimentos"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "trechos_de_conhecimento" ADD CONSTRAINT "trechos_de_conhecimento_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");