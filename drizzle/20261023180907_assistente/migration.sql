ALTER TABLE "negocios" ADD COLUMN "empreendimento_interesse_id" uuid;--> statement-breakpoint
ALTER TABLE "negocios" ADD COLUMN "interesse" text;--> statement-breakpoint
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_empreendimento_interesse_id_empreendimentos_id_fkey" FOREIGN KEY ("empreendimento_interesse_id") REFERENCES "empreendimentos"("id");