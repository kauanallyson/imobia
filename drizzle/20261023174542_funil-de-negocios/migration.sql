ALTER TABLE "negocio_etapas" ADD COLUMN "autor" text DEFAULT 'sistema' NOT NULL;--> statement-breakpoint
ALTER TABLE "negocios" ADD COLUMN "lote_interesse_id" uuid;