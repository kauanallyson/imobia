CREATE TABLE "google_calendar_conexoes" (
	"corretor_id" uuid PRIMARY KEY,
	"imobiliaria_id" uuid NOT NULL,
	"estado_oauth" text UNIQUE,
	"estado_oauth_expira_em" timestamp with time zone,
	"refresh_token" text,
	"access_token" text,
	"token_expira_em" timestamp with time zone,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"sync_token" text,
	"conectada_em" timestamp with time zone,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "google_calendar_conexoes_imobiliaria_id_idx" ON "google_calendar_conexoes" ("imobiliaria_id");--> statement-breakpoint
ALTER TABLE "google_calendar_conexoes" ADD CONSTRAINT "google_calendar_conexoes_corretor_id_users_id_fkey" FOREIGN KEY ("corretor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "google_calendar_conexoes" ADD CONSTRAINT "google_calendar_conexoes_imobiliaria_id_imobiliarias_id_fkey" FOREIGN KEY ("imobiliaria_id") REFERENCES "imobiliarias"("id");