CREATE TYPE "public"."availability" AS ENUM('available', 'reserved', 'sold');--> statement-breakpoint
CREATE TYPE "public"."development_kind" AS ENUM('lot', 'off_plan_house');--> statement-breakpoint
CREATE TABLE "development" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" text NOT NULL,
	"kind" "development_kind" NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"neighborhood" text NOT NULL,
	"address" text,
	"description" text,
	"amenities" text,
	"payment_terms" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" text NOT NULL,
	"development_id" uuid NOT NULL,
	"identifier" text NOT NULL,
	"price_cents" bigint NOT NULL,
	"area_m2" numeric(10, 2),
	"bedrooms" smallint,
	"bathrooms" smallint,
	"parking_spaces" smallint,
	"expected_delivery" date,
	"availability" "availability" DEFAULT 'available' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "property_development_id_identifier_unique" UNIQUE("development_id","identifier")
);
--> statement-breakpoint
ALTER TABLE "development" ADD CONSTRAINT "development_broker_id_user_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property" ADD CONSTRAINT "property_broker_id_user_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property" ADD CONSTRAINT "property_development_id_development_id_fk" FOREIGN KEY ("development_id") REFERENCES "public"."development"("id") ON DELETE cascade ON UPDATE no action;