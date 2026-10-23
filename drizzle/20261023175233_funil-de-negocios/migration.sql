ALTER TABLE "negocio_etapas" ADD COLUMN "autor" text DEFAULT 'sistema' NOT NULL;--> statement-breakpoint
ALTER TABLE "negocios" ADD COLUMN "lote_interesse_id" uuid;--> statement-breakpoint
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_lote_interesse_id_lotes_id_fkey" FOREIGN KEY ("lote_interesse_id") REFERENCES "lotes"("id");