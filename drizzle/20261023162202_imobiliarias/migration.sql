CREATE TABLE "imobiliarias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"nome" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
