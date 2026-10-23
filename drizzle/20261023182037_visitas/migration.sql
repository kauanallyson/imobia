CREATE TABLE "datas_bloqueadas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"imobiliaria_id" uuid NOT NULL,
	"corretor_id" uuid NOT NULL,
	"data" date NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "datas_bloqueadas_corretor_data" UNIQUE("corretor_id","data")
);
--> statement-breakpoint
CREATE TABLE "disponibilidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"imobiliaria_id" uuid NOT NULL,
	"corretor_id" uuid NOT NULL,
	"dia_da_semana" integer NOT NULL,
	"inicio" text NOT NULL,
	"fim" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disponibilidades_corretor_dia_inicio" UNIQUE("corretor_id","dia_da_semana","inicio"),
	CONSTRAINT "disponibilidades_dia_da_semana" CHECK ("dia_da_semana" between 0 and 6),
	CONSTRAINT "disponibilidades_inicio_fim" CHECK ("inicio" < "fim")
);
--> statement-breakpoint
CREATE TABLE "lembretes_de_visita" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"visita_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lembretes_de_visita_visita_tipo" UNIQUE("visita_id","tipo")
);
--> statement-breakpoint
CREATE TABLE "visitas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"imobiliaria_id" uuid NOT NULL,
	"corretor_id" uuid NOT NULL,
	"negocio_id" uuid NOT NULL,
	"data_hora" timestamp with time zone NOT NULL,
	"local" text NOT NULL,
	"latitude" numeric(9,6),
	"longitude" numeric(9,6),
	"estado" text DEFAULT 'agendada' NOT NULL,
	"evento_calendar_id" text,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "empreendimentos" ADD COLUMN "latitude" numeric(9,6);--> statement-breakpoint
ALTER TABLE "empreendimentos" ADD COLUMN "longitude" numeric(9,6);--> statement-breakpoint
CREATE INDEX "visitas_corretor_id_idx" ON "visitas" ("corretor_id");--> statement-breakpoint
CREATE INDEX "visitas_negocio_id_idx" ON "visitas" ("negocio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "visitas_corretor_data_hora_ativa" ON "visitas" ("corretor_id","data_hora") WHERE "estado" in ('agendada', 'remarcada');--> statement-breakpoint
ALTER TABLE "datas_bloqueadas" ADD CONSTRAINT "datas_bloqueadas_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");--> statement-breakpoint
ALTER TABLE "datas_bloqueadas" ADD CONSTRAINT "datas_bloqueadas_corretor_id_users_id_fkey" FOREIGN KEY ("corretor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "disponibilidades" ADD CONSTRAINT "disponibilidades_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");--> statement-breakpoint
ALTER TABLE "disponibilidades" ADD CONSTRAINT "disponibilidades_corretor_id_users_id_fkey" FOREIGN KEY ("corretor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "lembretes_de_visita" ADD CONSTRAINT "lembretes_de_visita_visita_id_visitas_id_fkey" FOREIGN KEY ("visita_id") REFERENCES "visitas"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");--> statement-breakpoint
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_corretor_id_users_id_fkey" FOREIGN KEY ("corretor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_negocio_id_negocios_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;